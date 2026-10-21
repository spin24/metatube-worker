// Pcolle — slim port of provider/pcolle from metatube-sdk-go.
// Product pages at /product/detail/?product_id={id}, gated by an
// AGE_CONF cookie. Metadata sits in a th/td table; tags and gallery
// images are simple lists.

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
  fetchPage,
  parseDateLoose,
} from "../lib/scrape";

const MOVIE_URL = "https://www.pcolle.com/product/detail/?product_id=%s";
const COOKIE = "AGE_CONF=1";

export async function parsePcollePage(
  html: string,
  pageURL: string,
  id: string,
): Promise<MovieInfo> {
  const info = baseMovieInfo("Pcolle", id, pageURL);
  info.number = `PCOLLE-${id}`;

  const rows = await collectPairs(html, "table th", "table td");
  for (const row of rows) {
    switch (row.label) {
      case "販売会員:":
        info.maker = row.value;
        break;
      case "カテゴリー:":
        if (row.valueTexts.length > 0) info.label = row.valueTexts[0];
        break;
      case "商品名:":
        info.title = row.value;
        break;
      case "販売開始日:":
        info.release_date = parseDateLoose(row.value);
        break;
    }
  }

  const fields = await collectFields(html, [
    { key: "titleFallback", selector: "div.title-04", mode: "text" },
    { key: "summaryP", selector: "section.item_description p.fo-14", mode: "text" },
    { key: "summarySection", selector: "section.item_description", mode: "text" },
    { key: "cover", selector: "div.item-content div.part1 article a", mode: "attr", attr: "href" },
    { key: "genres", selector: "section.item_tags li", mode: "texts" },
    { key: "previews", selector: "section.item_images li a", mode: "attrs", attr: "href" },
  ]);
  if (!info.title) info.title = (fields.titleFallback as string).trim();
  const summaryP = (fields.summaryP as string).trim();
  info.summary = summaryP || (fields.summarySection as string).trim();
  if (fields.cover) {
    info.thumb_url = absURL(pageURL, fields.cover as string);
    info.cover_url = info.thumb_url;
  }
  info.genres = fields.genres as string[];
  for (const href of fields.previews as string[]) {
    if (href) info.preview_images.push(absURL(pageURL, href));
  }
  if (!info.cover_url && info.preview_images.length > 0) {
    info.cover_url = info.preview_images[0];
  }
  return info;
}

export const pcolleProvider: MovieProvider = {
  name: "Pcolle",
  priority: 1000,

  normalizeMovieID(id: string): string {
    const m = /^(?:PCOLLE[-_])?([a-z\d]{9,})$/i.exec(id.trim());
    return m ? m[1].toLowerCase() : "";
  },

  parseMovieIDFromURL(rawURL: string): string | null {
    try {
      const pid = new URL(rawURL).searchParams.get("product_id");
      return pid ? pcolleProvider.normalizeMovieID(pid) : null;
    } catch {
      return null;
    }
  },

  async getMovieInfoByID(id: string): Promise<MovieInfo> {
    const normalized = pcolleProvider.normalizeMovieID(id);
    if (!normalized) throw new ProviderError(`invalid id: ${id}`, "invalid");
    return pcolleProvider.getMovieInfoByURL(MOVIE_URL.replace("%s", encodeURIComponent(normalized)));
  },

  async getMovieInfoByURL(rawURL: string): Promise<MovieInfo> {
    const id = pcolleProvider.parseMovieIDFromURL(rawURL);
    if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    const r = await fetchPage(rawURL, {
      providerName: "Pcolle",
      cookie: COOKIE,
      notFoundMessage: `movie not found: ${id}`,
    });
    const info = await parsePcollePage(r.text, rawURL, id);
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    return info;
  },
};
