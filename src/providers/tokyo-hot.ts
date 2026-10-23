// TOKYO-HOT — slim port of provider/tokyo-hot from metatube-sdk-go.
// Product pages at my.tokyo-hot.com/product/{id}/?lang=ja with a
// dt/dd info list; search at /product/?q= returns card lists whose
// catalog number hides in the card text （作品番号: ...).

import {
  MovieInfo,
  MovieProvider,
  MovieSearchResult,
  ProviderError,
  isValidMovieInfo,
  isValidSearchResult,
} from "../types";
import {
  absURL,
  baseMovieInfo,
  collectFields,
  collectPairs,
  fetchPage,
  parseDateLoose,
} from "../lib/scrape";
import { parseRuntime } from "../lib/textutil";

const MOVIE_URL = "https://my.tokyo-hot.com/product/%s/?lang=ja";
const SEARCH_URL = "https://my.tokyo-hot.com/product/?q=%s&x=0&y=0&lang=ja";

export async function parseTokyoHotPage(
  html: string,
  pageURL: string,
  id: string,
): Promise<MovieInfo> {
  const info = baseMovieInfo("TOKYO-HOT", id, pageURL);
  info.maker = "TOKYO-HOT";

  const fields = await collectFields(html, [
    { key: "title", selector: "#main .contents > h2", mode: "text" },
    { key: "sentences", selector: "#main div.sentence", mode: "texts" },
    { key: "packageHrefs", selector: "li.package a", mode: "attrs", attr: "href" },
    { key: "poster", selector: "div.flowplayer video", mode: "attr", attr: "poster" },
    { key: "videoSrc", selector: "div.flowplayer source", mode: "attr", attr: "src" },
    { key: "caps", selector: 'a[rel="cap"]', mode: "attrs", attr: "href" },
  ]);
  info.title = (fields.title as string).trim();
  const sentences = fields.sentences as string[];
  if (sentences.length > 0) info.summary = sentences.join("\n").trim();

  // Package links: first "jacket" href is the cover; the thumb rule
  // replicates the Go version's condition verbatim (incl. precedence).
  for (const href of fields.packageHrefs as string[]) {
    const a = absURL(pageURL, href);
    if (!info.cover_url && a.includes("jacket")) {
      info.cover_url = a;
    } else if ((!info.thumb_url && a.endsWith("vb.jpg")) || a.includes("package")) {
      info.thumb_url = a;
    }
  }
  if (!info.cover_url && fields.poster) {
    info.cover_url = absURL(pageURL, fields.poster as string);
  }
  if (fields.videoSrc) {
    info.preview_video_url = absURL(pageURL, fields.videoSrc as string);
  }
  for (const href of fields.caps as string[]) {
    if (href) info.preview_images.push(absURL(pageURL, href));
  }

  const rows = await collectPairs(html, "#main .infowrapper dt", "#main .infowrapper dd");
  for (const row of rows) {
    switch (row.label) {
      case "出演者":
        for (const actor of row.valueTexts) {
          if (actor !== "不明") info.actors.push(actor);
        }
        break;
      case "プレイ内容":
      case "タグ":
        info.genres.push(...row.valueTexts);
        break;
      case "シリーズ":
        info.series = row.valueFirstLink;
        break;
      case "レーベル":
        info.label = row.valueFirstLink;
        break;
      case "配信開始日":
        info.release_date = parseDateLoose(row.value);
        break;
      case "収録時間":
        info.runtime = parseRuntime(row.value);
        break;
      case "作品番号":
        info.number = row.value;
        break;
    }
  }
  info.genres = [...new Set(info.genres)];
  if (!info.thumb_url && info.cover_url) info.thumb_url = info.cover_url;
  else if (!info.cover_url && info.thumb_url) info.cover_url = info.thumb_url;
  return info;
}

interface SearchCard {
  homepage: string;
  img: string;
  imgAlt: string;
  imgTitle: string;
  title: string;
  text: string;
}

