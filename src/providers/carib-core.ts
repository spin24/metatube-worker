// Caribbeancom-family core — port of provider/caribbeancom/core from
// metatube-sdk-go, shared by Caribbeancom and CaribbeancomPR. Movie pages
// live at /moviepages/{id}/index.html; metadata sits in #moviepages
// label/value rows, images and the sample video hide in inline scripts.
// (The Go core also implements reviews; intentionally not ported.)

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
  parseDateLoose,
} from "../lib/scrape";
import { parseRuntime } from "../lib/textutil";

export interface CaribConfig {
  name: string;
  priority: number;
  baseURL: string;
  movieURL: string;
  maker: string;
  idPattern: RegExp;
}

function idFromPath(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : "";
}

export async function parseCaribPage(
  html: string,
  pageURL: string,
  cfg: CaribConfig,
  id: string,
): Promise<MovieInfo> {
  const info = baseMovieInfo(cfg.name, id, pageURL);
  info.number = id;
  info.maker = cfg.maker;

  const fields = await collectFields(html, [
    { key: "titleMain", selector: 'h1[itemprop="name"]', mode: "text" },
    { key: "summaryMain", selector: 'p[itemprop="description"]', mode: "text" },
    { key: "titleFallback", selector: "#moviepages h1", mode: "text" },
    { key: "summaryFallback", selector: "#moviepages p", mode: "text" },
    { key: "gallery", selector: "div.gallery-ratio > a", mode: "attrs", attr: "href" },
  ]);
  info.title =
    (fields.titleMain as string).trim() || (fields.titleFallback as string).trim();
  info.summary =
    (fields.summaryMain as string).trim() || (fields.summaryFallback as string).trim();
  for (const href of fields.gallery as string[]) {
    if (!href.includes("member")) {
      info.preview_images.push(absURL(pageURL, href));
    }
  }

  const rows = await collectPairsSeq(html, "#moviepages li > span");
  for (const row of rows) {
    switch (row.label) {
      case "出演":
        for (const actor of row.valueTexts) {
          const a = actor.replace(/^-+|-+$/g, "");
          if (a) info.actors.push(a);
        }
        break;
      case "配信日":
      case "販売日":
        info.release_date = parseDateLoose(row.value);
        break;
      case "再生時間":
        info.runtime = parseRuntime(row.value);
        break;
      case "シリーズ":
        info.series = row.valueFirstLink;
        break;
      case "スタジオ":
        info.maker = row.valueFirstLink || info.maker;
        break;
      case "タグ":
        info.genres = row.valueTexts;
        break;
      case "ユーザー評価":
        info.score = Array.from(row.value.trim()).length;
        break;
    }
  }

  // Thumb / preview video hide in inline scripts (first match wins,
  // evaluated in the Go version's emimg -> posterImage -> Movie order).
  const emimg = /emimg\s*=\s*'(.+?)';/.exec(html);
  const poster = /posterImage\s*=\s*'(.+?)'\+movie_id\+'(.+?)';/.exec(html);
  const movieObj = /Movie\s*=\s*(\{.+?\});/.exec(html);
  if (emimg) {
    info.thumb_url = absURL(pageURL, emimg[1]);
    info.cover_url = info.thumb_url;
  } else if (poster) {
    info.thumb_url = absURL(pageURL, poster[1] + id + poster[2]);
    info.cover_url = info.thumb_url;
  } else if (movieObj) {
    try {
      const data = JSON.parse(movieObj[1]) as {
        sample_flash_url?: string;
        sample_m_flash_url?: string;
      };
      for (const sample of [data.sample_flash_url, data.sample_m_flash_url]) {
        if (sample) {
          info.preview_video_url = absURL(pageURL, sample);
          break;
        }
      }
    } catch {
      // ignore malformed Movie object
    }
  }

  // Release-date fallback: the ID itself starts with an MMDDYY date.
  if (!info.release_date) {
    const m = /(\d{6})[-_]\d+/.exec(info.id);
    if (m) {
      const d = m[1];
      info.release_date = `20${d.slice(4, 6)}-${d.slice(0, 2)}-${d.slice(2, 4)}`;
    }
  }
  return info;
}

export function makeCaribProvider(cfg: CaribConfig): MovieProvider {
  const provider: MovieProvider = {
    name: cfg.name,
    priority: cfg.priority,

    normalizeMovieID(id: string): string {
      const t = id.trim();
      return cfg.idPattern.test(t) ? t : "";
    },

    parseMovieIDFromURL(rawURL: string): string | null {
      try {
        const id = idFromPath(new URL(rawURL).pathname);
        return id ? decodeURIComponent(id) : null;
      } catch {
        return null;
      }
    },

    async getMovieInfoByID(id: string): Promise<MovieInfo> {
      const normalized = provider.normalizeMovieID(id);
      if (!normalized) throw new ProviderError(`invalid id: ${id}`, "invalid");
      return provider.getMovieInfoByURL(cfg.movieURL.replace("%s", normalized));
    },

    async getMovieInfoByURL(rawURL: string): Promise<MovieInfo> {
      const id = provider.parseMovieIDFromURL(rawURL);
      if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
      const r = await fetchPage(rawURL, {
        providerName: cfg.name,
        notFoundMessage: `movie not found: ${id}`,
      });
      const info = await parseCaribPage(r.text, rawURL, cfg, id);
      if (!isValidMovieInfo(info)) {
        throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
      }
      return info;
    },
  };
  return provider;
}

export const caribConfigs: CaribConfig[] = [
  {
    name: "Caribbeancom",
    priority: 1000,
    baseURL: "https://www.caribbeancom.com/",
    movieURL: "https://www.caribbeancom.com/moviepages/%s/index.html",
    maker: "カリビアンコム",
    idPattern: /^\d{6}-\d{3}$/,
  },
  {
    name: "CaribbeancomPR",
    priority: 999,
    baseURL: "https://www.caribbeancompr.com/",
    movieURL: "https://www.caribbeancompr.com/moviepages/%s/index.html",
    maker: "カリビアンコムプレミアム",
    idPattern: /^\d{6}_\d{3}$/,
  },
];

export const caribProviders: MovieProvider[] = caribConfigs.map(makeCaribProvider);
