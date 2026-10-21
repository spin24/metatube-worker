// FC2PPVDB — port of provider/fc2ppvdb from metatube-sdk-go.
// Article pages carry a positional header block (cover + title) and
// label rows whose label is the row div's first text node followed by
// a <span> value; the rows are extracted with a regex over the source
// because the labels are bare text nodes (not elements).

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
import { parseRuntime } from "../lib/textutil";
import { fc2ParseNumber } from "./fc2hub";

const MOVIE_URL = "https://fc2ppvdb.com/articles/%s";

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/** Split a span's inner HTML into its text pieces (Go ParseTexts). */
function textPieces(inner: string): string[] {
  return inner
    .split(/<[^>]+>/)
    .map((t) => decodeEntities(t).trim())
    .filter(Boolean);
}

export async function parseFc2ppvdbPage(
  html: string,
  pageURL: string,
  id: string,
): Promise<MovieInfo> {
  const info = baseMovieInfo("FC2PPVDB", id, pageURL);
  info.number = `FC2-${id}`;

  try {
    const fields = await collectFields(html, [
      { key: "cover", selector: "main a > img", mode: "attr", attr: "src" },
      { key: "title", selector: "main h2 a", mode: "text" },
      { key: "ogTitle", selector: 'meta[property="og:title"]', mode: "attr", attr: "content" },
      { key: "ogImage", selector: 'meta[property="og:image"]', mode: "attr", attr: "content" },
    ]);
    if (fields.cover) info.cover_url = absURL(pageURL, fields.cover as string);
    info.title = (fields.title as string).trim();
    if (!info.title) info.title = (fields.ogTitle as string).trim();
    if (!info.cover_url && fields.ogImage) {
      info.cover_url = absURL(pageURL, fields.ogImage as string);
    }
  } catch {
    // keep regex-extracted fields only
  }
  info.thumb_url = info.cover_url;

  const rowRe =
    /(ID|販売者|女優|モザイク|販売日|収録時間|タグ)：<span[^>]*>([\s\S]*?)<\/span>/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const label = m[1];
    const inner = m[2];
    switch (label) {
      case "ID":
        info.id = stripTags(inner) || info.id;
        break;
      case "販売者":
        info.maker = stripTags(inner);
        break;
      case "女優":
        info.actors = textPieces(inner);
        break;
      case "販売日":
        info.release_date = parseDateLoose(stripTags(inner));
        break;
      case "収録時間":
        info.runtime = parseRuntime(stripTags(inner));
        break;
      case "タグ":
        info.genres = textPieces(inner);
        break;
    }
  }
  return info;
}

export const fc2ppvdbProvider: MovieProvider = {
  name: "FC2PPVDB",
  priority: 998,

  normalizeMovieID(id: string): string {
    return fc2ParseNumber(id).replace(/^FC2-/, "");
  },

  parseMovieIDFromURL(rawURL: string): string | null {
    try {
      const parts = new URL(rawURL).pathname.split("/").filter(Boolean);
      return parts[parts.length - 1] ?? null;
    } catch {
      return null;
    }
  },

  async getMovieInfoByID(id: string): Promise<MovieInfo> {
    const normalized = fc2ppvdbProvider.normalizeMovieID(id);
    if (!normalized) throw new ProviderError(`invalid id: ${id}`, "invalid");
    return fc2ppvdbProvider.getMovieInfoByURL(MOVIE_URL.replace("%s", normalized));
  },

  async getMovieInfoByURL(rawURL: string): Promise<MovieInfo> {
    const id = fc2ppvdbProvider.parseMovieIDFromURL(rawURL);
    if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    const r = await fetchPage(rawURL, {
      providerName: "FC2PPVDB",
      notFoundMessage: `movie not found: ${id}`,
    });
    const info = await parseFc2ppvdbPage(r.text, rawURL, id);
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    return info;
  },
};
