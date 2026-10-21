// JavBus provider — slim port of provider/javbus from metatube-sdk-go.
//
// The Go version scrapes https://www.javbus.com/ja/{ID} with colly/XPath.
// This port fetches the same Japanese page and extracts with HTMLRewriter
// (native streaming parser — the only HTML option that fits the Workers
// free-tier 10 ms CPU budget; a JS DOM would not).
//
// Field mapping mirrors the Go XPath handlers one-to-one. Differences:
//   - The Go version probes thumb URLs with HEAD requests; this port just
//     applies the /cover/ -> /thumb/ URL transform (JavBus convention).
//   - No summary / score / preview video: JavBus pages do not carry them.

import {
  MovieInfo,
  MovieProvider,
  MovieSearchResult,
  ProviderError,
  isValidMovieInfo,
  isValidSearchResult,
  movieInfoToSearchResult,
} from "../types";
import { isSpecial } from "../lib/textutil";

const BASE_URL = "https://www.javbus.com/";
const MOVIE_URL = "https://www.javbus.com/ja/";

export class JavbusProvider implements MovieProvider {
  readonly name = "JavBus";
  readonly priority = 995;

  normalizeMovieID(id: string): string {
    return javbusNormalizeID(id);
  }

  parseMovieIDFromURL(rawURL: string): string | null {
    try {
      const url = new URL(rawURL);
      const base = url.pathname.split("/").filter(Boolean).pop();
      return base ? this.normalizeMovieID(base) : null;
    } catch {
      return null;
    }
  }

  async getMovieInfoByID(id: string): Promise<MovieInfo> {
    const normalized = this.normalizeMovieID(id);
    if (!normalized) {
      throw new ProviderError("invalid id", "invalid");
    }
    return this.getMovieInfoByURL(MOVIE_URL + normalized);
  }

  async getMovieInfoByURL(rawURL: string): Promise<MovieInfo> {
    const id = this.parseMovieIDFromURL(rawURL);
    if (!id) {
      throw new ProviderError(`cannot parse movie id from url: ${rawURL}`, "invalid");
    }
    let resp: Response;
    try {
      resp = await fetch(rawURL, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Referer: BASE_URL,
          Cookie: "dv=1; existmag=all; age=verified",
        },
        redirect: "follow",
      });
    } catch (e) {
      throw new ProviderError(`javbus fetch failed: ${String(e)}`, "upstream");
    }
    if (resp.status === 404) {
      throw new ProviderError(`movie not found: ${id}`, "not_found");
    }
    if (!resp.ok) {
      throw new ProviderError(`javbus http ${resp.status}`, "upstream");
    }
    const info = await parseJavbusPage(resp, rawURL, id);
    if (!isValidMovieInfo(info)) {
      // Unknown IDs redirect to a search page without a bigImage block,
      // which lands here with an empty title/cover.
      throw new ProviderError(`movie not found: ${id}`, "not_found");
    }
    return info;
  }

  normalizeMovieKeyword(keyword: string): string {
    return javbusNormalizeKeyword(keyword);
  }

  async searchMovie(keyword: string): Promise<MovieSearchResult[]> {
    return javbusSearchMovie(keyword);
  }
}

