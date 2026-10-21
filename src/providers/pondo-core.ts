// 1Pondo-family core — port of provider/1pondo/core from metatube-sdk-go,
// shared by 1Pondo, 10musume, PACOPACOMAMA and MURAMURA. These sites all
// expose a JSON detail API (/dyn/phpauto/movie_details/movie_id/{id}.json)
// plus an optional JSON gallery, so no HTML parsing is involved.
// (The Go core also implements reviews; intentionally not ported.)

import { MovieInfo, MovieProvider, ProviderError, isValidMovieInfo } from "../types";
import { absURL, baseMovieInfo, fetchPage, parseDateLoose } from "../lib/scrape";

export interface PondoConfig {
  name: string;
  priority: number;
  baseURL: string;
  movieURL: string;
  sampleVideoURL: string;
  maker: string;
  galleryPath: string;
  legacyGalleryPath: string;
  idPattern: RegExp;
}

export interface PondoDetail {
  ActressesJa?: string[];
  AvgRating?: number;
  Desc?: string;
  Duration?: number;
  Gallery?: boolean;
  HasGallery?: boolean;
  MovieID?: string;
  MovieThumb?: string;
  Release?: string;
  Series?: string;
  ThumbHigh?: string;
  ThumbLow?: string;
  ThumbMed?: string;
  ThumbUltra?: string;
  Title?: string;
  UCNAME?: string[];
  SampleFiles?: { FileSize: number; URL: string }[];
}

export function sprintf(template: string, ...args: string[]): string {
  let i = 0;
  return template.replace(/%s/g, () => args[i++] ?? "");
}

