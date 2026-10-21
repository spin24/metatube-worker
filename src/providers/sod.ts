// SOD Prime (ec.sod.co.jp) — port of provider/sod from
// metatube-sdk-go. The site gates pages behind an age check: when the
// gate markup is present, the Go version follows the "enter" link with
// the page as Referer and parses THAT response body instead — the
// same flow is reproduced here. A cover that is still the placeholder
// (`/thumbnail/now_*.jpg`) means the image is not available and the
// lookup fails, as in Go.

import {
  MovieInfo,
  MovieProvider,
  MovieSearchResult,
  MovieSearcher,
  ProviderError,
  isValidMovieInfo,
} from "../types";
import {
  absURL,
  baseMovieInfo,
  collectFields,
  collectPairsSeq,
  fetchPage,
  fetchText,
  parseDateLoose,
} from "../lib/scrape";
import { isSpecial, parseRuntime, parseScore } from "../lib/textutil";

const MOVIE_URL = "https://ec.sod.co.jp/prime/videos/?id=%s";
const SEARCH_URL =
  "https://ec.sod.co.jp/prime/videos/genre/?search_type=1&sodsearch=%s";
const NOW_IMAGE = /\/thumbnail\/now_\w+\.jpg/;

function isValidImageURL(s: string): boolean {
  return !NOW_IMAGE.test(s);
}

/** Fetch a SOD page, resolving the age gate when present. */
async function fetchSodPage(url: string): Promise<{ text: string; url: string }> {
  const r = await fetchPage(url, { providerName: "SOD" });
  if (!r.text.includes("pkg_age")) return { text: r.text, url };
  const m = /pkg_age[\s\S]{0,800}?<a[^>]+href="([^"]+)"/.exec(r.text);
  if (!m) return { text: r.text, url };
  try {
    const gate = await fetchText(absURL(url, m[1]), {
      referer: url,
      providerName: "SOD",
    });
    if (gate.status >= 200 && gate.status < 400 && gate.text) {
      return { text: gate.text, url };
    }
  } catch {
    // fall through with the gated body
  }
  return { text: r.text, url };
}

export async function parseSodPage(
  html: string,
  pageURL: string,
  id: string,
): Promise<MovieInfo> {
  const info = baseMovieInfo("SOD", id, pageURL);
  info.number = id;

  const fields = await collectFields(html, [
    { key: "title", selector: "p.product_title", mode: "text" },
    { key: "summary", selector: "div.videos_textli article", mode: "text" },
    { key: "cover", selector: "#videos_toptable div.videos_samimg a", mode: "attr", attr: "href" },
    { key: "thumb", selector: "#videos_toptable div.videos_samimg a img", mode: "attr", attr: "src" },
    { key: "previews", selector: "#videos_samsbox > a", mode: "attrs", attr: "href" },
    { key: "scoreText", selector: "#review_body div.imagestar i", mode: "text" },
  ]);
  info.title = (fields.title as string).trim();
  info.summary = (fields.summary as string).trim();
  if (fields.cover) info.cover_url = absURL(pageURL, fields.cover as string);
  if (fields.thumb) info.thumb_url = absURL(pageURL, fields.thumb as string);
  info.preview_images = (fields.previews as string[]).map((u) => absURL(pageURL, u));
  if (fields.scoreText) info.score = parseScore(fields.scoreText as string);

  const rows = await collectPairsSeq(html, "#v_introduction td");
  for (const row of rows) {
    switch (row.label) {
      case "品番":
        info.number = row.value;
        break;
      case "発売年月日":
        info.release_date = parseDateLoose(row.value);
        break;
      case "シリーズ名":
        info.series = row.value;
        break;
      case "出演者":
        info.actors = row.valueTexts;
        break;
      case "再生時間":
        info.runtime = parseRuntime(row.value);
        break;
      case "監督":
        info.director = row.value;
        break;
      case "メーカー":
        info.maker = row.value;
        break;
      case "レーベル":
        info.label = row.value;
        break;
      case "ジャンル":
        info.genres = row.valueTexts;
        break;
    }
  }

  // Preview video lives on a linked subpage (#moviebox source).
  const samp = /videos_sampb[\s\S]{0,400}?<a[^>]+href="([^"]+)"/.exec(html);
  if (samp) {
    try {
      const sub = await fetchText(absURL(pageURL, samp[1]), {
        referer: pageURL,
        providerName: "SOD",
      });
      const src = /id="moviebox"[\s\S]{0,600}?<source[^>]+src="([^"]+)"/.exec(sub.text);
      if (src) info.preview_video_url = absURL(pageURL, src[1]);
    } catch {
      // best-effort
    }
  }
  return info;
}

