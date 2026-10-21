// Getchu (dl.getchu.com) — port of provider/getchu from
// metatube-sdk-go. No search in the Go version either. The item pages
// are old table layouts (Shift_JIS): the title/cover/gallery cells are
// identified by presentational attributes exactly as in Go, and the
// spec rows are label/value td pairs (extracted by regex because the
// page is one nest of layout tables).

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
  decodeEntities,
  fetchPage,
  parseDateLoose,
} from "../lib/scrape";

const MOVIE_URL = "https://dl.getchu.com/i/item%s";

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export async function parseGetchuPage(
  html: string,
  pageURL: string,
  id: string,
): Promise<MovieInfo> {
  const info = baseMovieInfo("Getchu", id, pageURL);
  info.number = `GETCHU-${id}`;

  // Attribute-identified cells, mirroring the Go //td switch.
  try {
    const fields = await collectFields(html, [
      {
        key: "titleDiv",
        selector: 'td div[style="color: #333333; padding: 3px 0px 0px 5px;"]',
        mode: "text",
      },
      { key: "cover", selector: 'td[bgcolor="#ffffff"] img', mode: "attr", attr: "src" },
      { key: "ogTitle", selector: 'meta[property="og:title"]', mode: "attr", attr: "content" },
      { key: "ogImage", selector: 'meta[property="og:image"]', mode: "attr", attr: "content" },
    ]);
    info.title = (fields.titleDiv as string).trim();
    if (!info.title) info.title = (fields.ogTitle as string).trim();
    if (fields.cover) info.cover_url = absURL(pageURL, fields.cover as string);
    if (!info.cover_url && fields.ogImage) {
      info.cover_url = absURL(pageURL, fields.ogImage as string);
    }
  } catch {
    // a rejected selector must not sink the whole parse
  }
  try {
    const fields = await collectFields(html, [
      {
        key: "previews",
        selector: 'td[style*="background-color: #444444;"] a',
        mode: "attrs",
        attr: "href",
      },
    ]);
    info.preview_images = (fields.previews as string[]).map((u) => absURL(pageURL, u));
  } catch {
    // substring attribute selectors may be unsupported; previews only
  }

  // Spec rows: <td>label</td><td>value</td> pairs.
  const rowRe =
    /<td[^>]*>\s*(サークル|配信開始日|趣向|作品内容)\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const label = m[1];
    const rawValue = m[2];
    switch (label) {
      case "サークル":
        info.label = stripTags(rawValue);
        break;
      case "配信開始日":
        info.release_date = parseDateLoose(stripTags(rawValue));
        break;
      case "趣向":
        info.genres = stripTags(rawValue)
          .split(/[\s、,]+/)
          .map((g) => g.trim())
          .filter(Boolean);
        break;
      case "作品内容":
        info.summary = stripTags(rawValue);
        break;
    }
  }

  if (!info.thumb_url) info.thumb_url = info.cover_url;
  return info;
}

export const getchuProvider: MovieProvider = {
  name: "Getchu",
  priority: 1000,

  normalizeMovieID(id: string): string {
    const m = /^(?:GETCHU[-_])?(\d+)$/i.exec(id.trim());
    return m ? m[1] : "";
  },

  parseMovieIDFromURL(rawURL: string): string | null {
    try {
      const parts = new URL(rawURL).pathname.split("/").filter(Boolean);
      const base = parts[parts.length - 1] ?? "";
      // Go uses strings.TrimLeft(path.Base, "item"): cuts any of those
      // letters from the left, e.g. "item4018339" -> "4018339".
      return base.replace(/^[item]+/, "") || null;
    } catch {
      return null;
    }
  },

  async getMovieInfoByID(id: string): Promise<MovieInfo> {
    const normalized = getchuProvider.normalizeMovieID(id);
    if (!normalized) throw new ProviderError(`invalid id: ${id}`, "invalid");
    return getchuProvider.getMovieInfoByURL(MOVIE_URL.replace("%s", normalized));
  },

  async getMovieInfoByURL(rawURL: string): Promise<MovieInfo> {
    const id = getchuProvider.parseMovieIDFromURL(rawURL);
    if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    const r = await fetchPage(rawURL, {
      providerName: "Getchu",
      notFoundMessage: `movie not found: ${id}`,
    });
    const info = await parseGetchuPage(r.text, rawURL, id);
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    return info;
  },
};