/** Map a detail-JSON payload to MovieInfo (gallery images excluded). */
export function parsePondoDetail(
  data: PondoDetail,
  detailURL: string,
  cfg: PondoConfig,
  homepage: string,
): MovieInfo {
  const info = baseMovieInfo(cfg.name, data.MovieID ?? "", homepage);
  info.number = data.MovieID ?? "";
  info.title = data.Title ?? "";
  info.summary = data.Desc ?? "";
  info.series = data.Series ?? "";
  info.maker = cfg.maker;
  info.release_date = parseDateLoose(data.Release);
  info.runtime = Math.floor((data.Duration ?? 0) / 60);
  if (typeof data.AvgRating === "number" && data.AvgRating <= 5) {
    info.score = data.AvgRating;
  }
  if (data.UCNAME && data.UCNAME.length > 0) info.genres = data.UCNAME;
  for (const actor of data.ActressesJa ?? []) {
    const a = actor.replace(/^-+|-+$/g, "");
    if (a) info.actors.push(a);
  }
  if (data.SampleFiles && data.SampleFiles.length > 0) {
    const sorted = [...data.SampleFiles].sort((a, b) => a.FileSize - b.FileSize);
    info.preview_video_url = absURL(detailURL, sorted[sorted.length - 1].URL);
    info.preview_video_hls_url = sprintf(cfg.sampleVideoURL, data.MovieID ?? "");
  }
  for (const thumb of [data.ThumbUltra, data.ThumbHigh, data.ThumbMed, data.ThumbLow]) {
    if (thumb) {
      const fixed = thumb.replace(/^https?:\/\/\//, "/");
      info.cover_url = absURL(detailURL, fixed);
      info.thumb_url = info.cover_url;
      break;
    }
  }
  if (data.MovieThumb) {
    info.thumb_url = absURL(detailURL, data.MovieThumb);
  }
  return info;
}

export function makePondoProvider(cfg: PondoConfig): MovieProvider {
  const provider: MovieProvider = {
    name: cfg.name,
    priority: cfg.priority,

    normalizeMovieID(id: string): string {
      const t = id.trim();
      return cfg.idPattern.test(t) ? t : "";
    },

    parseMovieIDFromURL(rawURL: string): string | null {
      try {
        const parts = new URL(rawURL).pathname.split("/").filter(Boolean);
        const base = parts[parts.length - 1] ?? "";
        return base ? decodeURIComponent(base) : null;
      } catch {
        return null;
      }
    },

    async getMovieInfoByID(id: string): Promise<MovieInfo> {
      const normalized = provider.normalizeMovieID(id);
      if (!normalized) throw new ProviderError(`invalid id: ${id}`, "invalid");
      return provider.getMovieInfoByURL(sprintf(cfg.movieURL, normalized));
    },

    async getMovieInfoByURL(rawURL: string): Promise<MovieInfo> {
      const id = provider.parseMovieIDFromURL(rawURL);
      if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
      const homepage = sprintf(cfg.movieURL, id);
      const detailURL = new URL(
        `/dyn/phpauto/movie_details/movie_id/${id}.json`,
        homepage,
      ).toString();
      const r = await fetchPage(detailURL, {
        providerName: cfg.name,
        notFoundMessage: `movie not found: ${id}`,
      });
      let data: PondoDetail;
      try {
        data = JSON.parse(r.text) as PondoDetail;
      } catch {
        throw new ProviderError(`bad detail json: ${id}`, "not_found");
      }
      if (!data.MovieID) {
        throw new ProviderError(`movie not found: ${id}`, "not_found");
      }
      const info = parsePondoDetail(data, detailURL, cfg, homepage);
      // Preview images from the JSON gallery (new or legacy endpoint).
      try {
        if (data.Gallery && cfg.galleryPath) {
          const gURL = new URL(`/dyn/dla/json/movie_gallery/${id}.json`, homepage).toString();
          const g = await fetchPage(gURL, { providerName: cfg.name });
          const galleries = JSON.parse(g.text) as { Rows?: { Img: string; Protected: boolean }[] };
          for (const row of galleries.Rows ?? []) {
            if (!row.Protected) {
              info.preview_images.push(absURL(gURL, sprintf(cfg.galleryPath, row.Img)));
            }
          }
        } else if (data.HasGallery && cfg.legacyGalleryPath) {
          const gURL = new URL(
            `/dyn/phpauto/movie_galleries/movie_id/${id}.json`,
            homepage,
          ).toString();
          const g = await fetchPage(gURL, { providerName: cfg.name });
          const galleries = JSON.parse(g.text) as {
            Rows?: { MovieID: string; Filename: string; Protected: boolean }[];
          };
          for (const row of galleries.Rows ?? []) {
            if (!row.Protected) {
              info.preview_images.push(
                absURL(gURL, sprintf(cfg.legacyGalleryPath, row.MovieID, row.Filename)),
              );
            }
          }
        }
      } catch {
        // gallery is best-effort, like the Go version's nested visits
      }
      if (!isValidMovieInfo(info)) {
        throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
      }
      return info;
    },
  };
  return provider;
}

export const pondoConfigs: PondoConfig[] = [
  {
    name: "1Pondo",
    priority: 1000,
    baseURL: "https://www.1pondo.tv/",
    movieURL: "https://www.1pondo.tv/movies/%s/",
    sampleVideoURL: "https://fms.1pondo.tv/sample/%s/mb.m3u8",
    maker: "一本道",
    galleryPath: "/dyn/dla/images/%s",
    legacyGalleryPath: "/assets/sample/%s/popu/%s",
    idPattern: /^\d{6}_\d{3}$/,
  },
  {
    name: "10musume",
    priority: 1000,
    baseURL: "https://www.10musume.com/",
    movieURL: "https://www.10musume.com/movies/%s/",
    sampleVideoURL: "https://fms.10musume.com/sample/%s/mb.m3u8",
    maker: "天然むすめ",
    galleryPath: "/dyn/dla/images/%s",
    legacyGalleryPath: "/assets/sample/%s/%s",
    idPattern: /^\d{6}_\d{2}$/,
  },
  {
    name: "PACOPACOMAMA",
    priority: 999,
    baseURL: "https://www.pacopacomama.com/",
    movieURL: "https://www.pacopacomama.com/movies/%s/",
    sampleVideoURL: "https://fms.pacopacomama.com/sample/%s/mb.m3u8",
    maker: "パコパコママ",
    galleryPath: "/dyn/dla/images/%s",
    legacyGalleryPath: "/assets/sample/%s/l/%s",
    idPattern: /^\d{6}_\d{3}$/,
  },
  {
    name: "MURAMURA",
    priority: 999,
    baseURL: "https://www.muramura.tv/",
    movieURL: "https://www.muramura.tv/movies/%s/",
    sampleVideoURL: "https://fms.muramura.tv/sample/%s/mb.m3u8",
    maker: "ムラムラってくる素人",
    galleryPath: "",
    legacyGalleryPath: "",
    idPattern: /^\d{6}_\d{3}$/,
  },
];

export const pondoProviders: MovieProvider[] = pondoConfigs.map(makePondoProvider);
