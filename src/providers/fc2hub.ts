// fc2hub — slim port of provider/fc2hub from metatube-sdk-go. The
// provider now targets javten.com; IDs are dual "{cat}-{video}" and
// pages carry schema.org JSON-LD (Movie + CreativeWorkSeries), which
// this port uses as the primary source (the Go version's positional
// DOM XPaths into #content duplicate the same fields; the gallery
// anchors are kept). Search is a redirect probe: /search?kw={number}
// redirects straight to the video page when there is an exact match.

import {
  MovieInfo,
  MovieProvider,
  MovieSearchResult,
  ProviderError,
  movieInfoToSearchResult,
  isValidMovieInfo,
} from "../types";
import {
  absURL,
  baseMovieInfo,
  collectFields,
  extractJsonLd,
  fetchPage,
  fetchText,
  parseDateLoose,
} from "../lib/scrape";
import { parseRuntime } from "../lib/textutil";

const MOVIE_URL = "https://javten.com/video/%s/id%s/%s";
const SEARCH_URL = "https://javten.com/search?kw=%s";

/** Port of fc2util.ParseNumber with the fc2pattern regex. */
export function fc2ParseNumber(id: string): string {
  const m = /^(?:FC2(?:[-_\s]?PPV)?[-_\s]?)?(\d+)$/i.exec(id.trim());
  return m ? m[1] : "";
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean);
}

export async function parseFc2hubPage(
  html: string,
  pageURL: string,
  id: string,
): Promise<MovieInfo> {
  const info = baseMovieInfo("fc2hub", id, pageURL);

  const fields = await collectFields(html, [
    { key: "h1", selector: "#content h1", mode: "text" },
    { key: "previews", selector: 'a[data-fancybox="gallery"]', mode: "attrs", attr: "href" },
  ]);
  for (const href of fields.previews as string[]) {
    if (href) info.preview_images.push(absURL(pageURL, href));
  }

  for (const block of extractJsonLd(html)) {
    const type = str(block["@type"]);
    if (type === "Movie") {
      if (str(block["name"])) info.title = str(block["name"]);
      if (!info.summary) info.summary = str(block["description"]);
      if (str(block["director"])) info.maker = str(block["director"]);
      if (info.genres.length === 0) info.genres = strList(block["genre"]);
      const actors = strList(block["actor"]);
      if (actors.length > 0) info.actors = actors;
      const identifiers = Array.isArray(block["identifier"]) ? block["identifier"] : [];
      for (const identifier of identifiers) {
        if (typeof identifier !== "string") continue;
        const num = fc2ParseNumber(identifier);
        if (num) {
          info.number = `FC2-${num}`;
          break;
        }
      }
      info.cover_url = str(block["image"]);
      info.release_date = parseDateLoose(str(block["datePublished"]));
      info.runtime = parseRuntime(str(block["duration"]));
    } else if (type === "CreativeWorkSeries") {
      const rating = (block["aggregateRating"] ?? {}) as Record<string, unknown>;
      if (typeof rating["ratingValue"] === "number") {
        info.score = rating["ratingValue"] as number;
      }
    }
  }

  // The in-page FC2 number heading wins over identifiers when present.
  const h1Text = (fields.h1 as string).trim();
  const h1Num = fc2ParseNumber(h1Text);
  if (h1Num) info.number = `FC2-${h1Num}`;
  else if (h1Text && !info.title) info.title = h1Text;

  if (!info.cover_url && info.preview_images.length > 0) {
    info.cover_url = info.preview_images[0];
  }
  info.thumb_url = info.cover_url;

  if (info.id && info.number.length > 4 && info.title) {
    const a = info.id.split("-", 2)[0];
    info.homepage =
      MOVIE_URL.replace("%s", a)
        .replace("%s", info.number.slice(4))
        .replace("%s", encodeURIComponent(info.title));
  }
  return info;
}

export const fc2hubProvider: MovieProvider & {
  normalizeMovieKeyword(keyword: string): string;
  searchMovie(keyword: string): Promise<MovieSearchResult[]>;
} = {
  name: "fc2hub",
  priority: 999,

  normalizeMovieID(id: string): string {
    return id.trim();
  },

  parseMovieIDFromURL(rawURL: string): string | null {
    try {
      const m = /\/video\/(\d+)\/id(\d+)/.exec(new URL(rawURL).pathname);
      return m ? `${m[1]}-${m[2]}` : null;
    } catch {
      return null;
    }
  },

  async getMovieInfoByID(id: string): Promise<MovieInfo> {
    const ss = id.trim().split("-", 2);
    if (ss.length !== 2 || !ss[0] || !ss[1]) {
      throw new ProviderError(`invalid id: ${id}`, "invalid");
    }
    const url =
      MOVIE_URL.replace("%s", ss[0]).replace("%s", ss[1]).replace("%s", "%20");
    return fc2hubProvider.getMovieInfoByURL(url);
  },

  async getMovieInfoByURL(rawURL: string): Promise<MovieInfo> {
    const id = fc2hubProvider.parseMovieIDFromURL(rawURL);
    if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    const r = await fetchPage(rawURL, {
      providerName: "fc2hub",
      notFoundMessage: `movie not found: ${id}`,
    });
    const info = await parseFc2hubPage(r.text, rawURL, id);
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    return info;
  },

  normalizeMovieKeyword(keyword: string): string {
    return fc2ParseNumber(keyword);
  },

  async searchMovie(keyword: string): Promise<MovieSearchResult[]> {
    const url = SEARCH_URL.replace("%s", encodeURIComponent(keyword));
    const r = await fetchText(url, { providerName: "fc2hub", redirect: "manual" });
    const loc = r.headers.get("location");
    if (!loc) return [];
    const target = absURL(url, loc);
    let pathname = "";
    try {
      pathname = new URL(target).pathname;
    } catch {
      return [];
    }
    if (!/\/video\/\d+\/id\d+/.test(pathname)) return [];
    const info = await fc2hubProvider.getMovieInfoByURL(target);
    return [movieInfoToSearchResult(info)];
  },
};
