// FC2CMADB — the community FC2 database at fc2cmadb.com, successor
// to the defunct fc2ppvdb.com (this provider replaces FC2PPVDB).
// The site is a Laravel + Inertia app: every page embeds its props
// as JSON in a <script data-page="app"> block, so the article
// record is parsed out of that JSON rather than scraped from DOM.
// Info only (by FC2 video number), like the official FC2 provider.

import {
  MovieInfo,
  MovieProvider,
  ProviderError,
  isValidMovieInfo,
} from "../types";
import { baseMovieInfo, fetchText } from "../lib/scrape";
import { parseRuntime } from "../lib/textutil";
import { fc2ParseNumber } from "./fc2hub";

const MOVIE_URL = "https://fc2cmadb.com/articles/%s";

interface CmaWriter {
  name?: string;
  slug?: string;
}

interface CmaArticle {
  video_id?: string;
  title?: string;
  release_date?: string;
  duration?: string;
  image_url?: string;
  not_found?: string;
  writer?: CmaWriter;
  tags?: { name?: string }[];
}

/** Extract the article record from an Inertia page's props JSON. */
export function parseCmadbArticle(html: string): CmaArticle | null {
  const m =
    /<script data-page="app" type="application\/json">([\s\S]*?)<\/script>/.exec(
      html,
    );
  if (!m) return null;
  try {
    const page = JSON.parse(m[1]) as {
      props?: { article?: CmaArticle };
    };
    return page.props?.article ?? null;
  } catch {
    return null;
  }
}

export function parseCmadbPage(
  html: string,
  pageURL: string,
  id: string,
): MovieInfo {
  const article = parseCmadbArticle(html);
  if (!article || !article.video_id) {
    throw new ProviderError(`movie not found: ${id}`, "not_found");
  }
  if (article.not_found === "True") {
    throw new ProviderError(`movie not found: ${id}`, "not_found");
  }
  const info = baseMovieInfo("FC2CMADB", String(article.video_id), pageURL);
  info.number = `FC2-${article.video_id}`;
  info.title = (article.title ?? "").trim();
  info.release_date = article.release_date ?? "";
  info.runtime = parseRuntime(article.duration ?? "");
  info.maker = article.writer?.name ?? "";
  info.genres = (article.tags ?? [])
    .map((t) => (t.name ?? "").trim())
    .filter(Boolean);
  const img = article.image_url ?? "";
  info.thumb_url = img;
  // The FC2 thumbnail CDN serves larger renditions by width segment.
  info.cover_url = img.includes("/w276/") ? img.replace("/w276/", "/w800/") : img;
  return info;
}

export const fc2cmadbProvider: MovieProvider = {
  name: "FC2CMADB",
  priority: 998,

  normalizeMovieID(id: string): string {
    return fc2ParseNumber(id);
  },

  parseMovieIDFromURL(rawURL: string): string | null {
    try {
      const parts = new URL(rawURL).pathname.split("/").filter(Boolean);
      const base = parts[parts.length - 1] ?? "";
      return fc2ParseNumber(decodeURIComponent(base)) || null;
    } catch {
      return null;
    }
  },

  async getMovieInfoByID(id: string): Promise<MovieInfo> {
    const normalized = fc2cmadbProvider.normalizeMovieID(id);
    if (!normalized) throw new ProviderError(`invalid id: ${id}`, "invalid");
    return fc2cmadbProvider.getMovieInfoByURL(
      MOVIE_URL.replace("%s", normalized),
    );
  },

  async getMovieInfoByURL(rawURL: string): Promise<MovieInfo> {
    const id = fc2cmadbProvider.parseMovieIDFromURL(rawURL);
    if (!id) {
      throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    }
    const r = await fetchText(rawURL, { providerName: "FC2CMADB" });
    if (r.status === 404) {
      throw new ProviderError(`movie not found: ${id}`, "not_found");
    }
    if (r.status < 200 || r.status >= 300) {
      throw new ProviderError(`http ${r.status} for ${rawURL}`, "upstream");
    }
    const info = parseCmadbPage(r.text, rawURL, id);
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    return info;
  },
};
