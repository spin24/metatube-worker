// FANZA provider — slim port of provider/fanza from metatube-sdk-go.
//
// The Go version has two paths:
//   1. digital (video.dmm.co.jp) — a GraphQL API at api.video.dmm.co.jp.
//   2. mono (www.dmm.co.jp, DVD mail-order pages) — colly/XPath HTML scraping.
//
// This port implements path 1 only. The GraphQL path is ideal for Workers:
// one fetch, one JSON parse, no HTML DOM, minimal CPU (free-tier friendly).
// Mono URLs are still accepted — their cid is extracted and resolved through
// the digital API, which covers the same content in the vast majority of cases.
//
// Partially dropped vs. the Go version (image pipeline):
//   - big-thumb promotion by perceptual hash (goimagehash) — dropped.
//   - The big-thumb SIZE check is implemented (a HEAD request reading
//     Content-Length only; no image bytes are processed).
//   - AWS image-src upgrading / preview-src maximizing — dropped.
// Image URLs are passed through exactly as FANZA returns them.

import {
  MovieInfo,
  MovieProvider,
  MovieSearchResult,
  ProviderError,
  isValidMovieInfo,
} from "../types";
import { compareStrings, isSpecial } from "../lib/textutil";

const VIDEO_URL = "https://video.dmm.co.jp/";
const GRAPHQL_URL = "https://api.video.dmm.co.jp/graphql";

// Trimmed version of the Go version's ContentPageData query: only the fields
// that map onto MovieInfo. Smaller response = less JSON parse CPU.
const CONTENT_PAGE_DATA_QUERY = `
query ContentPageData($id: ID!, $isAmateur: Boolean!, $isAnime: Boolean!, $isAv: Boolean!, $isCinema: Boolean!) {
  ppvContent(id: $id) {
    id
    floor
    title
    description
    packageImage { largeUrl mediumUrl }
    sampleImages { largeImageUrl }
    sample2DMovie { highestMovieUrl hlsMovieUrl }
    sampleVRMovie { highestMovieUrl }
    ...AvFields @include(if: $isAv)
    ...AmateurFields @include(if: $isAmateur)
    ...AnimeFields @include(if: $isAnime)
    ...CinemaFields @include(if: $isCinema)
  }
  reviewSummary(contentId: $id) { average }
}
fragment AvFields on PPVContent {
  deliveryStartDate makerReleasedAt duration makerContentId
  actresses { name } directors { name } series { name }
  maker { name } label { name } genres { name }
}
fragment AmateurFields on PPVContent {
  deliveryStartDate duration makerContentId
  amateurActress { name }
  maker { name } label { name } genres { name }
}
fragment AnimeFields on PPVContent {
  deliveryStartDate duration makerContentId series { name }
  maker { name } label { name } genres { name }
}
fragment CinemaFields on PPVContent {
  deliveryStartDate duration makerContentId
  actresses { name } directors { name } series { name }
  maker { name } label { name } genres { name }
}`;

interface Named {
  name?: string;
}

interface PPVContent {
  id: string;
  floor?: string;
  title?: string;
  description?: string;
  packageImage?: { largeUrl?: string; mediumUrl?: string };
  sampleImages?: { largeImageUrl?: string }[];
  sample2DMovie?: { highestMovieUrl?: string; hlsMovieUrl?: string };
  sampleVRMovie?: { highestMovieUrl?: string };
  deliveryStartDate?: string;
  makerReleasedAt?: string;
  duration?: number;
  makerContentId?: string;
  actresses?: Named[];
  amateurActress?: Named;
  directors?: Named[];
  series?: Named;
  maker?: Named;
  label?: Named;
  genres?: Named[];
}

interface ContentPageData {
  ppvContent: PPVContent | null;
  reviewSummary?: { average?: number } | null;
}

type FloorFlags = {
  isAmateur: boolean;
  isAnime: boolean;
  isAv: boolean;
  isCinema: boolean;
};

const ALL_FLOORS: FloorFlags = { isAmateur: true, isAnime: true, isAv: true, isCinema: true };
const AV_ONLY: FloorFlags = { isAmateur: false, isAnime: false, isAv: true, isCinema: false };

export function parseNumber(s: string): string {
  const m = /([A-Z]+)(\d+)/.exec(s.toUpperCase());
  if (m) {
    return `${m[1]}-${String(parseInt(m[2], 10)).padStart(3, "0")}`;
  }
  return s;
}

export class FanzaProvider implements MovieProvider {
  readonly name = "FANZA";
  readonly priority = 1001;

