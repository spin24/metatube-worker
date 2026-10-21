// HEYZO — slim port of provider/heyzo from metatube-sdk-go.
// Movie pages at /moviepages/{id:04}/index.html carry a JSON-LD block;
// a player script additionally yields an m3u8 whose best media URI is
// turned into the MP4 sample URL. (Reviews not ported.)

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
  extractJsonLd,
  fetchPage,
  fetchText,
  parseDateLoose,
} from "../lib/scrape";
import { parseRuntime, parseScore } from "../lib/textutil";

const BASE = "https://www.heyzo.com/";
const MOVIE_URL = "https://www.heyzo.com/moviepages/%s/index.html";
const SAMPLE_URL = "https://www.heyzo.com/contents/%s/%s/%s";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export async function parseHeyzoPage(
  html: string,
  pageURL: string,
  id: string,
): Promise<MovieInfo> {
  const info = baseMovieInfo("HEYZO", id, pageURL);
  info.number = `HEYZO-${id}`;
  info.maker = "HEYZO";

  for (const block of extractJsonLd(html)) {
    const video = (block["video"] ?? {}) as Record<string, unknown>;
    const released = (block["releasedEvent"] ?? {}) as Record<string, unknown>;
    const rating = (block["aggregateRating"] ?? {}) as Record<string, unknown>;
    if (!str(block["name"]) && !str(video["duration"])) continue;
    info.title = str(block["name"]);
    info.summary = str(block["description"]);
    if (str(block["image"])) {
      info.cover_url = absURL(pageURL, str(block["image"]));
      info.thumb_url = info.cover_url;
    }
    info.release_date = parseDateLoose(str(released["startDate"]));
    info.runtime = parseRuntime(str(video["duration"]));
    info.score = parseScore(str(rating["ratingValue"]));
    if (str(video["provider"])) info.maker = str(video["provider"]);
    if (str(video["actor"])) info.actors = [str(video["actor"])];
    break;
  }

  const fields = await collectFields(html, [
    { key: "h1", selector: "#movie h1", mode: "text" },
    { key: "memo", selector: "p.memo", mode: "text" },
    { key: "og", selector: 'meta[property="og:image"]', mode: "attr", attr: "content" },
    { key: "sampleScripts", selector: "div.sample-images script", mode: "text" },
    { key: "genres", selector: "ul.tag-keyword-list li a", mode: "texts" },
  ]);
  info.genres = [...new Set(fields.genres as string[])];
  if (!info.title) {
    info.title = (fields.h1 as string).trim().split(/\s+/)[0] ?? "";
  }
  if (!info.summary) info.summary = (fields.memo as string).trim();
  if (!info.cover_url && fields.og) {
    info.cover_url = absURL(pageURL, fields.og as string);
    info.thumb_url = info.cover_url;
  }
  for (const m of (fields.sampleScripts as string).matchAll(
    /"(\/contents\/.+?\/\d+?\.\w+?)"/g,
  )) {
    info.preview_images.push(absURL(pageURL, m[1]));
  }

  const rows = await collectPairsSeq(html, "table.movieInfo td");
  for (const row of rows) {
    switch (row.label) {
      case "公開日":
        info.release_date = parseDateLoose(row.value);
        break;
      case "出演":
        info.actors = row.valueTexts;
        break;
      case "シリーズ":
        info.series = row.value.trim().replace(/^-+|-+$/g, "");
        break;
      case "評価":
        info.score = parseScore(row.value);
        break;
    }
  }

  // Inline player scripts: emvideo (MP4) and the `o = {...}` runtime blob.
  if (html.includes("emvideo")) {
    const m = /emvideo = "(.+?)";/.exec(html);
    if (m) info.preview_video_url = absURL(pageURL, m[1]);
  }
  if (html.includes("o = {")) {
    const m = /o = (\{.+?\});/.exec(html);
    if (m) {
      try {
        const data = JSON.parse(m[1]) as { full?: string };
        if (data.full) info.runtime = parseRuntime(data.full);
      } catch {
        // ignore
      }
    }
  }

  // Player container script: stream = 'a'+siteID+'b'+movieId+'c' -> m3u8.
  const pc = /movieId\s*=\s*'(\d+?)';/.exec(html);
  const sc = /siteID\s*=\s*'(\d+?)';/.exec(html);
  const stream = /stream\s*=\s*'(.+?)'\+siteID\+'(.+?)'\+movieId\+'(.+?)';/.exec(html);
  if (pc && sc && stream) {
    try {
      const m3u8URL = absURL(pageURL, stream[1] + sc[1] + stream[2] + pc[1] + stream[3]);
      const playlist = await fetchText(m3u8URL, { providerName: "HEYZO" });
      if (playlist.status >= 200 && playlist.status < 300) {
        info.preview_video_hls_url = playlist.url;
        const mediaURI = pickBestMediaURI(playlist.text, playlist.url);
        if (mediaURI) {
          const m = /\/sample\/(\d+)\/(\d+)\/ts\.(.+?)\.m3u8/.exec(mediaURI);
          if (m) {
            info.preview_video_url = SAMPLE_URL.replace("%s", m[1])
              .replace("%s", m[2])
              .replace("%s", m[3]);
          }
        }
      }
    } catch {
      // HLS probing is best-effort
    }
  }
  return info;
}

/** Pick the media playlist URI with the highest BANDWIDTH (master playlist). */
function pickBestMediaURI(playlist: string, base: string): string {
  const lines = playlist.split(/\r?\n/);
  let best = "";
  let bestBandwidth = -1;
  let pendingBandwidth = -1;
  for (const line of lines) {
    if (line.startsWith("#EXT-X-STREAM-INF")) {
      const m = /BANDWIDTH=(\d+)/.exec(line);
      pendingBandwidth = m ? parseInt(m[1], 10) : 0;
    } else if (line && !line.startsWith("#")) {
      if (pendingBandwidth > bestBandwidth) {
        bestBandwidth = pendingBandwidth;
        best = line.trim();
      }
      pendingBandwidth = -1;
    }
  }
  if (!best) {
    // Media playlist (not master): use the playlist URL itself.
    return base;
  }
  return absURL(base, best);
}

export const heyzoProvider: MovieProvider = {
  name: "HEYZO",
  priority: 1000,

  normalizeMovieID(id: string): string {
    const m = /^(?:heyzo[-_])?(\d+)$/i.exec(id.trim());
    return m ? m[1] : "";
  },

  parseMovieIDFromURL(rawURL: string): string | null {
    try {
      const parts = new URL(rawURL).pathname.split("/").filter(Boolean);
      const id = parts.length >= 2 ? parts[parts.length - 2] : "";
      return id ? decodeURIComponent(id) : null;
    } catch {
      return null;
    }
  },

  async getMovieInfoByID(id: string): Promise<MovieInfo> {
    const normalized = heyzoProvider.normalizeMovieID(id);
    if (!normalized) throw new ProviderError(`invalid id: ${id}`, "invalid");
    return heyzoProvider.getMovieInfoByURL(
      MOVIE_URL.replace("%s", normalized.padStart(4, "0")),
    );
  },

  async getMovieInfoByURL(rawURL: string): Promise<MovieInfo> {
    const id = heyzoProvider.parseMovieIDFromURL(rawURL);
    if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    const r = await fetchPage(rawURL, {
      providerName: "HEYZO",
      notFoundMessage: `movie not found: ${id}`,
    });
    const info = await parseHeyzoPage(r.text, rawURL, id);
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    return info;
  },
};
