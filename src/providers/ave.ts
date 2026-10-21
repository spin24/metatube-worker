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
} from "../types";
import {
  absURL,
  baseMovieInfo,
  collectFields,
  collectPairsSeq,
  fetchPage,
  parseDateLoose,
} from "../lib/scrape";
import { isSpecial, parseRuntime } from "../lib/textutil";

const MOVIE_URL =
  "https://www.aventertainments.com/dvd/detail?pro=%s&lang=2&culture=ja-JP&cat=29";
const SEARCH_URL =
  "https://www.aventertainments.com/dvd/search?lang=2&cat=29&culture=ja-JP&keyword=%s&searchby=keyword";

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
    const url = SEARCH_URL.replace("%s", encodeURIComponent(keyword));
    const r = await fetchPage(url, { providerName: "AVE" });
    return parseAveSearch(r.text, url);
  },
};
