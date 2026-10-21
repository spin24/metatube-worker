// FC2 — port of provider/fc2 from metatube-sdk-go.
// Info: adult.contents.fc2.com article page scrape (no search in Go).
// The page title embeds hidden spam spans (inline styles such as
// zoom:0.01 / display:none / overflow:hidden) that the Go version
// strips before reading the text; the summary lives in an iframe
// subdocument, fetched separately like Go does.

import {
  MovieInfo,
  MovieProvider,
  ProviderError,
  isValidMovieInfo,
} from "../types";
import {
  absURL,
  baseMovieInfo,
  collectFields,
  decodeEntities,
  fetchPage,
  fetchText,
  parseDateLoose,
} from "../lib/scrape";
import { parseRuntime, parseScore } from "../lib/textutil";
import { fc2ParseNumber } from "./fc2hub";

const MOVIE_URL = "https://adult.contents.fc2.com/article/%s/";

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** Remove the hidden spam spans Go strips, then read the text. */
export function cleanFc2Title(innerHTML: string): string {
  const cleaned = innerHTML.replace(
    /<span[^>]*style="[^"]*(?:zoom:\s*0\.01|display:\s*none|overflow:\s*hidden)[^"]*"[^>]*>[\s\S]*?<\/span>/gi,
    "",
  );
  return stripTags(cleaned);
}

export async function parseFc2Page(
  html: string,
  pageURL: string,
  id: string,
): Promise<MovieInfo> {
  const info = baseMovieInfo("FC2", id, pageURL);
  info.number = `FC2-${id}`;

  const h3 =
    /<div class="items_article_headerInfo"[^>]*>[\s\S]*?<h3>([\s\S]*?)<\/h3>/.exec(
      html,
    );
  if (h3) info.title = cleanFc2Title(h3[1]);

  const fields = await collectFields(html, [
    {
      key: "genres",
      selector: "div.items_article_headerInfo section.items_article_TagArea a",
      mode: "texts",
    },
    {
      key: "writer",
      selector: "div.items_article_headerInfo li.items_article_writer a",
      mode: "text",
    },
    {
      key: "makerLinks",
      selector: "div.items_article_headerInfo ul li a",
      mode: "texts",
    },
    {
      key: "dateText",
      selector: "div.items_article_Releasedate p",
      mode: "text",
    },
    {
      key: "scoreClass",
      selector: "li.items_article_StarA a p span",
      mode: "attr",
      attr: "class",
    },
    {
      key: "thumb",
      selector: "div.items_article_MainitemThumb span img",
      mode: "attr",
      attr: "src",
    },
    {
      key: "runtimeText",
      selector: "div.items_article_MainitemThumb p.items_article_info",
      mode: "text",
    },
    {
      key: "previews",
      selector: "section.items_article_SampleImages ul li a",
      mode: "attrs",
      attr: "href",
    },
  ]);
  info.genres = (fields.genres as string[]).map((g) => g.trim()).filter(Boolean);
  const writer = (fields.writer as string).trim();
  const makerLinks = (fields.makerLinks as string[])
    .map((t) => t.trim())
    .filter(Boolean);
  info.maker = writer || makerLinks[makerLinks.length - 1] || "";
  const dateText = (fields.dateText as string).trim();
  if (dateText) {
    const tail = dateText.split(":").pop() ?? "";
    const d = parseDateLoose(tail);
    if (d) info.release_date = d;
  }
  const scoreClass = (fields.scoreClass as string) || "";
  const scoreDigits = /(\d+)$/.exec(scoreClass.trim());
  if (scoreDigits) info.score = parseScore(scoreDigits[1]);
  info.thumb_url = fields.thumb ? absURL(pageURL, fields.thumb as string) : "";
  info.runtime = parseRuntime((fields.runtimeText as string) || "");
  info.preview_images = (fields.previews as string[]).map((u) =>
    absURL(pageURL, u),
  );

  // Extra key/value rows (販売日 / 商品ID), split on ":" like Go.
  for (const m of html.matchAll(
    /<div class="items_article_softDevice"><p>([\s\S]*?)<\/p><\/div>/g,
  )) {
    const text = stripTags(m[1]);
    const cut = text.indexOf(":");
    if (cut < 0) continue;
    const key = text.slice(0, cut).trim();
    const value = text.slice(cut + 1).trim();
    if (key === "Sale Day" || key === "販売日") {
      const d = parseDateLoose(value);
      if (d) info.release_date = d;
    } else if (key === "Product ID" || key === "商品ID") {
      const productID = fc2ParseNumber(value);
      if (productID && productID !== id) {
        throw new ProviderError(
          `ID mismatch: FC2-${id} != FC2-${productID}`,
          "invalid",
        );
      }
    }
  }

  info.cover_url = info.thumb_url || info.preview_images[0] || "";
  return info;
}

/** The summary iframe URL inside the article contents section. */
export function fc2SummaryIframeURL(html: string, pageURL: string): string {
  const m =
    /<section class="items_article_Contents"[^>]*>[\s\S]*?<iframe[^>]+src="([^"]+)"/.exec(
      html,
    );
  return m ? absURL(pageURL, m[1]) : "";
}

export const fc2Provider: MovieProvider = {
  name: "FC2",
  priority: 1000,

  normalizeMovieID(id: string): string {
    return fc2ParseNumber(id);
  },

  parseMovieIDFromURL(rawURL: string): string | null {
    try {
      const parts = new URL(rawURL).pathname.split("/").filter(Boolean);
      const base = parts[parts.length - 1] ?? "";
      return fc2ParseNumber(decodeURIComponent(base)) || null;
    } catch {
      return null;
    }
  },

  async getMovieInfoByID(id: string): Promise<MovieInfo> {
    const normalized = fc2Provider.normalizeMovieID(id);
    if (!normalized) throw new ProviderError(`invalid id: ${id}`, "invalid");
    return fc2Provider.getMovieInfoByURL(MOVIE_URL.replace("%s", normalized));
  },

  async getMovieInfoByURL(rawURL: string): Promise<MovieInfo> {
    const id = fc2Provider.parseMovieIDFromURL(rawURL);
    if (!id) {
      throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    }
    const r = await fetchPage(rawURL, {
      providerName: "FC2",
      notFoundMessage: `movie not found: ${id}`,
    });
    const info = await parseFc2Page(r.text, rawURL, id);
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    // Summary: separate iframe document (best effort, like Go).
    const iframeURL = fc2SummaryIframeURL(r.text, rawURL);
    if (iframeURL) {
      try {
        const sub = await fetchText(iframeURL, {
          providerName: "FC2",
          timeoutMs: 8000,
        });
        const div = /<body[^>]*>\s*<div[^>]*>([\s\S]*?)<\/div>/.exec(sub.text);
        if (div) {
          const text = stripTags(div[1]);
          // The widget currently answers plain fetches with a
          // "failed to load" placeholder; never surface that.
          if (text && !text.includes("読み込みに失敗")) info.summary = text;
        }
      } catch {
        // summary is optional
      }
    }
    return info;
  },
};
