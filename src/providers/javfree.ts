// JAVFREE — port of provider/javfree from metatube-sdk-go.
// FC2-only WordPress site: movies use a dual ID "{post}-{number}" and
// live at /{post}/fc2-ppv-{number}. Search results all carry the
// searched number, exactly as in the Go version.

import {
  MovieInfo,
  MovieProvider,
  MovieSearchResult,
  MovieSearcher,
  ProviderError,
  isValidMovieInfo,
} from "../types";
import {
  absURL,
  baseMovieInfo,
  collectFields,
  decodeEntities,
  fetchPage,
  parseDateLoose,
} from "../lib/scrape";
import { fc2ParseNumber } from "./fc2hub";

const MOVIE_URL = "https://javfree.me/%s/%s";
const SEARCH_URL = "https://javfree.me/?s=%s";

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export async function parseJavfreePage(
  html: string,
  pageURL: string,
  id: string,
): Promise<MovieInfo> {
  const info = baseMovieInfo("JAVFREE", id, pageURL);

  const fields = await collectFields(html, [
    { key: "title", selector: "header.entry-header h1", mode: "text" },
    { key: "previews", selector: "div.entry-content > p img", mode: "attrs", attr: "src" },
  ]);
  // Title with the FC2 number mention stripped (Go regex semantics).
  info.title = (fields.title as string)
    .replace(/FC2(?:[-_]?PPV)?[-_]?\d+/gi, "")
    .trim();
  // Number from the URL's last segment.
  const tail = pageURL.split("/").filter(Boolean).pop() ?? "";
  const num = fc2ParseNumber(tail);
  if (num) info.number = `FC2-${num.replace(/^FC2-/, "")}`;

  // Director + release date from the post-author byline: the director
  // is the <strong> text; the date is the text right after it.
  const authorBlock = /<span class="post-author">([\s\S]*?)<\/span>/.exec(html);
  if (authorBlock) {
    const inner = authorBlock[1];
    const strong = /<strong[^>]*>([\s\S]*?)<\/strong>/.exec(inner);
    if (strong) {
      info.director = stripTags(strong[1]);
      const rest = stripTags(inner.replace(strong[0], " "));
      const date = parseDateLoose(rest.replace(info.director, ""));
      if (date) info.release_date = date;
    }
  }

  info.preview_images = (fields.previews as string[]).filter(Boolean);
  // First preview becomes the cover (Go OnScraped shift).
  if (info.preview_images.length > 0) {
    info.cover_url = info.preview_images[0];
    info.preview_images = info.preview_images.slice(1);
  }
  info.thumb_url = info.cover_url;
  return info;
}

export async function parseJavfreeSearch(
  html: string,
  pageURL: string,
  fc2ID: string,
): Promise<MovieSearchResult[]> {
  interface Card {
    homepage: string;
    title: string;
    thumb: string;
  }
  const cards: Card[] = [];
  let cur: Card | null = null;
  const rw = new HTMLRewriter()
    .on("article.hentry", {
      element() {
        cur = { homepage: "", title: "", thumb: "" };
        cards.push(cur);
      },
    })
    .on("article.hentry h2 a", {
      element(el) {
        if (cur && !cur.homepage) cur.homepage = el.getAttribute("href") ?? "";
      },
      text(t) {
        if (cur) cur.title += t.text;
      },
    })
    .on("article.hentry a div img", {
      element(el) {
        if (cur && !cur.thumb) cur.thumb = el.getAttribute("src") ?? "";
      },
    })
    .on("article.hentry img", {
      element(el) {
        if (cur && !cur.thumb) cur.thumb = el.getAttribute("src") ?? "";
      },
    });
  await rw.transform(new Response(html)).text();

  const results: MovieSearchResult[] = [];
  for (const c of cards) {
    if (!c.homepage) continue;
    const homepage = absURL(pageURL, c.homepage);
    const id = javfreeProvider.parseMovieIDFromURL(homepage);
    if (!id) continue;
    const thumb = c.thumb ? absURL(pageURL, c.thumb) : "";
    const base = thumb.split("/").pop() ?? "";
    results.push({
      id,
      number: `FC2-${fc2ID}`,
      title: c.title.trim(),
      provider: "JAVFREE",
      homepage,
      actors: [],
      thumb_url: thumb,
      cover_url: base ? `https://cf.javfree.me/HLIC/${base}` : "",
      score: 0,
      release_date: "",
    });
  }
  return results;
}

export const javfreeProvider: MovieProvider & MovieSearcher = {
  name: "JAVFREE",
  priority: 993,

  normalizeMovieID(id: string): string {
    return id.trim();
  },

  parseMovieIDFromURL(rawURL: string): string | null {
    try {
      const m = /\/(\d+)\/fc2-ppv-(\d+)/.exec(new URL(rawURL).pathname);
      return m ? `${m[1]}-${m[2]}` : null;
    } catch {
      return null;
    }
  },

  async getMovieInfoByID(id: string): Promise<MovieInfo> {
    const parts = id.split("-", 2);
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new ProviderError(`invalid id: ${id}`, "invalid");
    }
    return javfreeProvider.getMovieInfoByURL(
      MOVIE_URL.replace("%s", parts[0]).replace("%s", `fc2-ppv-${parts[1]}`),
    );
  },

  async getMovieInfoByURL(rawURL: string): Promise<MovieInfo> {
    const id = javfreeProvider.parseMovieIDFromURL(rawURL);
    if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    const r = await fetchPage(rawURL, {
      providerName: "JAVFREE",
      notFoundMessage: `movie not found: ${id}`,
    });
    const info = await parseJavfreePage(r.text, rawURL, id);
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    return info;
  },

  normalizeMovieKeyword(keyword: string): string {
    return fc2ParseNumber(keyword);
  },

  async searchMovie(keyword: string): Promise<MovieSearchResult[]> {
    const fc2ID = keyword.slice(keyword.lastIndexOf("-") + 1);
    const url = SEARCH_URL.replace("%s", encodeURIComponent(fc2ID));
    const r = await fetchPage(url, { providerName: "JAVFREE" });
    return parseJavfreeSearch(r.text, url, fc2ID);
  },
};
