// DUGA — port of provider/duga from metatube-sdk-go.
// Info: duga.jp PPV page scrape. Search: duga.jp's own search
// endpoint answers 503 to datacenter egress, so search relays
// through public search engines (see lib/engines.ts) with a learned
// number -> slug fast path; candidate slugs resolve to full info.

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
import { compareStrings } from "../lib/textutil";
import { raceSearchEngines } from "../lib/engines";
import { parseDateLoose } from "../lib/scrape";

const MOVIE_URL = "https://duga.jp/ppv/%s/";
const SEARCH_URL = "https://duga.jp/search/=/q=%s/";

// Learned mappings for the search relay (module state, per isolate):
// DUGA's own search endpoint answers 503 to datacenter egress, so
// search goes through public search engines like AVE's. A verified
// number -> slug mapping never changes, so repeat lookups skip the
// flaky engines entirely.
const learnedNumbers = new Map<string, string>();
const learnedKeywords = new Map<string, string[]>();

function normNum(s: string): string {
  return s.toUpperCase().replace(/[-_\s]/g, "");
}

/** Candidate DUGA slugs from a search-engine results page. */
export function parseDugaCandidateSlugs(html: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const re = /duga\.jp(?:%2F|\/)ppv(?:%2F|\/)([a-z0-9][a-z0-9-]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const slug = m[1].toLowerCase();
    // Work slugs are label-number ("glory-0046"); bare labels are
    // listing pages, not works.
    if (!/^[a-z]+-\d+$/.test(slug)) continue;
    if (!seen.has(slug)) {
      seen.add(slug);
      ids.push(slug);
      if (ids.length >= 8) break;
    }
  }
  return ids;
}

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
    // Teach the search fast path: number -> URL slug (info.id may
    // have been overwritten by the page's numeric work ID).
    if (info.number) learnedNumbers.set(normNum(info.number), id);
    return info;
  },

  normalizeMovieKeyword(keyword: string): string {
    if (isSpecial(keyword)) return "";
    return keyword.trim().toUpperCase();
  },

  async searchMovie(keyword: string): Promise<MovieSearchResult[]> {
    const kwNorm = normNum(keyword);
    const slugLike = /^[a-z]+-\d+$/i.test(keyword.trim());

    // Fast paths: DUGA ids ARE readable slugs, so a slug-like keyword
    // resolves directly; a known number resolves via the learned map.
    const direct = slugLike
      ? keyword.trim().toLowerCase()
      : learnedNumbers.get(kwNorm);
    if (direct) {
      try {
        const info = await dugaProvider.getMovieInfoByID(direct);
        if (isValidMovieInfo(info)) return [movieInfoToSearchResult(info)];
      } catch {
        // fall through to the relay
      }
    }

    let ids = await raceSearchEngines(
      "DUGA",
      [`site:duga.jp ${keyword}`, `site:duga.jp ${keyword}`, `duga.jp ${keyword}`],
      parseDugaCandidateSlugs,
    );
    if (ids.length === 0) ids = learnedKeywords.get(kwNorm) ?? [];
    if (ids.length === 0) {
      // Last resort: the site's own search (503s from some egress).
      try {
        const url = SEARCH_URL.replace("%s", encodeURIComponent(keyword));
        const r = await fetchPage(url, { providerName: "DUGA" });
        ids = await parseDugaSearchIDs(r.text, url);
      } catch {
        ids = [];
      }
    }
    if (ids.length === 0) return [];

    const top = ids.slice(0, 5);
    const settled = await Promise.allSettled(
      top.map((id) => dugaProvider.getMovieInfoByID(id)),
    );
    const pairs: { slug: string; info: MovieInfo }[] = [];
    settled.forEach((s, i) => {
      if (s.status === "fulfilled" && isValidMovieInfo(s.value)) {
        pairs.push({ slug: top[i], info: s.value });
      }
    });
    learnedKeywords.set(kwNorm, ids.slice(0, 8));
    for (const p of pairs) {
      if (p.info.number) learnedNumbers.set(normNum(p.info.number), p.slug);
    }
    const infos = pairs.map((p) => p.info);

    let kept = infos;
    const numberLike = slugLike || /^[A-Z]+\d+$/.test(kwNorm) || /^\d+$/.test(kwNorm);
    if (numberLike) {
      const exact = infos.filter((i) => normNum(i.number) === kwNorm);
      if (exact.length > 0) {
        kept = exact;
      } else {
        const near = infos.filter(
          (i) => compareStrings(normNum(i.number), kwNorm) >= 0.8,
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
