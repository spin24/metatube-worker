// DUGA — port of provider/duga from metatube-sdk-go.
// Info: duga.jp PPV page scrape. Search: the results page only lists
// IDs, and like the Go version the top 3 are resolved to full info.

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
  collectPairs,
  extractJsonLd,
  fetchPage,
} from "../lib/scrape";
import { isSpecial, parseRuntime, parseScore } from "../lib/textutil";
import { parseDateLoose } from "../lib/scrape";

const MOVIE_URL = "https://duga.jp/ppv/%s/";
const SEARCH_URL = "https://duga.jp/search/=/q=%s/";

export async function parseDugaPage(
  html: string,
  pageURL: string,
  id: string,
): Promise<MovieInfo> {
  const info = baseMovieInfo("DUGA", id, pageURL);

  const fields = await collectFields(html, [
    { key: "title", selector: "#contentsname", mode: "text" },
    { key: "thumb", selector: "div.imagebox img#productjpg", mode: "attr", attr: "src" },
    { key: "coverLink", selector: "div.imagebox > a", mode: "attr", attr: "href" },
    { key: "ogTitle", selector: 'meta[property="og:title"]', mode: "attr", attr: "content" },
    { key: "ogDesc", selector: 'meta[property="og:description"]', mode: "attr", attr: "content" },
    { key: "ogImage", selector: 'meta[property="og:image"]', mode: "attr", attr: "content" },
    { key: "video", selector: "video.play-video", mode: "attr", attr: "src" },
    { key: "previews", selector: "#digestthumbbox > li a", mode: "attrs", attr: "href" },
    { key: "actors", selector: "ul.performer li a", mode: "texts" },
    { key: "genres", selector: "ul.categorylist li a", mode: "texts" },
    { key: "directors", selector: "ul.director li a", mode: "texts" },
    { key: "scoreAlt", selector: "div.ratingstar-total img", mode: "attr", attr: "alt" },
  ]);
  info.title = (fields.title as string).trim();
  info.thumb_url = fields.thumb ? absURL(pageURL, fields.thumb as string) : "";
  info.cover_url = fields.coverLink ? absURL(pageURL, fields.coverLink as string) : "";
  info.preview_video_url = fields.video ? absURL(pageURL, fields.video as string) : "";
  info.preview_images = (fields.previews as string[]).map((u) => absURL(pageURL, u));
  info.actors = fields.actors as string[];
  info.genres = fields.genres as string[];
  const directors = fields.directors as string[];
  if (directors.length > 0) info.director = directors[0];
  if (fields.scoreAlt) info.score = parseScore(fields.scoreAlt as string);

  // Summary: JSON-LD description, og:description fallback.
  for (const block of extractJsonLd(html)) {
    const desc = block["description"];
    if (typeof desc === "string" && desc) {
      info.summary = desc;
      break;
    }
  }
  if (!info.title) info.title = (fields.ogTitle as string).trim();
  if (!info.summary) info.summary = (fields.ogDesc as string).trim();
  if (!info.thumb_url && fields.ogImage) {
    info.thumb_url = absURL(pageURL, fields.ogImage as string);
  }

  const rows = await collectPairs(html, "div.summaryinner th", "div.summaryinner td");
  for (const row of rows) {
    switch (row.label) {
      case "配信開始日":
      case "発売日":
        if (!info.release_date) info.release_date = parseDateLoose(row.value);
        break;
      case "メーカー":
        info.maker = row.value;
        break;
      case "レーベル":
        info.label = row.value;
        break;
      case "作品ID":
        // The Go version lets the page's own product ID replace the
        // URL-derived one.
        info.id = row.value;
        break;
      case "メーカー品番":
        info.number = row.value;
        break;
      case "シリーズ":
        info.series = row.value;
        break;
    }
  }

  const dlRows = await collectPairs(html, "div.downloadbox th", "div.downloadbox td");
  for (const row of dlRows) {
    if (row.label === "再生時間" && info.runtime === 0) {
      info.runtime = parseRuntime(row.value);
    }
  }

  if (!info.cover_url) info.cover_url = info.thumb_url;
  if (!info.id) info.id = id;
  if (!info.number) info.number = info.id.toUpperCase();
  return info;
}

/** IDs of the search-result cards, in page order. */
export async function parseDugaSearchIDs(html: string, pageURL: string): Promise<string[]> {
  const ids: string[] = [];
  let inCard = false;
  let got = false;
  const rw = new HTMLRewriter()
    .on("div.contentslist", {
      element() {
        inCard = true;
        got = false;
      },
    })
    .on("#searchresultarea div.contentslist a", {
      element(el) {
        if (inCard && !got) {
          const href = el.getAttribute("href");
          if (href) {
            const parsed = dugaProvider.parseMovieIDFromURL(absURL(pageURL, href));
            if (parsed) ids.push(parsed);
            got = true;
          }
        }
      },
    });
  await rw.transform(new Response(html)).text();
  return ids;
}

export const dugaProvider: MovieProvider & MovieSearcher = {
  name: "DUGA",
  priority: 998,

  normalizeMovieID(id: string): string {
    return id.trim().toLowerCase();
  },

  parseMovieIDFromURL(rawURL: string): string | null {
    try {
      const parts = new URL(rawURL).pathname.split("/").filter(Boolean);
      const base = parts[parts.length - 1] ?? "";
      return base ? dugaProvider.normalizeMovieID(decodeURIComponent(base)) : null;
    } catch {
      return null;
    }
  },

  async getMovieInfoByID(id: string): Promise<MovieInfo> {
    const normalized = dugaProvider.normalizeMovieID(id);
    if (!normalized) throw new ProviderError(`invalid id: ${id}`, "invalid");
    return dugaProvider.getMovieInfoByURL(MOVIE_URL.replace("%s", normalized));
  },

  async getMovieInfoByURL(rawURL: string): Promise<MovieInfo> {
    const id = dugaProvider.parseMovieIDFromURL(rawURL);
    if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    const r = await fetchPage(rawURL, {
      providerName: "DUGA",
      notFoundMessage: `movie not found: ${id}`,
    });
    const info = await parseDugaPage(r.text, rawURL, id);
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
    const r = await fetchPage(url, { providerName: "DUGA" });
    const ids = await parseDugaSearchIDs(r.text, url);
    // Like the Go version: resolve only the top 3 hits to full info.
    const settled = await Promise.allSettled(
      ids.slice(0, 3).map((id) => dugaProvider.getMovieInfoByID(id)),
    );
    const results: MovieSearchResult[] = [];
    for (const s of settled) {
      if (s.status === "fulfilled" && isValidMovieInfo(s.value)) {
        results.push(movieInfoToSearchResult(s.value));
      }
    }
    return results;
  },
};
