// MGS (mgstage) — port of provider/mgstage from metatube-sdk-go.
// (Reviews exist in the Go version but are out of scope for this port.)
// Notes: the Go version also derives a BigThumbURL via imageSrc();
// this port's MovieInfo has no big-thumb field, so only the thumb
// transform is kept (for search results, where Go builds both URLs
// from the card image).

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
  collectPairs,
  fetchPage,
  fetchText,
  parseDateLoose,
} from "../lib/scrape";
import { isSpecial, parseRuntime, parseScore } from "../lib/textutil";

const MOVIE_URL = "https://www.mgstage.com/product/product_detail/%s/";
const SEARCH_URL = "https://www.mgstage.com/search/cSearch.php?search_word=%s";
const SAMPLE_URL = "https://www.mgstage.com/sampleplayer/sampleRespons.php?pid=%s";
const COOKIE = "adc=1";

/** Port of the Go imageSrc(): pf_/pb_ segment -> pf_e_ (thumb) / pb_e_ (cover). */
export function mgsImageSrc(s: string, thumb: boolean): string {
  const re = /\/p[f|b]_[a-z]\d*?_/i;
  if (re.test(s)) return s.replace(re, thumb ? "/pf_e_" : "/pb_e_");
  return s;
}

export async function parseMgsPage(
  html: string,
  pageURL: string,
  id: string,
): Promise<MovieInfo> {
  const info = baseMovieInfo("MGS", id, pageURL);

  const fields = await collectFields(html, [
    { key: "title", selector: "#center_column h1", mode: "text" },
    { key: "summary", selector: 'meta[property="og:description"]', mode: "attr", attr: "content" },
    { key: "thumb", selector: "div.detail_data > div h2 img", mode: "attr", attr: "src" },
    { key: "cover", selector: "#EnlargeImage", mode: "attr", attr: "href" },
    { key: "previews", selector: "#sample-photo dd ul li a", mode: "attrs", attr: "href" },
  ]);
  info.title = (fields.title as string).trim();
  info.summary = (fields.summary as string).trim();
  info.thumb_url = fields.thumb ? absURL(pageURL, fields.thumb as string) : "";
  info.cover_url = fields.cover ? absURL(pageURL, fields.cover as string) : "";
  info.preview_images = (fields.previews as string[]).map((u) => absURL(pageURL, u));

  const rows = await collectPairs(html, "tr th", "tr td");
  for (const row of rows) {
    switch (row.label) {
      case "出演：":
        info.actors = row.valueTexts;
        break;
      case "メーカー：":
        info.maker = row.value;
        break;
      case "収録時間：":
        info.runtime = parseRuntime(row.value);
        break;
      case "品番：":
        info.number = row.value;
        break;
      case "配信開始日：":
      case "商品発売日：":
        if (!info.release_date) info.release_date = parseDateLoose(row.value);
        break;
      case "シリーズ：":
        info.series = row.value;
        break;
      case "レーベル：":
        info.label = row.value;
        break;
      case "ジャンル：":
        info.genres = row.valueTexts;
        break;
      case "評価：":
        info.score = parseScore(row.value);
        break;
    }
  }
  if (!info.number) info.number = id;

  // Preview video: the sample button's pid feeds a JSON endpoint whose
  // "url" points at an ISM stream; the Go version rewrites the suffix
  // to .mp4. Best-effort subrequest.
  const btn = /sample_movie_btn[\s\S]{0,400}?href="([^"]+)"/.exec(html);
  if (btn) {
    try {
      const pid = btn[1].split("/").filter(Boolean).pop() ?? "";
      if (pid) {
        const r = await fetchText(SAMPLE_URL.replace("%s", pid), {
          cookie: COOKIE,
          providerName: "MGS",
        });
        if (r.status >= 200 && r.status < 300) {
          const data = JSON.parse(r.text) as { url?: string };
          if (data.url) {
            info.preview_video_url = data.url.replace(/\.ism\/request?.+$/, ".mp4");
          }
        }
      }
    } catch {
      // ignore: preview video is best-effort
    }
  }
  return info;
}

