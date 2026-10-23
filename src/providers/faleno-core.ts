// FALENO/DAHLIA core — port of provider/dahlia/core from
// metatube-sdk-go, shared by FALENO and DAHLIA (same site engine,
// WordPress-like search at /?s=). Pages need the modal=off cookie.
// Search does not follow redirects: the result list is parsed from
// whatever body comes back (the Go collector parses error/redirect
// responses too).

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
  fetchText,
  parseDateLoose,
} from "../lib/scrape";
import { parseIDToNumber, parseRuntime } from "../lib/textutil";

export interface FalenoConfig {
  name: string;
  baseURL: string;
  movieURL: string;
  searchURL: string;
}

const COOKIE = "modal=off";

export async function parseFalenoPage(
  html: string,
  pageURL: string,
  cfg: FalenoConfig,
  id: string,
): Promise<MovieInfo> {
  const info = baseMovieInfo(cfg.name, id, pageURL);
  info.number = parseIDToNumber(id);
  info.maker = cfg.name;
  info.label = cfg.name;

  const fields = await collectFields(html, [
    { key: "titleWorks", selector: "div.bar02_works > h1", mode: "text" },
    { key: "titlePlain", selector: "div.bar02 > h1", mode: "text" },
    { key: "cover", selector: "div.box_works01_img > a > img", mode: "attr", attr: "src" },
    { key: "video", selector: "div.box_works01_img > a", mode: "attr", attr: "href" },
    { key: "previews", selector: "div.box_works01_ga li a", mode: "attrs", attr: "href" },
    { key: "summary", selector: "div.box_works01_text", mode: "text" },
  ]);
  info.title =
    (fields.titleWorks as string).trim() || (fields.titlePlain as string).trim();
  const cover = fields.cover as string;
  if (cover) info.cover_url = absURL(pageURL, cover).split("?")[0];
  const video = fields.video as string;
  if (video) info.preview_video_url = absURL(pageURL, video);
  for (const href of fields.previews as string[]) {
    info.preview_images.push(absURL(pageURL, href));
  }
  const summary = (fields.summary as string).trim();
  if (summary) info.summary = summary.replaceAll("\n", "<br />");

  const rows = await collectPairs(
    html,
    "div.box_works01_list li > span",
    "div.box_works01_list li > p",
  );
  for (const row of rows) {
    switch (row.label) {
      case "出演女優":
        info.actors = row.value
          .split("/")
          .map((a) => a.trim())
          .filter(Boolean);
        break;
      case "収録時間":
        info.runtime = parseRuntime(row.value);
        break;
      case "配信開始日":
        info.release_date = parseDateLoose(row.value);
        break;
      case "発売日":
        if (!info.release_date) info.release_date = parseDateLoose(row.value);
        break;
    }
  }
  return info;
}

interface SearchCard {
  homepage: string;
  cover: string;
  title: string;
  dateText: string;
}

async function parseFalenoSearchPage(
  html: string,
  pageURL: string,
): Promise<SearchCard[]> {
  const cards: SearchCard[] = [];
  let cur: (SearchCard & { titleBuf: string; liText: string }) | null = null;
  const flush = () => {
    if (cur) {
      cur.title = cur.titleBuf.trim().split("\n")[0].trim();
      const m = /発売開始\s*(\S+)/.exec(cur.liText);
      cur.dateText = m ? m[1] : "";
      cards.push(cur);
      cur = null;
    }
  };
  const rw = new HTMLRewriter()
    .on("div.box_kanren01 li", {
      element() {
        flush();
        cur = { homepage: "", cover: "", title: "", dateText: "", titleBuf: "", liText: "" };
      },
      text(t) {
        if (cur) cur.liText += t.text;
      },
    })
    .on("div.box_kanren01 li a", {
      element(el) {
        if (cur && !cur.homepage) cur.homepage = el.getAttribute("href") ?? "";
      },
    })
    .on("div.box_kanren01 li img", {
      element(el) {
        if (cur && !cur.cover) cur.cover = el.getAttribute("src") ?? "";
      },
    })
    .on("div.box_kanren01 li div.text_name a", {
      text(t) {
        if (cur) cur.titleBuf += t.text;
      },
    });
  await rw.transform(new Response(html)).text();
  flush();
  return cards;
}

export function makeFalenoProvider(cfg: FalenoConfig): MovieProvider & {
  normalizeMovieKeyword(keyword: string): string;
  searchMovie(keyword: string): Promise<MovieSearchResult[]>;
} {
  const provider = {
    name: cfg.name,
    priority: 995,

    normalizeMovieID(id: string): string {
      return id.trim().toLowerCase();
    },

    parseMovieIDFromURL(rawURL: string): string | null {
      try {
        const parts = new URL(rawURL).pathname.split("/").filter(Boolean);
        const base = parts[parts.length - 1] ?? "";
        return base ? provider.normalizeMovieID(decodeURIComponent(base)) : null;
      } catch {
        return null;
      }
    },

    async getMovieInfoByID(id: string): Promise<MovieInfo> {
      const normalized = provider.normalizeMovieID(id);
      if (!normalized) throw new ProviderError("invalid id", "invalid");
      return provider.getMovieInfoByURL(cfg.movieURL.replace("%s", normalized));
    },

    async getMovieInfoByURL(rawURL: string): Promise<MovieInfo> {
      const id = provider.parseMovieIDFromURL(rawURL);
      if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
      const r = await fetchPage(rawURL, {
        providerName: cfg.name,
        cookie: COOKIE,
        notFoundMessage: `movie not found: ${id}`,
      });
      const info = await parseFalenoPage(r.text, rawURL, cfg, id);
      if (!isValidMovieInfo(info)) {
        throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
      }
      return info;
    },

    normalizeMovieKeyword(keyword: string): string {
      return keyword.toLowerCase().replaceAll("-", "");
    },

    async searchMovie(keyword: string): Promise<MovieSearchResult[]> {
      const url = cfg.searchURL.replace("%s", encodeURIComponent(keyword));
      const r = await fetchText(url, {
        providerName: cfg.name,
        cookie: COOKIE,
        redirect: "manual",
      });
      const cards = await parseFalenoSearchPage(r.text, url);
      const results: MovieSearchResult[] = [];
      for (const card of cards) {
        if (!card.homepage) continue;
        const homepage = absURL(url, card.homepage);
        const id = provider.parseMovieIDFromURL(homepage);
        if (!id) continue;
        const result: MovieSearchResult = {
          id,
          number: parseIDToNumber(id),
          title: card.title,
          provider: cfg.name,
          homepage,
          actors: [],
          thumb_url: "",
          cover_url: card.cover ? absURL(url, card.cover) : "",
          big_thumb_url: "",
          score: 0,
          release_date: parseDateLoose(card.dateText),
        };
        if (isValidSearchResult(result)) results.push(result);
      }
      return results;
    },
  };
  return provider;
}

export const falenoConfigs: FalenoConfig[] = [
  {
    name: "DAHLIA",
    baseURL: "https://dahlia-av.jp/",
    movieURL: "https://dahlia-av.jp/works/%s/",
    searchURL: "https://dahlia-av.jp/?s=%s",
  },
  {
    name: "FALENO",
    baseURL: "https://faleno.jp/top/",
    movieURL: "https://faleno.jp/top/works/%s/",
    searchURL: "https://faleno.jp/top/?s=%s",
  },
];

export const falenoProviders = falenoConfigs.map(makeFalenoProvider);