  normalizeMovieID(id: string): string {
    const t = id.trim().toLowerCase(); // FANZA uses lowercase IDs
    // Maker numbers (ROYD-369) and mono cids (royd369) address the
    // same work as the digital cid (royd00369): lowercase label +
    // digits zero-padded to 5. Without this, number-style IDs went
    // into the GraphQL query verbatim and found nothing, so clients
    // fell back to the sparse mono search hit. Already-digital IDs
    // are idempotent; non-matching shapes pass through untouched.
    const m = /^([a-z]+)-?(\d+)$/.exec(t);
    if (m) {
      return m[1] + m[2].padStart(5, "0");
    }
    return t;
  }

  parseMovieIDFromURL(rawURL: string): string | null {
    let url: URL;
    try {
      url = new URL(rawURL);
    } catch {
      return null;
    }
    if (url.hostname === "video.dmm.co.jp") {
      const id = url.searchParams.get("id");
      return id ? this.normalizeMovieID(id) : null;
    }
    const m = /\/cid=(.*?)\//.exec(url.pathname);
    if (m) {
      return this.normalizeMovieID(m[1]);
    }
    return null;
  }

  async getMovieInfoByID(id: string): Promise<MovieInfo> {
    const normalized = this.normalizeMovieID(id);
    if (!normalized) {
      throw new ProviderError("invalid id", "invalid");
    }
    const data = await this.fetchContentPageData(normalized);
    if (!data?.ppvContent) {
      // Fall back to the unpadded cid form: a few labels address
      // content by the mono-style cid even on the digital API.
      const bare = /^([a-z]+)0+(\d+)$/.exec(normalized);
      if (bare) {
        const alt = await this.fetchContentPageData(bare[1] + bare[2]);
        if (alt?.ppvContent) {
          return this.finishInfo(alt, normalized);
        }
      }
      throw new ProviderError(`content not found: ${normalized}`, "not_found");
    }
    return this.finishInfo(data, normalized);
  }

