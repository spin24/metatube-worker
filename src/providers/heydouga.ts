// HeyDouga — slim port of provider/heydouga from metatube-sdk-go.
// Pages at /moviepages/{a}/{b}/index.html need lang/age cookies; the
// score comes from a rating JSON and genres from a tag POST, both
// best-effort like the Go version's OnScraped goroutines.

import {
  MovieInfo,
  MovieProvider,
  ProviderError,
  isValidMovieInfo,
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
import { parseRuntime, parseScore } from "../lib/textutil";

const BASE = "https://www.heydouga.com/";
const MOVIE_URL = "https://www.heydouga.com/moviepages/%s/%s/index.html";
const TAG_URL = "https://www.heydouga.com/get_movie_tag_all/";
const COOKIE = "lang=ja; over18_ppv=1; feature_group=1";

export async function parseHeydougaPage(
  html: string,
  pageURL: string,
  id: string,
): Promise<MovieInfo> {
  const info = baseMovieInfo("HeyDouga", id, pageURL);
  info.number = `HEYDOUGA-${id}`;

  const fields = await collectFields(html, [
    { key: "titleNodes", selector: "#title-bg h1", mode: "texts" },
    { key: "badges", selector: "#title-bg h1 span, #title-bg h1 a", mode: "texts" },
    { key: "ogTitle", selector: 'meta[property="og:title"]', mode: "attr", attr: "content" },
    { key: "summary", selector: "#movie-detail-mobile .movie-description p", mode: "text" },
    { key: "summaryDesktop", selector: "#movie-detail-desktop .movie-description p", mode: "text" },
    { key: "gallery", selector: "#movie-gallery-images a.fancybox", mode: "attrs", attr: "href" },
  ]);
  // The Go version takes the h1's first direct text node; badge spans
  // and chip links inside the h1 are elements, so skip their texts.
  const badges = new Set(fields.badges as string[]);
  const titleNode = (fields.titleNodes as string[]).find((t) => !badges.has(t)) ?? "";
  info.title = (titleNode || (fields.ogTitle as string).trim()).replace(/\u00A0/g, " ").trim();
  // The title node leads with the cast list: "琴、莉久、小波 - 【...】".
  const castPart = info.title.split(" - ")[0];
  if (castPart && castPart !== info.title) {
    const cast = castPart.split("、").map((a) => a.trim()).filter(Boolean);
    if (cast.length >= 1 && cast.length <= 6 && cast.every((a) => a.length <= 20)) {
      info.actors = cast;
    }
  }
  info.summary =
    (fields.summary as string).trim() || (fields.summaryDesktop as string).trim();
  for (const href of fields.gallery as string[]) {
    const img = absURL(pageURL, href);
    if (href && !info.preview_images.includes(img)) info.preview_images.push(img);
  }

  const poster =
    /player_poster\s*=\s*"([^"]+)"/.exec(html) ??
    /player_poster\s*=\s*'([^']+)'/.exec(html);
  if (poster) {
    info.cover_url = absURL(pageURL, poster[1]);
    info.thumb_url = info.cover_url;
  }

  const rows = await collectPairsSeq(html, "#movie-info li > span");
  for (const row of rows) {
    switch (row.label) {
      case "配信日：":
        info.release_date = parseDateLoose(row.value);
        break;
      case "配信期間：":
        info.release_date = parseDateLoose(row.value.split("～")[0]);
        break;
      case "主演：":
        info.actors = row.value.split(/\s+/).filter(Boolean);
        break;
      case "提供元：":
        info.maker = row.valueFirstLink || row.value.trim();
        break;
      case "動画再生時間：":
        info.runtime = parseRuntime(row.value);
        break;
    }
  }

  const hls = /source\s*=\s*'(.+\.m3.*?)';/.exec(html);
  if (hls) info.preview_video_hls_url = absURL(pageURL, hls[1]);
  return info;
}

export const heydougaProvider: MovieProvider = {
  name: "HeyDouga",
  priority: 1000,

  normalizeMovieID(id: string): string {
    // Real site IDs are {studio#}-{slug}; slug shapes vary (upstream
    // PR #375, stats over 168 samples): pure digits (450, 2489),
    // ppv-date with hyphen or underscore (ppv-010325-001,
    // ppv-010324_001), letter-mixed (ppv-gol056, r019). The old regex
    // required a 4-digit studio and a dashless slug.
    const m = /^(?:heydouga[-_])?(\d+)-([a-z\d][a-z\d_-]*)$/i.exec(id.trim());
    return m ? `${m[1]}-${m[2].toLowerCase()}` : "";
  },

  parseMovieIDFromURL(rawURL: string): string | null {
    try {
      const path = new URL(rawURL).pathname;
      // Prefer the real /moviepages/{studio}/{slug}/index.html form.
      const m = /\/moviepages\/(\d+)\/([a-z\d][a-z\d_-]*)\/index\.html/i.exec(path);
      if (m) return `${m[1]}-${m[2].toLowerCase()}`;
      const old = /\/(\d+)\/(\d+)\/index\.html/.exec(path);
      return old ? `${old[1]}-${old[2]}` : null;
    } catch {
      return null;
    }
  },

  async getMovieInfoByID(id: string): Promise<MovieInfo> {
    const normalized = heydougaProvider.normalizeMovieID(id);
    if (!normalized) throw new ProviderError(`invalid id: ${id}`, "invalid");
    // Split on the FIRST hyphen only: slugs may contain hyphens.
    const cut = normalized.indexOf("-");
    const a = normalized.slice(0, cut);
    const b = normalized.slice(cut + 1);
    return heydougaProvider.getMovieInfoByURL(
      MOVIE_URL.replace("%s", a).replace("%s", b),
    );
  },

  async getMovieInfoByURL(rawURL: string): Promise<MovieInfo> {
    const id = heydougaProvider.parseMovieIDFromURL(rawURL);
    if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    const r = await fetchPage(rawURL, {
      providerName: "HeyDouga",
      cookie: COOKIE,
      notFoundMessage: `movie not found: ${id}`,
    });
    const info = await parseHeydougaPage(r.text, rawURL, id);

    // Score from the rating JSON (best-effort).
    try {
      const m = /url_get_movie_rating\s*=\s*"(.+?)";/.exec(r.text);
      if (m) {
        const rating = await fetchText(absURL(rawURL, m[1]), {
          providerName: "HeyDouga",
          cookie: COOKIE,
        });
        if (rating.status >= 200 && rating.status < 300) {
          const data = JSON.parse(rating.text) as { movie_rating_average?: string };
          if (data.movie_rating_average) {
            info.score = parseScore(data.movie_rating_average);
          }
        }
      }
    } catch {
      // ignore
    }
    // Genres from the tag endpoint (best-effort POST).
    try {
      const pid = /provider_id\s*=\s*(\d+);/.exec(r.text);
      const seq = /data\s*:\s*\{\s*movie_seq\s*:\s*(\d+),/.exec(r.text);
      if (pid && seq) {
        const tags = await fetchText(TAG_URL, {
          providerName: "HeyDouga",
          cookie: COOKIE,
          method: "POST",
          contentType: "application/x-www-form-urlencoded",
          body: new URLSearchParams({
            movie_seq: seq[1],
            provider_id: pid[1],
          }).toString(),
        });
        if (tags.status >= 200 && tags.status < 300) {
          const data = JSON.parse(tags.text) as { tag?: { tag_name: string }[] };
          for (const tag of data.tag ?? []) {
            if (tag.tag_name) info.genres.push(tag.tag_name);
          }
        }
      }
    } catch {
      // ignore
    }

    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    return info;
  },
};
