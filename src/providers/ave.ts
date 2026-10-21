// AVE (av-entertainments) — port of provider/aventertainments from
// metatube-sdk-go. Product IDs are the site's numeric `pro` codes;
// search keywords/numbers come from the jacket image filenames.

import {
  MovieInfo,
  MovieProvider,
  MovieSearchResult,
  MovieSearcher,
  ProviderError,
  isValidMovieInfo,
  movieInfoToSearchResult,
} from "../types";
import {
  absURL,
  baseMovieInfo,
  collectFields,
  collectPairsSeq,
  fetchPage,
  fetchText,
  parseDateLoose,
} from "../lib/scrape";
import { compareStrings, isSpecial, parseRuntime } from "../lib/textutil";

const MOVIE_URL =
  "https://www.aventertainments.com/dvd/detail?pro=%s&lang=2&culture=ja-JP&cat=29";
const SEARCH_URL =
  "https://www.aventertainments.com/dvd/search?lang=2&cat=29&culture=ja-JP&keyword=%s&searchby=keyword";
// The site's own /dvd/search is hard-gated by a reCAPTCHA v2
// ("verifybot") for datacenter egress — no cookie or header avoids
// it. Search is therefore resolved through web search engines: a
// site:-restricted query finds candidate detail pages, and each
// candidate is verified against its real metadata (the engine page
// text also mentions unrelated "related" products, so unverified
// hits would be false positives).
const DDG_URL = "https://html.duckduckgo.com/html/?q=%s";
const DDG_LITE_URL = "https://lite.duckduckgo.com/lite/?q=%s";
const BING_URL = "https://www.bing.com/search?q=%s";

/** Port of the Go parserNumber(): number from a jacket image URL. */
export function aveParseNumber(s: string): string {
  const m = /\/(?:dvd\d)?([a-z\d-_]+)\.(?:jpe?g|png|gif|webp)/i.exec(s);
  return m ? m[1].toUpperCase() : "";
}

export async function parseAvePage(
  html: string,
  pageURL: string,
  id: string,
): Promise<MovieInfo> {
  const info = baseMovieInfo("AVE", id, pageURL);

  const fields = await collectFields(html, [
    { key: "title", selector: "#MyBody .section-title h3", mode: "text" },
    { key: "summary1", selector: "div.product-description", mode: "text" },
    { key: "summary2", selector: "div#category", mode: "text" },
    { key: "playerCover", selector: "#PlayerCover > img", mode: "attr", attr: "src" },
    { key: "imageSrc", selector: 'link[rel="image_src"]', mode: "attr", attr: "href" },
    { key: "galleryCover", selector: "span.grid-gallery > a", mode: "attr", attr: "href" },
    { key: "hls", selector: "#player1 > source", mode: "attr", attr: "src" },
  ]);
  info.title = (fields.title as string).trim();
  // Go appends the two summary parts trimmed, with no separator.
  info.summary =
    (fields.summary1 as string).trim() + (fields.summary2 as string).trim();
  if (fields.playerCover) {
    info.cover_url = absURL(pageURL, fields.playerCover as string);
    info.thumb_url = info.cover_url.replaceAll("bigcover", "jacket_images");
  }
  if (!info.thumb_url && fields.imageSrc) {
    info.thumb_url = absURL(pageURL, fields.imageSrc as string);
  }
  if (!info.cover_url && fields.galleryCover) {
    info.cover_url = absURL(pageURL, fields.galleryCover as string);
  }
  if (fields.hls) info.preview_video_hls_url = absURL(pageURL, fields.hls as string);

  // Preview images in document order: the screenshot slot REPLACES
  // the list (Go handler semantics), gallery links append.
  {
    const previews: string[] = [];
    const rw = new HTMLRewriter()
      .on("#sscontainerppv123 > img", {
        element(el) {
          const src = el.getAttribute("src");
          if (src) previews.splice(0, previews.length, absURL(pageURL, src));
        },
      })
      .on("div.gallery-block a.lightbox", {
        element(el) {
          const href = el.getAttribute("href");
          if (href) previews.push(absURL(pageURL, href));
        },
      });
    await rw.transform(new Response(html)).text();
    info.preview_images = previews;
  }

  const rows = await collectPairsSeq(html, "div.single-info > span");
  for (const row of rows) {
    switch (row.label) {
      case "商品番号":
        info.number = row.value;
        break;
      case "主演女優":
        info.actors = row.valueTexts;
        break;
      case "スタジオ":
        info.maker = row.value;
        break;
      case "シリーズ":
        info.series = row.value;
        break;
      case "カテゴリ":
        info.genres = row.valueTexts;
        break;
      case "発売日": {
        const first = row.value.split(/\s+/)[0] ?? "";
        info.release_date = parseDateLoose(first);
        break;
      }
      case "収録時間":
        info.runtime = parseRuntime(row.value);
        break;
    }
  }
  if (!info.number) info.number = id;
  return info;
}