export async function parseMgsSearch(html: string, pageURL: string): Promise<MovieSearchResult[]> {
  interface Card {
    homepage: string;
    img: string;
    title: string;
    fallbackTitle: string;
    review: string;
  }
  const cards: Card[] = [];
  let cur: Card | null = null;
  let titleAnchor = false;
  const rw = new HTMLRewriter()
    .on("#center_column ul.product_list > li", {
      element() {
        cur = { homepage: "", img: "", title: "", fallbackTitle: "", review: "" };
        cards.push(cur);
        titleAnchor = false;
      },
    })
    .on("#center_column ul.product_list > li h5 a", {
      element(el) {
        if (cur && !cur.homepage) cur.homepage = el.getAttribute("href") ?? "";
      },
    })
    .on("#center_column ul.product_list > li h5 a img", {
      element(el) {
        if (cur && !cur.img) cur.img = el.getAttribute("src") ?? "";
      },
    })
    .on("#center_column ul.product_list > li a", {
      element(el) {
        titleAnchor = (el.getAttribute("class") ?? "").includes("title");
      },
      text(t) {
        if (cur && titleAnchor) cur.title += t.text;
      },
    })
    .on("#center_column ul.product_list > li a p", {
      text(t) {
        if (cur) cur.fallbackTitle += t.text;
      },
    })
    .on("#center_column ul.product_list > li p.review", {
      text(t) {
        if (cur) cur.review += t.text;
      },
    });
  await rw.transform(new Response(html)).text();

  const results: MovieSearchResult[] = [];
  for (const c of cards) {
    if (!c.homepage) continue;
    const homepage = absURL(pageURL, c.homepage);
    const id = mgsProvider.parseMovieIDFromURL(homepage);
    if (!id) continue;
    const img = c.img ? absURL(pageURL, c.img) : "";
    results.push({
      id,
      number: id,
      title: (c.title.trim() || c.fallbackTitle.trim()),
      provider: "MGS",
      homepage,
      thumb_url: img ? mgsImageSrc(img, true) : "",
      cover_url: img ? mgsImageSrc(img, false) : "",
      score: parseScore(c.review),
      actors: [],
      release_date: "",
    });
  }
  return results;
}

export const mgsProvider: MovieProvider & MovieSearcher = {
  name: "MGS",
  priority: 1000,

  normalizeMovieID(id: string): string {
    return id.trim().toUpperCase();
  },

  parseMovieIDFromURL(rawURL: string): string | null {
    try {
      const parts = new URL(rawURL).pathname.split("/").filter(Boolean);
      const base = parts[parts.length - 1] ?? "";
      return base ? mgsProvider.normalizeMovieID(decodeURIComponent(base)) : null;
    } catch {
      return null;
    }
  },

  async getMovieInfoByID(id: string): Promise<MovieInfo> {
    const normalized = mgsProvider.normalizeMovieID(id);
    if (!normalized) throw new ProviderError(`invalid id: ${id}`, "invalid");
    return mgsProvider.getMovieInfoByURL(MOVIE_URL.replace("%s", normalized));
  },

  async getMovieInfoByURL(rawURL: string): Promise<MovieInfo> {
    const id = mgsProvider.parseMovieIDFromURL(rawURL);
    if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    const r = await fetchPage(rawURL, {
      cookie: COOKIE,
      providerName: "MGS",
      notFoundMessage: `movie not found: ${id}`,
    });
    const info = await parseMgsPage(r.text, rawURL, id);
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    return info;
  },

  normalizeMovieKeyword(keyword: string): string {
    if (isSpecial(keyword)) return "";
    return keyword.trim().toUpperCase();
  },

  async searchMovie(keyword: string): Promise<MovieSearchResult[]> {
    const url = SEARCH_URL.replace("%s", encodeURIComponent(keyword));
    const r = await fetchPage(url, { cookie: COOKIE, providerName: "MGS" });
    return parseMgsSearch(r.text, url);
  },
};