export async function parseJavbusPage(
  resp: Response,
  pageURL: string,
  id: string,
): Promise<MovieInfo> {
  const info: MovieInfo = {
    id,
    number: "",
    title: "",
    summary: "",
    provider: "JavBus",
    homepage: pageURL,
    director: "",
    actors: [],
    thumb_url: "",
    cover_url: "",
    preview_video_url: "",
    preview_video_hls_url: "",
    preview_images: [],
    maker: "",
    label: "",
    series: "",
    genres: [],
    score: 0,
    runtime: 0,
    release_date: "",
  };
  const abs = (u: string) => new URL(u, pageURL).toString();

  let pText = "";
  let genreText = "";

  const rewriter = new HTMLRewriter()
    // a.bigImage > img: title attr is the full title, src is the cover.
    .on("a.bigImage img", {
      element(el) {
        info.title = el.getAttribute("title") ?? "";
        const src = el.getAttribute("src");
        if (src) info.cover_url = abs(src);
      },
    })
    // div.info p rows: "<span class=header>LABEL:</span> value"
    .on("div.info p", {
      element(el) {
        pText = "";
        el.onEndTag(() => applyInfoLine(pText, info));
      },
      text(t) {
        pText += t.text;
      },
    })
    // span.genre > label > a: genre names.
    .on("span.genre label a", {
      element(el) {
        genreText = "";
        el.onEndTag(() => {
          const g = genreText.trim();
          if (g) info.genres.push(g);
        });
      },
      text(t) {
        genreText += t.text;
      },
    })
    // #sample-waterfall > a: preview image URLs.
    .on("#sample-waterfall a", {
      element(el) {
        const href = el.getAttribute("href");
        if (href) info.preview_images.push(abs(href));
      },
    })
    // div.star-name > a: actor names live in the title attr.
    .on("div.star-name a", {
      element(el) {
        const name = el.getAttribute("title");
        if (name && !info.actors.includes(name)) info.actors.push(name);
      },
    });

  // Consume the transformed body to drive the handlers.
  await rewriter.transform(resp).text();

  // Thumb: /cover/{code}_b.jpg -> /thumb/{code}.jpg (no HEAD probe).
  const m = /\/cover\/([a-z\d]+)(?:_b)?\.(jpg|png)/i.exec(info.cover_url);
  if (m) {
    info.thumb_url = info.cover_url.replace(
      /\/cover\/[a-z\d]+(?:_b)?\.(jpg|png)/i,
      `/thumb/${m[1]}.${m[2]}`,
    );
  }
  return info;
}

function applyInfoLine(raw: string, info: MovieInfo): void {
  const t = raw.replace(/\s+/g, " ").trim();
  const idx = t.indexOf(":");
  if (idx < 0) return;
  const label = t.slice(0, idx + 1);
  const value = t.slice(idx + 1).trim();
  switch (label) {
    case "品番:":
      info.number = value;
      break;
    case "発売日:":
      info.release_date = parseDate(value.split(" ").pop() ?? "");
      break;
    case "収録時間:":
      info.runtime = parseRuntimeMinutes(value.split(" ").pop() ?? "");
      break;
    case "監督:":
      info.director = value;
      break;
    case "メーカー:":
      info.maker = value;
      break;
    case "レーベル:":
      info.label = value;
      break;
    case "シリーズ:":
      info.series = value;
      break;
  }
}

function parseDate(s: string): string {
  const m = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s);
  if (!m) return "";
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

/** Port of parser.ParseRuntime: "120分" -> 120, "2:00:00" -> 120. */
function parseRuntimeMinutes(s: string): number {
  s = s
    .toLowerCase()
    .replace(/秒/g, "s")
    .replace(/分/g, "m")
    .replace(/[時时]/g, "h")
    .replace(/sec/g, "s")
    .replace(/min/g, "m")
    .replace(/\s+/g, "");
  let m = /(\d+):(\d+):(\d+)/.exec(s);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  m = /(\d+):(\d+)/.exec(s);
  if (m) return parseInt(m[1], 10);
  let seconds = 0;
  let matched = false;
  for (const g of s.matchAll(/(\d+)(h|m|s)?/g)) {
    const n = parseInt(g[1], 10);
    if (Number.isNaN(n)) continue;
    matched = true;
    if (g[2] === "h") seconds += n * 3600;
    else if (g[2] === "s") seconds += n;
    else seconds += n * 60; // "m" or bare number = minutes on JavBus
  }
  return matched ? Math.floor(seconds / 60) : 0;
}

const SEARCH_URL = "https://www.javbus.com/ja/search/";
const SEARCH_UNCENSORED_URL = "https://www.javbus.com/ja/uncensored/search/";
// JavBus accepts regular-looking numbers even when they are "special".
const JAVBUS_KEYWORD_RE = /^([\d-_]{4,}|[a-z]{1,4}\d{2,4}|heyzo[-_].+)$/i;

// LABEL_NUMBER_RE matches a number without the dash between the label
// and the number, e.g. ssis277 (upstream PR #382).
const LABEL_NUMBER_RE = /^([a-z]{2,})(\d+)$/i;

/** JavBus page URLs always contain the dashed number form. */
export function javbusNormalizeID(id: string): string {
  return id.trim().replace(LABEL_NUMBER_RE, "$1-$2").toUpperCase();
}

export function javbusNormalizeKeyword(keyword: string): string {
  if (isSpecial(keyword)) {
    if (!JAVBUS_KEYWORD_RE.test(keyword)) {
      return ""; // JavBus has no those special contents.
    }
    return keyword.toUpperCase();
  }
  return javbusNormalizeID(keyword);
}