  private async finishInfo(data: ContentPageData, normalized: string): Promise<MovieInfo> {
    const info = mapContentToMovieInfo(data);
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${normalized}`, "not_found");
    }
    // Big thumb (Go parity, size-check branch): if the thumb image is
    // large enough to be a poster-grade file (>100 KiB by its
    // Content-Length), it doubles as the big thumb. On DMM's AWS host
    // the "ps" thumb IS the 1032x1468 portrait poster, so this is the
    // branch that fires in practice. Go's second branch — promoting
    // preview_images[0] when a perceptual hash matches the thumb —
    // needs goimagehash and stays unported (image pipeline).
    if (!info.big_thumb_url && info.thumb_url) {
      try {
        const head = await fetch(info.thumb_url, {
          method: "HEAD",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          },
          signal: AbortSignal.timeout(4000),
        });
        const type = head.headers.get("content-type") ?? "";
        const size = Number(head.headers.get("content-length") ?? 0);
        if (type.startsWith("image/") && size > 100 * 1024) {
          info.big_thumb_url = info.thumb_url;
        }
      } catch {
        // best-effort only
      }
    }
    return info;
  }

  async getMovieInfoByURL(rawURL: string): Promise<MovieInfo> {
    const id = this.parseMovieIDFromURL(rawURL);
    if (!id) {
      throw new ProviderError(`cannot parse content id from url: ${rawURL}`, "invalid");
    }
    return this.getMovieInfoByID(id);
  }

  normalizeMovieKeyword(keyword: string): string {
    if (isSpecial(keyword)) {
      return "";
    }
    return keyword.toLowerCase(); // FANZA prefers lowercase
  }

  async searchMovie(keyword: string): Promise<MovieSearchResult[]> {
    if (keyword.includes("-")) {
      // FANZA cannot search hyphened numbers: ADN-306 -> adn00306#
      // (replace the first "-" with "00", append "#" to mark the 001 style).
      try {
        const results = await this.searchMovieNext(keyword.replace("-", "00") + "#");
        if (results.length > 0) {
          return results;
        }
      } catch {
        // fall through to the plain variant
      }
    }
    // Fallback: strip the hyphen entirely (adn306).
    return this.searchMovieNext(keyword.replace("-", ""));
  }

  private async searchMovieNext(keyword: string): Promise<MovieSearchResult[]> {
    const searchURL = `https://www.dmm.co.jp/search/=/searchstr=${encodeURIComponent(keyword)}/limit=120/sort=date/`;
    let resp: Response;
    try {
      resp = await fetch(searchURL, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Referer: "https://www.dmm.co.jp/",
          Cookie: "age_check_done=1",
        },
        // IMPORTANT: do not follow redirects. DMM answers non-Japanese
        // egress with a 307 to a region page, but the 307 response body
        // still carries the full search page (verified against the real
        // site) — following the redirect would throw the data away.
        redirect: "manual",
      });
    } catch (e) {
      throw new ProviderError(`fanza search fetch failed: ${String(e)}`, "upstream");
    }
    if (resp.status !== 200 && resp.status !== 307 && resp.status !== 302) {
      throw new ProviderError(`fanza search http ${resp.status}`, "upstream");
    }
    const html = await resp.text();
    const products = extractSearchProducts(html);
    if (products.length === 0 && html.includes("not-available-in-your-region")) {
      throw new ProviderError("fanza search: region not available", "upstream");
    }
    const results: MovieSearchResult[] = [];
    for (const product of products) {
      if (
        !product.detail_url.startsWith("https://www.dmm.co.jp/digital/") &&
        !product.detail_url.startsWith("https://www.dmm.co.jp/mono/") &&
        !product.detail_url.startsWith("https://video.dmm.co.jp/")
      ) {
        continue; // ignore non-movie results (e.g. monthly-video plans)
      }
      results.push({
        id: product.content_id,
        number: parseNumber(product.content_id),
        title: product.title,
        provider: this.name,
        homepage: product.detail_url,
        actors: product.casts ?? [],
        thumb_url: product.thumbnail_image_url,
        cover_url: previewSrc(product.thumbnail_image_url),
        big_thumb_url: "",
        score: product.rate ?? 0,
        release_date: parseSearchReleaseDate(product.release_announcement ?? ""),
      });
    }
    return sortFanzaSearchResults(keyword, results);
  }

  private async fetchContentPageData(id: string): Promise<ContentPageData | null> {
    // Trick: the floor flags only gate @include fragments, and the fragments
    // do not conflict — so request all floors at once instead of guessing the
    // floor per ID like the Go version does (1 subrequest instead of up to 4).
    try {
      return await this.graphql(id, ALL_FLOORS);
    } catch (e) {
      // Fallback: some edge case in the combined query — retry AV-only.
      if (e instanceof ProviderError && e.kind === "upstream") {
        return await this.graphql(id, AV_ONLY);
      }
      throw e;
    }
  }

  private async graphql(id: string, floors: FloorFlags): Promise<ContentPageData | null> {
    let resp: Response;
    try {
      resp = await fetch(GRAPHQL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Referer: VIDEO_URL,
          "Fanza-Device": "BROWSER",
          "Cache-Control": "no-cache",
          // The Go client sends an empty UA; a browser UA is safer from
          // Workers egress and behaves identically for this API.
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        },
        body: JSON.stringify({
          query: CONTENT_PAGE_DATA_QUERY,
          variables: { id, ...floors },
        }),
      });
    } catch (e) {
      throw new ProviderError(`fanza graphql fetch failed: ${String(e)}`, "upstream");
    }
    if (!resp.ok) {
      throw new ProviderError(`fanza graphql http ${resp.status}`, "upstream");
    }
    const payload = (await resp.json()) as {
      data?: ContentPageData;
      errors?: { message: string }[];
    };
    if (payload.errors?.length && !payload.data?.ppvContent) {
      throw new ProviderError(
        `fanza graphql error: ${payload.errors[0].message}`,
        "upstream",
      );
    }
    return payload.data ?? null;
  }
}

function toDate(s: string | undefined): string {
  // GraphQL returns ISO timestamps; MovieInfo.release_date is YYYY-MM-DD.
  return s ? s.slice(0, 10) : "";
}

function mapContentToMovieInfo(data: ContentPageData): MovieInfo {
  const c = data.ppvContent!;
  const info: MovieInfo = {
    id: c.id,
    number: c.makerContentId ?? "",
    title: c.title ?? "",
    summary: c.description ?? "",
    provider: "FANZA",
    homepage: `https://video.dmm.co.jp/${(c.floor ?? "av").toLowerCase()}/content/?id=${c.id}`,
    director: "",
    actors: [],
    thumb_url: c.packageImage?.mediumUrl ?? "",
    cover_url: c.packageImage?.largeUrl ?? "",
    big_thumb_url: "",
    preview_video_url: "",
    preview_video_hls_url: "",
    preview_images: [],
    maker: c.maker?.name ?? "",
    label: c.label?.name ?? "",
    series: c.series?.name ?? "",
    genres: [],
    score: data.reviewSummary?.average ?? 0,
    runtime: Math.floor((c.duration ?? 0) / 60),
    release_date: toDate(c.deliveryStartDate) || toDate(c.makerReleasedAt),
  };

  for (const d of c.directors ?? []) {
    if (d.name) info.director = d.name;
  }
  for (const a of c.actresses ?? []) {
    if (a.name) info.actors.push(a.name);
  }
  if (info.actors.length === 0 && c.amateurActress?.name) {
    info.actors.push(c.amateurActress.name);
  }
  for (const g of c.genres ?? []) {
    if (g.name) info.genres.push(g.name);
  }
  for (const img of c.sampleImages ?? []) {
    if (img.largeImageUrl) info.preview_images.push(img.largeImageUrl);
  }
  if (!info.number) {
    info.number = parseNumber(info.id);
  }
  if (!info.cover_url) {
    info.cover_url = info.thumb_url;
  }
  if (c.sample2DMovie?.highestMovieUrl) {
    info.preview_video_url = c.sample2DMovie.highestMovieUrl;
  }
  if (c.sample2DMovie?.hlsMovieUrl) {
    info.preview_video_hls_url = c.sample2DMovie.hlsMovieUrl;
  }
  if (c.sampleVRMovie?.highestMovieUrl) {
    info.preview_video_url = c.sampleVRMovie.highestMovieUrl;
  }
  return info;
}

