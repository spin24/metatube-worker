// MadouQu （麻豆傳媒） — slim port of provider/madouqu from
// metatube-sdk-go. WordPress posts at madouqu.com/{id}/ whose article
// paragraphs carry 番號：/片名：/女郎： fields. The Go version registers
// with Priority = 0 (disabled by default); this port mirrors that.

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
  fetchPage,
} from "../lib/scrape";
import { isSpecial, parseIDToNumber } from "../lib/textutil";

const MOVIE_URL = "https://madouqu.com/%s/";
const SEARCH_URL = "https://madouqu.com/?s=%s";

/** Port of madouqu.ExtractImgSrc: unwrap an embedded URL from a proxy path. */
export function extractImgSrc(src: string): string {
  try {
    const u = new URL(src);
    const m = /(https?:\/\/.+$)/.exec(u.pathname);
    if (m) return m[1];
  } catch {
    // not an absolute URL
  }
  return src;
}

export async function parseMadouquPage(
  html: string,
  pageURL: string,
  id: string,
): Promise<MovieInfo> {
  const info = baseMovieInfo("MadouQu", id, pageURL);

  // Per-paragraph pass over the article body.
  let cur: { text: string; img: string } | null = null;
  const flush = () => {
    if (!cur) return;
    if (cur.img) {
      info.cover_url = extractImgSrc(cur.img);
      cur = null;
      return;
    }
    const text = cur.text;
    if (text.includes("番號")) {
      info.number = (text.split("：")[1] ?? "").trim();
    } else if (text.includes("片名")) {
      info.title = (text.split("：")[1] ?? "").trim();
    } else if (text.includes("女郎")) {
      const actors = (text.split("：")[1] ?? "")
        .split("、")
        .map((a) => a.trim())
        .filter(Boolean);
      info.actors.push(...actors);
    }
    cur = null;
  };
  const rw = new HTMLRewriter()
    .on('article[id^="post"] div.container p', {
      element() {
        flush();
        cur = { text: "", img: "" };
      },
      text(t) {
        if (cur) cur.text += t.text;
      },
    })
    .on('article[id^="post"] div.container p img', {
      element(el) {
        if (cur && !cur.img) cur.img = el.getAttribute("src") ?? "";
      },
    });
  await rw.transform(new Response(html)).text();
  flush();

  const fields = await collectFields(html, [
    { key: "tags", selector: 'article[id^="post"] div.entry-tags a', mode: "texts" },
    { key: "maker", selector: 'article[id^="post"] span.meta-category a', mode: "text" },
  ]);
  if (info.actors.length === 0) {
    info.actors = fields.tags as string[];
  }
  if (!info.maker) info.maker = (fields.maker as string).trim();
  if (!info.number) info.number = parseIDToNumber(id);
  if (!info.thumb_url) info.thumb_url = info.cover_url;
  return info;
}

interface SearchCard {
  homepage: string;
  linkTitle: string;
  thumb: string;
}

async function parseMadouquSearchPage(html: string): Promise<SearchCard[]> {
  const cards: SearchCard[] = [];
  let cur: SearchCard | null = null;
  const flush = () => {
    if (cur) {
      cards.push(cur);
      cur = null;
    }
  };
  const rw = new HTMLRewriter()
    .on('article[id^="post"]', {
      element() {
        flush();
        cur = { homepage: "", linkTitle: "", thumb: "" };
      },
    })
    .on('article[id^="post"] h2 a', {
      element(el) {
        if (cur && !cur.homepage) {
          cur.homepage = el.getAttribute("href") ?? "";
          cur.linkTitle = el.getAttribute("title") ?? "";
        }
      },
    })
    .on('article[id^="post"] div.entry-media a img', {
      element(el) {
        if (cur && !cur.thumb) cur.thumb = el.getAttribute("data-src") ?? "";
      },
    });
  await rw.transform(new Response(html)).text();
  flush();
  return cards;
}

export const madouquProvider: MovieProvider & {
  normalizeMovieKeyword(keyword: string): string;
  searchMovie(keyword: string): Promise<MovieSearchResult[]>;
} = {
  name: "MadouQu",
  priority: 0, // disabled by default in the Go version too

  normalizeMovieID(id: string): string {
    return id.trim();
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
    const normalized = madouquProvider.normalizeMovieID(id);
    if (!normalized) throw new ProviderError("invalid id", "invalid");
    return madouquProvider.getMovieInfoByURL(MOVIE_URL.replace("%s", normalized));
  },

  async getMovieInfoByURL(rawURL: string): Promise<MovieInfo> {
    const id = madouquProvider.parseMovieIDFromURL(rawURL);
    if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    const r = await fetchPage(rawURL, {
      providerName: "MadouQu",
      notFoundMessage: `movie not found: ${id}`,
    });
    const info = await parseMadouquPage(r.text, rawURL, id);
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    return info;
  },

  normalizeMovieKeyword(keyword: string): string {
    if (isSpecial(keyword)) return "";
    return keyword.toUpperCase();
  },

  async searchMovie(keyword: string): Promise<MovieSearchResult[]> {
    const url = SEARCH_URL.replace("%s", encodeURIComponent(keyword));
    const r = await fetchPage(url, { providerName: "MadouQu" });
    const cards = await parseMadouquSearchPage(r.text);
    const results: MovieSearchResult[] = [];
    for (const card of cards) {
      if (!card.homepage) continue;
      const homepage = absURL(url, card.homepage);
      const id = madouquProvider.parseMovieIDFromURL(homepage);
      if (!id) continue;
      const origTitle = card.linkTitle;
      const sp = origTitle.indexOf(" ");
      let nb = sp > 0 ? origTitle.slice(0, sp) : "";
      let title = sp > 0 ? origTitle.slice(sp + 1) : origTitle;
      if (!/^[A-Z0-9\-_]+$/i.test(nb)) {
        nb = parseIDToNumber(id);
        title = origTitle;
      }
      const thumb = card.thumb ? extractImgSrc(card.thumb) : "";
      const result: MovieSearchResult = {
        id,
        number: nb,
        title,
        provider: "MadouQu",
        homepage,
        actors: [],
        thumb_url: thumb,
        cover_url: thumb,
        big_thumb_url: "",
        score: 0,
        release_date: "",
      };
      if (isValidSearchResult(result)) results.push(result);
    }
    return results;
  },
};