export async function parseSodSearch(html: string, pageURL: string): Promise<MovieSearchResult[]> {
  interface Card {
    homepage: string;
    thumb: string;
    title: string;
    release: string;
  }
  const cards: Card[] = [];
  let cur: Card | null = null;
  const rw = new HTMLRewriter()
    .on("#videos_s_mainbox", {
      element() {
        cur = { homepage: "", thumb: "", title: "", release: "" };
        cards.push(cur);
      },
    })
    .on("#videos_s_mainbox div.videis_s_img a", {
      element(el) {
        if (cur && !cur.homepage) cur.homepage = el.getAttribute("href") ?? "";
      },
    })
    .on("#videos_s_mainbox div.videis_s_img a img", {
      element(el) {
        if (cur && !cur.thumb) cur.thumb = el.getAttribute("src") ?? "";
      },
    })
    .on("#videos_s_mainbox div.videis_s_txt h2 a", {
      text(t) {
        if (cur) cur.title += t.text;
      },
    })
    .on("#videos_s_mainbox div.videis_s_star p", {
      text(t) {
        if (cur) cur.release += t.text;
      },
    });
  await rw.transform(new Response(html)).text();

  const results: MovieSearchResult[] = [];
  for (const c of cards) {
    const thumb = c.thumb ? absURL(pageURL, c.thumb) : "";
    if (!thumb || !isValidImageURL(thumb) || !c.homepage) continue;
    const homepage = absURL(pageURL, c.homepage);
    const id = sodProvider.parseMovieIDFromURL(homepage);
    if (!id) continue;
    results.push({
      id,
      number: id,
      title: c.title.trim(),
      provider: "SOD",
      homepage,
      actors: [],
      thumb_url: thumb,
      cover_url: thumb.replaceAll("_m.jpg", "_l.jpg"),
      score: 0,
      release_date: parseDateLoose(c.release),
    });
  }
  return results;
}

export const sodProvider: MovieProvider & MovieSearcher = {
  name: "SOD",
  priority: 999,

  normalizeMovieID(id: string): string {
    return id.trim().toUpperCase();
  },

  parseMovieIDFromURL(rawURL: string): string | null {
    try {
      const v = new URL(rawURL).searchParams.get("id");
      return v ? sodProvider.normalizeMovieID(v) : null;
    } catch {
      return null;
    }
  },

  async getMovieInfoByID(id: string): Promise<MovieInfo> {
    const normalized = sodProvider.normalizeMovieID(id);
    if (!normalized) throw new ProviderError(`invalid id: ${id}`, "invalid");
    return sodProvider.getMovieInfoByURL(
      MOVIE_URL.replace("%s", encodeURIComponent(normalized)),
    );
  },

  async getMovieInfoByURL(rawURL: string): Promise<MovieInfo> {
    const id = sodProvider.parseMovieIDFromURL(rawURL);
    if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    const pageURL = MOVIE_URL.replace("%s", encodeURIComponent(id));
    const page = await fetchSodPage(pageURL);
    const info = await parseSodPage(page.text, pageURL, id);
    info.homepage = rawURL;
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    if (!isValidImageURL(info.cover_url)) {
      throw new ProviderError("image not available", "upstream");
    }
    return info;
  },

  normalizeMovieKeyword(keyword: string): string {
    if (isSpecial(keyword)) return "";
    return keyword.trim().toUpperCase();
  },

  async searchMovie(keyword: string): Promise<MovieSearchResult[]> {
    const url = SEARCH_URL.replace("%s", encodeURIComponent(keyword));
    const page = await fetchSodPage(url);
    return parseSodSearch(page.text, url);
  },
};
