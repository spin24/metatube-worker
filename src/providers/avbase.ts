// AVBase provider — slim port of provider/avbase from metatube-sdk-go.
//
// AVBase (avbase.net) is a Next.js site; both the page data and search are
// available as JSON from its _next/data endpoints once you know the current
// buildId (scraped from the homepage's __NEXT_DATA__, cached ~2h like the
// Go version's singledo).
//
// AVBase is an aggregator: a "work" bundles products from source sites
// (duga / fanza / getchu / mgstage / pcolle). The Go version delegates to
// the source provider for full metadata, then supplements missing fields
// from the work record. This port delegates to FANZA only (the one source
// we have); works without a usable source fall back to the work record
// itself, exactly like the Go version does when source fetching fails.

import {
  MovieInfo,
  MovieProvider,
  MovieSearchResult,
  ProviderError,
  isValidMovieInfo,
  isValidSearchResult,
} from "../types";
import { isFC2, isUncensored } from "../lib/textutil";
import { FanzaProvider } from "./fanza";

const BASE_URL = "https://www.avbase.net/";
const MOVIE_URL = "https://www.avbase.net/works/";
const KNOWN_SOURCES = new Set(["duga", "fanza", "getchu", "mgstage", "pcolle"]);
const BUILD_ID_TTL_MS = 2 * 60 * 60 * 1000;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

interface AvbaseProduct {
  product_id: string;
  title: string;
  source: string;
  image_url: string;
  thumbnail_url: string;
  date: string;
  maker?: { name?: string };
  label?: { name?: string };
  series?: { name?: string };
  sample_image_urls?: { s?: string; l?: string }[];
  iteminfo?: { description?: string };
}

export interface AvbaseWork {
  prefix?: string;
  work_id: string;
  title?: string;
  min_date?: string;
  genres?: { name: string }[];
  products?: AvbaseProduct[];
  actors?: { name: string }[];
  casts?: { actor: { name: string } }[];
}

function joinPrefixID(prefix: string | undefined, workID: string): string {
  if (!prefix || prefix.trim() === "") return workID;
  return `${prefix}:${workID}`;
}

/** AVBase dates arrive as JS date strings ("Fri Mar 18 2022 09:00:00 GMT+0900 ..."). */
export function parseAvbaseDate(s: string | undefined): string {
  if (!s) return "";
  const iso = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }
  const months: Record<string, string> = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };
  const named = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(\d{4})/.exec(s);
  if (named) {
    return `${named[3]}-${months[named[1]]}-${named[2].padStart(2, "0")}`;
  }
  return "";
}

function sortProductsDesc(products: AvbaseProduct[]): AvbaseProduct[] {
  // Go sorts by Source descending ("we want mgs > fanza > duga").
  return [...products].sort((a, b) =>
    a.source < b.source ? 1 : a.source > b.source ? -1 : 0,
  );
}