export async function javbusSearchMovie(
  keyword: string,
): Promise<MovieSearchResult[]> {
  const urls = [
    SEARCH_URL + encodeURIComponent(keyword),
    SEARCH_UNCENSORED_URL + encodeURIComponent(keyword),
  ];
  const settled = await Promise.allSettled(
    urls.map(async (u) => {
      const resp = await fetch(u, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Referer: BASE_URL,
          Cookie: "dv=1; existmag=all; age=verified",
        },
        redirect: "follow",
      });
      if (!resp.ok) {
        throw new ProviderError(`javbus search http ${resp.status}`, "upstream");
      }
      return parseJavbusSearchPage(resp, u);
    }),
  );
  const results: MovieSearchResult[] = [];
  let lastError: unknown;
  for (const s of settled) {
    if (s.status === "fulfilled") {
      results.push(...s.value);
    } else {
      lastError = s.reason;
    }
  }
  if (results.length === 0 && lastError) {
    throw lastError instanceof ProviderError
      ? lastError
      : new ProviderError(`javbus search failed: ${String(lastError)}`, "upstream");
  }
  // JavBus search sometimes omits movies whose detail pages are still
  // accessible by number (upstream issue #381, PR #382). Fall back to
  // the detail page directly, but only for keywords JavBus may have.
  if (results.length === 0) {
    const id = javbusNormalizeKeyword(keyword);
    if (id) {
      try {
        const info = await new JavbusProvider().getMovieInfoByID(id);
        if (isValidMovieInfo(info)) {
          results.push(movieInfoToSearchResult(info));
        }
      } catch {
        // not fetchable by ID either — keep the empty result
      }
    }
  }
  return results;
}

/**
 * Parse one JavBus search results page — mirrors the Go movie-box handler:
 * a.movie-box > div.photo-frame img (thumb), div.photo-info span (title on
 * the first line), and the two <date> elements (number, release date).
 * Cover is guessed from the thumb URL, like the Go version does.
 */
export async function parseJavbusSearchPage(
  resp: Response,
  pageURL: string,
): Promise<MovieSearchResult[]> {
  const results: MovieSearchResult[] = [];
  const abs = (u: string) => new URL(u, pageURL).toString();

  interface Card {
    homepage: string;
    id: string;
    thumb: string;
    spanText: string;
    dateText: string;
    dateCount: number;
    number: string;
    release: string;
  }
  let card: Card | null = null;

  const finalize = () => {
    if (!card) return;
    const title = (card.spanText.trim().split("\n")[0] ?? "").trim();
    let cover = "";
    const m = /\/thumbs?\/([a-z\d]+)(?:_b)?\.(jpg|png)/i.exec(card.thumb);
    if (m) {
      cover = card.thumb.replace(
        /\/thumbs?\/[a-z\d]+(?:_b)?\.(jpg|png)/i,
        `/cover/${m[1]}_b.${m[2]}`,
      );
    }
    const result: MovieSearchResult = {
      id: card.id,
      number: card.number,
      title,
      provider: "JavBus",
      homepage: card.homepage,
      actors: [],
      thumb_url: card.thumb,
      cover_url: cover,
      score: 0,
      release_date: card.release,
    };
    if (isValidSearchResult(result)) {
      results.push(result);
    }
    card = null;
  };

  const rewriter = new HTMLRewriter()
    .on("a.movie-box", {
      element(el) {
        const href = el.getAttribute("href") ?? "";
        card = {
          homepage: abs(href),
          id: href.split("/").filter(Boolean).pop()?.toUpperCase() ?? "",
          thumb: "",
          spanText: "",
          dateText: "",
          dateCount: 0,
          number: "",
          release: "",
        };
        el.onEndTag(finalize);
      },
    })
    .on("a.movie-box img", {
      element(el) {
        if (card && !card.thumb) {
          const src = el.getAttribute("src");
          if (src) card.thumb = abs(src);
        }
      },
    })
    .on("a.movie-box .photo-info span", {
      text(t) {
        if (card) card.spanText += t.text;
      },
    })
    .on("a.movie-box date", {
      element(el) {
        if (!card) return;
        card.dateText = "";
        const c = card;
        el.onEndTag(() => {
          c.dateCount += 1;
          const v = c.dateText.trim();
          if (c.dateCount === 1) c.number = v;
          else if (c.dateCount === 2) c.release = parseDate(v);
        });
      },
      text(t) {
        if (card) card.dateText += t.text;
      },
    });

  await rewriter.transform(resp).text();
  return results;
}
