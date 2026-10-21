// MYWIFE （舞ワイフ) — slim port of provider/mywife from
// metatube-sdk-go. Model pages at /teigaku/model/no/{id}; the thumb is
// resolved by HEAD-ing the cover URL variant (topview.jpg -> thumb.jpg)
// and keeping the final redirected URL, as the Go version does.

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
  fetchPage,
  fetchText,
} from "../lib/scrape";

const MOVIE_URL = "https://mywife.cc/teigaku/model/no/%s";

export async function parseMywifePage(
  html: string,
  pageURL: string,
  id: string,
): Promise<MovieInfo> {
  const info = baseMovieInfo("MYWIFE", id, pageURL);
  info.number = `MYWIFE-${id}`;
  info.maker = "舞ワイフ";

  const fields = await collectFields(html, [
    { key: "title", selector: "title", mode: "text" },
    { key: "summary", selector: "div.modelsamplephototop span.text_overflow", mode: "text" },
    { key: "videoSrc", selector: "div.modelsamplephototop video#video", mode: "attr", attr: "src" },
    { key: "poster", selector: "div.modelsamplephototop video#video", mode: "attr", attr: "poster" },
    { key: "previews", selector: "div.modelsamplephoto div.modelsample_photowaku img", mode: "attrs", attr: "src" },
  ]);
  info.title = (fields.title as string).trim();
  info.summary = (fields.summary as string).trim();
  if (fields.videoSrc) info.preview_video_url = absURL(pageURL, fields.videoSrc as string);
  if (fields.poster) info.cover_url = absURL(pageURL, fields.poster as string);
  for (const src of fields.previews as string[]) {
    if (src) info.preview_images.push(absURL(pageURL, src));
  }

  if (info.cover_url) {
    try {
      const derived = info.cover_url.replaceAll("topview.jpg", "thumb.jpg");
      const head = await fetchText(derived, { providerName: "MYWIFE", method: "HEAD" });
      if (head.status >= 200 && head.status < 300) {
        info.thumb_url = head.url;
      }
    } catch {
      // thumb probing is best-effort
    }
  }
  return info;
}

export const mywifeProvider: MovieProvider = {
  name: "MYWIFE",
  priority: 1000,

  normalizeMovieID(id: string): string {
    const m = /^(?:mywife[-_])?(\d+)$/i.exec(id.trim());
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
    const normalized = mywifeProvider.normalizeMovieID(id);
    if (!normalized) throw new ProviderError(`invalid id: ${id}`, "invalid");
    return mywifeProvider.getMovieInfoByURL(MOVIE_URL.replace("%s", normalized));
  },

  async getMovieInfoByURL(rawURL: string): Promise<MovieInfo> {
    const id = mywifeProvider.parseMovieIDFromURL(rawURL);
    if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    const r = await fetchPage(rawURL, {
      providerName: "MYWIFE",
      notFoundMessage: `movie not found: ${id}`,
    });
    const info = await parseMywifePage(r.text, rawURL, id);
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    return info;
  },
};