async function parseTokyoHotSearchPage(html: string): Promise<SearchCard[]> {
  const cards: SearchCard[] = [];
  let cur: (SearchCard & { titleBuf: string }) | null = null;
  const flush = () => {
    if (cur) {
      cur.title = cur.titleBuf.trim();
      cards.push(cur);
      cur = null;
    }
  };
  const rw = new HTMLRewriter()
    .on("#main ul li", {
      element() {
        flush();
        cur = { homepage: "", img: "", imgAlt: "", imgTitle: "", title: "", text: "", titleBuf: "" };
      },
      text(t) {
        if (cur) cur.text += t.text;
      },
    })
    .on("#main ul li a", {
      element(el) {
        if (cur && !cur.homepage) cur.homepage = el.getAttribute("href") ?? "";
      },
    })
    .on("#main ul li a img", {
      element(el) {
        if (cur && !cur.img) {
          cur.img = el.getAttribute("src") ?? "";
          cur.imgAlt = el.getAttribute("alt") ?? "";
          cur.imgTitle = el.getAttribute("title") ?? "";
        }
      },
    })
    .on("#main ul li div.title", {
      text(t) {
        if (cur) cur.titleBuf += t.text;
      },
    });
  await rw.transform(new Response(html)).text();
  flush();
  return cards;
}

export const tokyohotProvider: MovieProvider & {
  normalizeMovieKeyword(keyword: string): string;
  searchMovie(keyword: string): Promise<MovieSearchResult[]>;
} = {
  name: "TOKYO-HOT",
  priority: 998,

  normalizeMovieID(id: string): string {
    return id.trim().toLowerCase();
  },

  parseMovieIDFromURL(rawURL: string): string | null {
    try {
      const parts = new URL(rawURL).pathname.split("/").filter(Boolean);
      const base = parts[parts.length - 1] ?? "";
      return base ? tokyohotProvider.normalizeMovieID(decodeURIComponent(base)) : null;
    } catch {
      return null;
    }
  },

  async getMovieInfoByID(id: string): Promise<MovieInfo> {
    const normalized = tokyohotProvider.normalizeMovieID(id);
    if (!normalized) throw new ProviderError("invalid id", "invalid");
    return tokyohotProvider.getMovieInfoByURL(MOVIE_URL.replace("%s", normalized));
  },

  async getMovieInfoByURL(rawURL: string): Promise<MovieInfo> {
    const id = tokyohotProvider.parseMovieIDFromURL(rawURL);
    if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    const r = await fetchPage(rawURL, {
      providerName: "TOKYO-HOT",
      notFoundMessage: `movie not found: ${id}`,
    });
    const info = await parseTokyoHotPage(r.text, rawURL, id);
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    return info;
  },

  normalizeMovieKeyword(keyword: string): string {
    return /^[a-z_]*\d+$/i.test(keyword) ? keyword.toLowerCase() : "";
  },

  async searchMovie(keyword: string): Promise<MovieSearchResult[]> {
    const url = SEARCH_URL.replace("%s", encodeURIComponent(keyword));
    const r = await fetchPage(url, { providerName: "TOKYO-HOT" });
    const cards = await parseTokyoHotSearchPage(r.text);
    const results: MovieSearchResult[] = [];
    for (const card of cards) {
      if (!card.homepage) continue;
      const homepage = absURL(url, card.homepage);
      const id = tokyohotProvider.parseMovieIDFromURL(homepage);
      if (!id) continue;
      let number = "";
      const m = /\(作品番号: ([a-z\d\-_]+)\)/.exec(card.text);
      if (m) number = m[1];
      if (!number) number = card.imgAlt;
      if (!number) number = card.imgTitle;
      if (!number) number = id;
      const img = card.img ? absURL(url, card.img) : "";
      const result: MovieSearchResult = {
        id,
        number,
        title: card.title,
        provider: "TOKYO-HOT",
        homepage,
        actors: [],
        thumb_url: img,
        cover_url: img,
        big_thumb_url: "",
        score: 0,
        release_date: "",
      };
      if (isValidSearchResult(result)) results.push(result);
    }
    return results;
  },
};
