// 0930-family core — port of provider/h0930/core from metatube-sdk-go,
// shared by C0930, H0930 and H4610. Movie pages live at
// /moviepages/{id}/index.html and carry a JSON-LD block with most
// metadata; a definition list and the <video> element fill the rest.

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
  collectPairs,
  extractJsonLd,
  fetchPage,
  parseDateLoose,
} from "../lib/scrape";
import { parseRuntime, parseScore } from "../lib/textutil";

export interface Site0930Config {
  name: string;
  baseURL: string;
  maker: string;
}

function idFromPath(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : "";
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export async function parse0930Page(
  html: string,
  pageURL: string,
  cfg: Site0930Config,
  id: string,
): Promise<MovieInfo> {
  const info = baseMovieInfo(cfg.name, id, pageURL);
  info.number = `${cfg.name.toLowerCase()}-${id}`;
  info.maker = cfg.maker;

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
    { key: "playTitle", selector: "#moviePlay .moviePlay_title h1 span", mode: "text" },
    { key: "poster", selector: "#movieContent", mode: "attr", attr: "poster" },
    { key: "videoSrc", selector: "#movieContent source", mode: "attr", attr: "src" },
    { key: "galleryScripts", selector: "#movieGallery script", mode: "text" },
  ]);
  const playTitle = (fields.playTitle as string).trim();
  if (playTitle) info.title = playTitle;
  const poster = fields.poster as string;
  if (poster) {
    info.cover_url = absURL(pageURL, poster);
    info.thumb_url = info.cover_url;
  }
  const videoSrc = fields.videoSrc as string;
  if (videoSrc) info.preview_video_url = absURL(pageURL, videoSrc);
  for (const m of (fields.galleryScripts as string).matchAll(/href="(.+?)"/g)) {
    if (!m[1].includes("member")) info.preview_images.push(m[1]);
  }

  const rows = await collectPairs(html, "#movieInfo dt", "#movieInfo dd");
  for (const row of rows) {
    switch (row.label) {
      case "動画":
        if (info.runtime === 0) info.runtime = parseRuntime(row.value);
        break;
      case "公開日":
        if (!info.release_date) info.release_date = parseDateLoose(row.value);
        break;
      case "プレイ内容":
        for (const genre of row.value.split("\u00A0")) {
          const g = genre.trim();
          if (g) info.genres.push(g);
        }
        break;
    }
  }
  return info;
}

export function make0930Provider(cfg: Site0930Config): MovieProvider {
  const movieURL = `${cfg.baseURL}moviepages/%s/index.html`;
  const idRe = new RegExp(`^(?:${cfg.name}[-_])?([a-z\\d]+)$`, "i");
  const provider: MovieProvider = {
    name: cfg.name,
    priority: 1000,

    normalizeMovieID(id: string): string {
      const m = idRe.exec(id.trim());
      return m ? m[1].toLowerCase() : "";
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
      return provider.getMovieInfoByURL(movieURL.replace("%s", normalized));
    },

    async getMovieInfoByURL(rawURL: string): Promise<MovieInfo> {
      const id = provider.parseMovieIDFromURL(rawURL);
      if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
      const r = await fetchPage(rawURL, {
        providerName: cfg.name,
        notFoundMessage: `movie not found: ${id}`,
      });
      const info = await parse0930Page(r.text, rawURL, cfg, id);
      if (!isValidMovieInfo(info)) {
        throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
      }
      return info;
    },
  };
  return provider;
}

export const site0930Configs: Site0930Config[] = [
  { name: "C0930", baseURL: "https://www.c0930.com/", maker: "人妻斬り" },
  { name: "H0930", baseURL: "https://www.h0930.com/", maker: "エッチな0930" },
  { name: "H4610", baseURL: "https://www.h4610.com/", maker: "エッチな4610" },
];

export const site0930Providers: MovieProvider[] = site0930Configs.map(make0930Provider);
