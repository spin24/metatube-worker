// JAVFREE — port of provider/javfree from metatube-sdk-go.
// FC2-only WordPress site: movies use a dual ID "{post}-{number}" and
// live at /{post}/fc2-ppv-{number}. Search goes through the WordPress
// REST API (the front-end ?s= page is WAF-gated from datacenter
// egress), with a search-engine relay as fallback.

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
  decodeEntities,
  fetchPage,
  fetchText,
  parseDateLoose,
} from "../lib/scrape";
import { raceSearchEngines } from "../lib/engines";
import { fc2ParseNumber } from "./fc2hub";

const MOVIE_URL = "https://javfree.me/%s/%s";
const SEARCH_URL = "https://javfree.me/?s=%s";
const WP_SEARCH_URL =
  "https://javfree.me/wp-json/wp/v2/search?search=%s&per_page=10";

/** Composite JAVFREE ids from a wp-json search response body. */
export function parseWpJsonSearchIDs(jsonText: string): string[] {
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const ids: string[] = [];
  for (const item of data) {
    const url = (item as { url?: string })?.url;
    if (!url) continue;
    const id = javfreeProvider.parseMovieIDFromURL(url);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Candidate JAVFREE ids from a search-engine results page. */
export function parseJavfreeCandidateIDs(html: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const re = /javfree\.me(?:%2F|\/)(\d+)(?:%2F|\/)fc2-ppv-(\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const id = `${m[1]}-${m[2]}`;
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
      if (ids.length >= 8) break;
    }
  }
  return ids;
}

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
    const numMatch = /(\d{6,})/.exec(keyword.replace(/,/g, ""));
    const fc2num = numMatch ? numMatch[1] : "";

    // Primary: the WordPress REST search endpoint. The front-end
    // ?s= page is WAF-gated from datacenter egress, but wp-json
    // answers plainly and returns post URLs directly.
    let ids: string[] = [];
    try {
      const api = WP_SEARCH_URL.replace("%s", encodeURIComponent(keyword));
      const r = await fetchText(api, {
        providerName: "JAVFREE",
        timeoutMs: 8000,
      });
      ids = parseWpJsonSearchIDs(r.text);
    } catch {
      ids = [];
    }
    // Fallback: the search-engine relay.
    if (ids.length === 0) {
      ids = await raceSearchEngines(
        "JAVFREE",
        [
          `site:javfree.me ${keyword}`,
          `site:javfree.me ${keyword}`,
          `javfree.me ${keyword}`,
        ],
        parseJavfreeCandidateIDs,
      );
    }
    if (ids.length > 0) {
      const top = [...new Set(ids)].slice(0, 6);
      const settled = await Promise.allSettled(
        top.map((id) => javfreeProvider.getMovieInfoByID(id)),
      );
      const infos: MovieInfo[] = [];
      for (const s of settled) {
        if (s.status === "fulfilled" && isValidMovieInfo(s.value)) {
          infos.push(s.value);
        }
      }
      let kept = infos;
      if (fc2num) {
        const exact = infos.filter(
          (i) => i.number.replace(/\D/g, "") === fc2num,
        );
        if (exact.length > 0) kept = exact;
      }
      if (kept.length > 0) {
        return kept.map((i) => movieInfoToSearchResult(i));
      }
    }
    // Last resort: the original ?s= search page.
    const fc2ID = keyword.slice(keyword.lastIndexOf("-") + 1);
    const url = SEARCH_URL.replace("%s", encodeURIComponent(fc2ID));
    const r = await fetchPage(url, { providerName: "JAVFREE" });
    return parseJavfreeSearch(r.text, url, fc2ID);
  },
};