/** Pure mapping: work record -> MovieInfo (Go's getMovieInfoFromWork). */
export function movieInfoFromWork(work: AvbaseWork): MovieInfo {
  const info: MovieInfo = {
    id: joinPrefixID(work.prefix, work.work_id),
    number: work.work_id,
    title: "",
    summary: "",
    provider: "AVBASE",
    homepage: "",
    director: "",
    actors: [],
    thumb_url: "",
    cover_url: "",
    big_thumb_url: "",
    big_cover_url: "",
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
  for (const product of sortProductsDesc(work.products ?? [])) {
    if (!info.title) info.title = product.title ?? "";
    if (!info.cover_url) info.cover_url = product.image_url ?? "";
    if (!info.thumb_url) info.thumb_url = product.thumbnail_url ?? "";
    if (!info.maker) info.maker = product.maker?.name ?? "";
    if (!info.label) info.label = product.label?.name ?? "";
    if (!info.series) info.series = product.series?.name ?? "";
    if (!info.summary) info.summary = product.iteminfo?.description ?? "";
    if (!info.release_date) info.release_date = parseAvbaseDate(product.date);
    if (info.preview_images.length === 0) {
      for (const sample of product.sample_image_urls ?? []) {
        if (sample.l) info.preview_images.push(sample.l);
      }
    }
  }
  for (const genre of work.genres ?? []) {
    if (genre.name) info.genres.push(genre.name);
  }
  for (const cast of work.casts ?? []) {
    if (cast.actor?.name) info.actors.push(cast.actor.name);
  }
  return info;
}

/** Pure mapping: search works -> results (Go's SearchMovie result building). */
export function searchResultsFromWorks(works: AvbaseWork[]): MovieSearchResult[] {
  const results: MovieSearchResult[] = [];
  for (const work of works) {
    const products = sortProductsDesc(work.products ?? []);
    const chosen = products.find((p) => KNOWN_SOURCES.has(p.source));
    if (!chosen) continue; // no suitable source provider -> ignore the work
    const joinedID = joinPrefixID(work.prefix, work.work_id);
    const result: MovieSearchResult = {
      id: joinedID,
      number: work.work_id,
      title: work.title ?? "",
      provider: "AVBASE",
      // Canonical homepage carries the prefix (/works/premium:PGD-568);
      // the bare number URL 404s on avbase.net (upstream PR #383).
      homepage: MOVIE_URL + joinedID,
      actors: (work.actors ?? []).map((a) => a.name).filter(Boolean),
      thumb_url: chosen.thumbnail_url ?? "",
      cover_url: chosen.image_url ?? "",
      big_thumb_url: "",
      score: 0,
      release_date: parseAvbaseDate(work.min_date),
    };
    if (isValidSearchResult(result)) results.push(result);
  }
  return results;
}

let buildIdCache: { id: string; at: number } | null = null;

export class AvbaseProvider implements MovieProvider {
  readonly name = "AVBASE";
  readonly priority = 996;
  private readonly fanza = new FanzaProvider();

  normalizeMovieID(id: string): string {
    const trimmed = id.trim();
    if (!trimmed.includes(":")) {
      return trimmed.toUpperCase();
    }
    const [prefix, workID] = trimmed.split(":", 2) as [string, string];
    return joinPrefixID(prefix, workID);
  }

  parseMovieIDFromURL(rawURL: string): string | null {
    try {
      const base = new URL(rawURL).pathname.split("/").filter(Boolean).pop();
      return base ? this.normalizeMovieID(decodeURIComponent(base)) : null;
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
      throw new ProviderError(`cannot parse work id from url: ${rawURL}`, "invalid");
    }
    const work = await this.fetchWork(id);
    if (!work) {
      throw new ProviderError(`work not found: ${id}`, "not_found");
    }
    const workInfo = movieInfoFromWork(work);

    // Delegate to a source provider (FANZA is the one we have), like the
    // Go version; supplement from the work record afterwards.
    let info: MovieInfo | null = null;
    for (const product of sortProductsDesc(work.products ?? [])) {
      if (product.source !== "fanza") continue;
      try {
        const src = await this.fanza.getMovieInfoByID(product.product_id);
        if (isValidMovieInfo(src)) {
          info = src;
          break;
        }
      } catch {
        // try the work record instead
      }
    }
    if (info) {
      if (!info.maker) info.maker = workInfo.maker;
      if (!info.label) info.label = workInfo.label;
      if (!info.series) info.series = workInfo.series;
      if (!info.summary) info.summary = workInfo.summary;
      if (info.genres.length === 0) info.genres = workInfo.genres;
      if (workInfo.actors.length > 0) info.actors = workInfo.actors;
      if (workInfo.number) info.number = workInfo.number;
    } else {
      info = workInfo;
    }

    // Final identity: AVBase work id wins when it is the prefixed form.
    let finalID = id;
    if (workInfo.id.length > id.length && workInfo.id.includes(":")) {
      finalID = workInfo.id;
    }
    info.id = finalID;
    info.provider = this.name;
    // Canonical homepage from the final id, not the request URL: the
    // work record's prefixed id is the only form avbase.net serves.
    info.homepage = MOVIE_URL + finalID;
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    return info;
  }

  normalizeMovieKeyword(keyword: string): string {
    if (isUncensored(keyword) || isFC2(keyword)) {
      return ""; // no uncensored support
    }
    return keyword.toUpperCase();
  }

  async searchMovie(keyword: string): Promise<MovieSearchResult[]> {
    const data = await this.fetchDataJSON(
      (buildId) =>
        `https://www.avbase.net/_next/data/${buildId}/works.json?q=${encodeURIComponent(keyword)}`,
    );
    const works = (data?.pageProps?.works ?? []) as AvbaseWork[];
    return searchResultsFromWorks(works);
  }

  private async fetchWork(id: string): Promise<AvbaseWork | null> {
    const data = await this.fetchDataJSON(
      (buildId) =>
        `https://www.avbase.net/_next/data/${buildId}/works/${id}.json?id=${encodeURIComponent(id)}`,
      true,
    );
    return (data?.pageProps?.work as AvbaseWork) ?? null;
  }

  /**
   * Fetch a _next/data JSON document. On a 404 the cached buildId may be
   * stale (AVBase redeployed) — invalidate it and retry once with a fresh
   * one. (The Go version just fails; this keeps the port self-healing.)
   */
  private async fetchDataJSON(
    buildURL: (buildId: string) => string,
    nullOn404 = false,
  ): Promise<{ pageProps?: Record<string, unknown> } | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const buildId = await this.getBuildId();
      let resp: Response;
      try {
        resp = await fetch(buildURL(buildId), {
          headers: { "User-Agent": UA, Referer: BASE_URL },
        });
      } catch (e) {
        throw new ProviderError(`avbase fetch failed: ${String(e)}`, "upstream");
      }
      if (resp.status === 404) {
        if (attempt === 0) {
          buildIdCache = null;
          continue;
        }
        if (nullOn404) return null;
        throw new ProviderError("avbase: not found", "not_found");
      }
      if (!resp.ok) {
        throw new ProviderError(`avbase http ${resp.status}`, "upstream");
      }
      return (await resp.json()) as { pageProps?: Record<string, unknown> };
    }
    return null;
  }

  private async getBuildId(): Promise<string> {
    if (buildIdCache && Date.now() - buildIdCache.at < BUILD_ID_TTL_MS) {
      return buildIdCache.id;
    }
    let resp: Response;
    try {
      resp = await fetch(BASE_URL, { headers: { "User-Agent": UA } });
    } catch (e) {
      throw new ProviderError(`avbase homepage fetch failed: ${String(e)}`, "upstream");
    }
    if (!resp.ok) {
      throw new ProviderError(`avbase homepage http ${resp.status}`, "upstream");
    }
    const html = await resp.text();
    // The buildId sits after the (potentially huge) pageProps payload in
    // __NEXT_DATA__, so search the whole script block, not a fixed window.
    const anchor = html.indexOf("__NEXT_DATA__");
    let m: RegExpExecArray | null = null;
    if (anchor >= 0) {
      const end = html.indexOf("</script>", anchor);
      const block = html.slice(anchor, end > anchor ? end : undefined);
      m = /"buildId":"([^"]+)"/.exec(block);
    }
    if (!m) {
      throw new ProviderError("avbase: buildId not found", "upstream");
    }
    buildIdCache = { id: m[1], at: Date.now() };
    return m[1];
  }
}
