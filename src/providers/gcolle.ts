// Gcolle — port of provider/gcolle from metatube-sdk-go, adapted to
// the site's redesign: gcolle.net dropped its osCommerce layout (the
// Go version's #cart_quantity XPaths no longer match anything), and
// product pages now live at /adult/contents/{id} with schema.org
// Product JSON-LD, which this parser uses. The score still comes from
// rating.gcolle.net when available.

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
  extractJsonLd,
  fetchPage,
  fetchText,
} from "../lib/scrape";

const MOVIE_URL = "https://gcolle.net/adult/contents/%s";
const SCORE_URL = "https://rating.gcolle.net/ratings/products/%s.js";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export async function parseGcollePage(
  html: string,
  pageURL: string,
  id: string,
): Promise<MovieInfo> {
  const info = baseMovieInfo("Gcolle", id, pageURL);
  info.number = `GCOLLE-${id}`;

  for (const block of extractJsonLd(html)) {
    const type = str(block["@type"]);
    if (type === "Product") {
      info.title = str(block["name"]);
      info.summary = str(block["description"]);
      const image = block["image"];
      const img = Array.isArray(image) ? str(image[0]) : str(image);
      if (img) info.cover_url = absURL(pageURL, img);
      const brand = block["brand"] as Record<string, unknown> | undefined;
      if (brand && str(brand["name"])) info.maker = str(brand["name"]);
    } else if (type === "BreadcrumbList") {
      const items = block["itemListElement"];
      if (Array.isArray(items)) {
        for (const item of items as Record<string, unknown>[]) {
          // position 2 is the category in the new layout's breadcrumbs
          if (item["position"] === 2 && str(item["name"])) {
            info.genres = [str(item["name"])];
          }
        }
      }
    }
  }

  if (!info.cover_url || !info.title) {
    const fields = await collectFields(html, [
      { key: "ogImage", selector: 'meta[property="og:image"]', mode: "attr", attr: "content" },
      { key: "h1", selector: "h1", mode: "text" },
    ]);
    if (!info.cover_url && fields.ogImage) {
      info.cover_url = absURL(pageURL, fields.ogImage as string);
    }
    if (!info.title) info.title = (fields.h1 as string).trim();
  }
  info.thumb_url = info.cover_url;

  // Score from the rating script (best-effort; legacy endpoint).
  try {
    const r = await fetchText(SCORE_URL.replace("%s", id), { providerName: "Gcolle" });
    if (r.status >= 200 && r.status < 300) {
      const data = JSON.parse(r.text) as { rating?: number };
      if (typeof data.rating === "number") info.score = data.rating;
    }
  } catch {
    // ignore
  }
  return info;
}

export const gcolleProvider: MovieProvider = {
  name: "Gcolle",
  priority: 1000,

  normalizeMovieID(id: string): string {
    const m = /^(?:GCOLLE[-_])?(\d+)$/i.exec(id.trim());
    return m ? m[1] : "";
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
    const normalized = gcolleProvider.normalizeMovieID(id);
    if (!normalized) throw new ProviderError(`invalid id: ${id}`, "invalid");
    return gcolleProvider.getMovieInfoByURL(MOVIE_URL.replace("%s", normalized));
  },

  async getMovieInfoByURL(rawURL: string): Promise<MovieInfo> {
    const id = gcolleProvider.parseMovieIDFromURL(rawURL);
    if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    const r = await fetchPage(rawURL, {
      providerName: "Gcolle",
      notFoundMessage: `movie not found: ${id}`,
    });
    const info = await parseGcollePage(r.text, rawURL, id);
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    return info;
  },
};