export async function parseAveSearch(html: string, pageURL: string): Promise<MovieSearchResult[]> {
  interface Card {
    homepage: string;
    img: string;
    title: string;
  }
  const cards: Card[] = [];
  let cur: Card | null = null;
  const rw = new HTMLRewriter()
    .on("div.single-slider-product", {
      element() {
        cur = { homepage: "", img: "", title: "" };
        cards.push(cur);
      },
    })
    .on("div.single-slider-product a", {
      element(el) {
        if (cur && !cur.homepage) cur.homepage = el.getAttribute("href") ?? "";
      },
    })
    .on("div.single-slider-product a img", {
      element(el) {
        if (cur && !cur.img) cur.img = el.getAttribute("src") ?? "";
      },
    })
    .on("div.single-slider-product p.product-title a", {
      text(t) {
        if (cur) cur.title += t.text;
      },
    });
  await rw.transform(new Response(html)).text();

  const results: MovieSearchResult[] = [];
  for (const c of cards) {
    if (!c.homepage) continue;
    const homepage = absURL(pageURL, c.homepage);
    const id = aveProvider.parseMovieIDFromURL(homepage);
    if (!id) continue;
    const thumb = c.img ? absURL(pageURL, c.img) : "";
    results.push({
      id,
      number: aveParseNumber(thumb),
      title: c.title.trim(),
      provider: "AVE",
      homepage,
      actors: [],
      thumb_url: thumb,
      cover_url: thumb.replaceAll("jacket_images", "bigcover"),
      score: 0,
      release_date: "",
    });
  }
  return results;
}

/**
 * Extract candidate `pro` IDs from a search-engine results page.
 * Result links are redirect-wrapped and URL-encoded (uddg=...), so
 * both the encoded (%2Fdetail%3Fpro%3D) and plain forms are matched.
 */
export function parseAveCandidateIDs(html: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const re = /(?:dvd|ppv)(?:%2F|\/)detail(?:%3F|\?)pro(?:%3D|=)(\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      ids.push(m[1]);
      if (ids.length >= 8) break;
    }
  }
  return ids;
}

export const aveProvider: MovieProvider & MovieSearcher = {
  name: "AVE",
  priority: 998,

  normalizeMovieID(id: string): string {
    return id.trim();
  },

  parseMovieIDFromURL(rawURL: string): string | null {
    try {
      const u = new URL(rawURL);
      const productID = u.searchParams.get("product_id");
      if (productID) return productID;
      const old = /^\/(\d+)\/\d+\/\d+\/product_lists/.exec(u.pathname);
      if (old) return old[1];
      const pro = u.searchParams.get("pro");
      if (pro) return pro;
      return null;
    } catch {
      return null;
    }
  },

  async getMovieInfoByID(id: string): Promise<MovieInfo> {
    const normalized = aveProvider.normalizeMovieID(id);
    if (!normalized) throw new ProviderError(`invalid id: ${id}`, "invalid");
    return aveProvider.getMovieInfoByURL(
      MOVIE_URL.replace("%s", encodeURIComponent(normalized)),
    );
  },

  async getMovieInfoByURL(rawURL: string): Promise<MovieInfo> {
    const id = aveProvider.parseMovieIDFromURL(rawURL);
    if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    const r = await fetchPage(rawURL, {
      providerName: "AVE",
      notFoundMessage: `movie not found: ${id}`,
    });
    const info = await parseAvePage(r.text, rawURL, id);
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    return info;
  },

  normalizeMovieKeyword(keyword: string): string {
    if (isSpecial(keyword)) return "";
    return keyword.trim().toUpperCase();
  },

  async searchMovie(keyword: string): Promise<MovieSearchResult[]> {
    const q = encodeURIComponent(`site:aventertainments.com ${keyword}`);
    // DDG occasionally answers with a transient empty page, so it is
    // tried twice before falling through to the other engines.
    let ids: string[] = [];
    for (const template of [DDG_URL, DDG_URL, DDG_LITE_URL, BING_URL]) {
      try {
        const r = await fetchText(template.replace("%s", q), {
          providerName: "AVE",
        });
        ids = parseAveCandidateIDs(r.text);
      } catch {
        ids = [];
      }
      if (ids.length > 0) break;
    }
    if (ids.length === 0) {
      // Last resort: the site's own search (works only if the egress
      // IP is not bot-gated).
      const url = SEARCH_URL.replace("%s", encodeURIComponent(keyword));
      const r = await fetchPage(url, { providerName: "AVE" });
      return parseAveSearch(r.text, url);
    }

    const settled = await Promise.allSettled(
      ids.slice(0, 8).map((id) => aveProvider.getMovieInfoByID(id)),
    );
    const infos: MovieInfo[] = [];
    for (const s of settled) {
      if (s.status === "fulfilled" && isValidMovieInfo(s.value)) {
        infos.push(s.value);
      }
    }
    const norm = (s: string) => s.toUpperCase().replace(/[-_\s]/g, "");
    const kw = norm(keyword);
    const numberLike = /^[A-Z]+\d+$/.test(kw) || /^\d+$/.test(kw);
    let kept = infos;
    if (numberLike) {
      const exact = infos.filter((i) => norm(i.number) === kw);
      if (exact.length > 0) {
        kept = exact;
      } else {
        // Near misses (e.g. MKD-S03 for MKBD-S03) beat an empty page.
        const near = infos.filter(
          (i) => compareStrings(norm(i.number), kw) >= 0.8,
        );
        if (near.length > 0) kept = near;
      }
    } else if (keyword) {
      const sub = infos.filter(
        (i) =>
          i.title.includes(keyword) ||
          i.summary.includes(keyword) ||
          i.actors.some((a) => a.includes(keyword)) ||
          i.genres.some((g) => g.includes(keyword)),
      );
      if (sub.length > 0) kept = sub;
    }
    return kept.map((i) => movieInfoToSearchResult(i));
  },
};