interface FanzaSearchProduct {
  content_id: string;
  title: string;
  detail_url: string;
  casts?: string[];
  thumbnail_image_url: string;
  rate?: number;
  release_announcement?: string;
}

/**
 * Extract search products from a DMM search page.
 *
 * Port of the Go searchparse package: the page is a Next.js app whose RSC
 * flight data is pushed via `self.__next_f.push([idx, "..."])`; entries
 * with idx 1 concatenate into the payload, one line of which is an array
 * containing an object with a `backendResponse` key.
 */
export function extractSearchProducts(html: string): FanzaSearchProduct[] {
  let data = "";
  const pushRe = /self\.__next_f\.push\(\[(\d+),"((?:[^"\\]|\\.)*)"\]\)/g;
  for (const m of html.matchAll(pushRe)) {
    if (m[1] !== "1") continue;
    try {
      data += JSON.parse(`"${m[2]}"`) as string;
    } catch {
      data += m[2];
    }
  }
  for (const line of data.split("\n")) {
    if (!line.includes("backendResponse")) continue;
    const lm = /^\w:(\[.+])/.exec(line);
    if (!lm) continue;
    try {
      const arr = JSON.parse(lm[1]) as unknown[];
      const wrapper = findObjectWithKey(arr, "backendResponse") as
        | { backendResponse?: { contents?: { data?: FanzaSearchProduct[] } } }
        | undefined;
      const products = wrapper?.backendResponse?.contents?.data;
      if (products) return products;
    } catch {
      // try the next line
    }
  }
  return [];
}

function findObjectWithKey(value: unknown, key: string, depth = 0): unknown {
  if (depth > 100 || value === null || typeof value !== "object") return undefined;
  if (!Array.isArray(value)) {
    if (key in (value as Record<string, unknown>)) return value;
    return undefined;
  }
  for (const item of value) {
    if (item !== null && typeof item === "object" && !Array.isArray(item)) {
      if (key in (item as Record<string, unknown>)) return item;
    }
    const found = findObjectWithKey(item, key, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function parseSearchReleaseDate(announcement: string): string {
  const cleaned = announcement.replace(/(配信日|発売日|貸出日)：\s*/, "");
  const m = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(cleaned);
  if (!m) return "";
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

/** Port of sortMovieSearchResults: rank by ID/keyword similarity. */
function sortFanzaSearchResults(
  keyword: string,
  results: MovieSearchResult[],
): MovieSearchResult[] {
  const norm = (s: string) => s.replace(/([A-Z]+)0*([1-9]*)/gi, "$1$2");
  const x = norm(keyword);
  return [...results].sort((ra, rb) => {
    const a = norm(ra.id);
    const b = norm(rb.id);
    if (a === b) {
      // Prefer digital results on ties.
      const ad = ra.homepage.includes("/digital/") ? 0 : 1;
      const bd = rb.homepage.includes("/digital/") ? 0 : 1;
      return ad - bd;
    }
    return compareStrings(b, x) - compareStrings(a, x);
  });
}

/** Port of PreviewSrc: maximize a DMM image URL (ps.jpg -> pl.jpg etc.). */
export function previewSrc(s: string): string {
  if (/(p[a-z]\.)jpg/.test(s)) {
    return s.replace(/(p[a-z]\.)jpg/, "pl.jpg");
  } else if (/consumer_game/.test(s)) {
    return s.replaceAll("js-", "-");
  } else if (/js-(\d+)\.jpg$/.test(s)) {
    return s.replace("js-", "jp-");
  } else if (/ts-(\d+)\.jpg$/.test(s)) {
    return s.replace("ts-", "tl-");
  } else if (/(-\d+\.)jpg$/.test(s)) {
    return s.replace(/(-\d+\.)jpg$/, "jp$1jpg");
  } else {
    return s.replaceAll("-", "jp-");
  }
}
