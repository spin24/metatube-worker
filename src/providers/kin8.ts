// KIN8 (金髪天國) — slim port of provider/kin8tengoku from
// metatube-sdk-go. A HEYZO-family site: detail table + player script
// vars; the score is the average user_rating from a JSONP review API
// (data fetch only — no review content is used).

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
  fetchText,
  parseDateLoose,
} from "../lib/scrape";
import { parseRuntime } from "../lib/textutil";

const MOVIE_URL = "https://www.kin8tengoku.com/moviepages/%s/index.html";
const REVIEW_URL = "https://m-template.heyzo.com/snstb/api/review?%s";

export async function parseKin8Page(
  html: string,
  pageURL: string,
  id: string,
): Promise<MovieInfo> {
  const info = baseMovieInfo("KIN8", id, pageURL);
  info.number = `KIN8-${id}`;
  info.maker = "金髪天國";

  const fields = await collectFields(html, [
    { key: "title", selector: "#sub_main p.sub_title, #sub_main p.sub_title_vip", mode: "text" },
    { key: "keywords", selector: 'meta[name="keywords"]', mode: "attr", attr: "content" },
    { key: "summary", selector: "#comment", mode: "text" },
    { key: "gallery", selector: "#gallery div a, #gallery_vip div a", mode: "attrs", attr: "href" },
    { key: "reviewSite", selector: "#review_list", mode: "attr", attr: "data-d2p_site_id" },
    { key: "reviewSeq", selector: "#review_list", mode: "attr", attr: "data-movie_seq" },
  ]);
  info.title = (fields.title as string).trim();
  if (!info.title) info.title = (fields.keywords as string).trim();
  info.summary = (fields.summary as string).trim();
  for (const href of fields.gallery as string[]) {
    if (href) info.preview_images.push(absURL(pageURL, href));
  }

  const rows = await collectPairs(html, "td.movie_table_td", "td.movie_table_td2");
  for (const row of rows) {
    switch (row.label) {
      case "モデル":
        info.actors = row.valueTexts;
        break;
      case "カテゴリー":
        info.genres = row.valueTexts;
        break;
      case "再生時間":
        info.runtime = parseRuntime(row.value);
        break;
      case "更新日":
        info.release_date = parseDateLoose(row.value);
        break;
    }
  }

  // Player script vars.
  const img = /imgurl\s*=\s*'(.+?)';/.exec(html);
  if (img) {
    info.cover_url = absURL(pageURL, img[1]);
    info.thumb_url = info.cover_url;
  }
  const limit = /samplelimit\s*=\s*(\d+);/.exec(html);
  if (limit) {
    const sampleLimit = parseInt(limit[1], 10);
    const videoID = parseInt(info.id, 10);
    if (sampleLimit > 0 && videoID > 0) {
      const videos = [...html.matchAll(/videourl\s*=\s*'(.+?)'/g)].map((m) => m[1]);
      if (videos.length === 1) {
        info.preview_video_url = absURL(pageURL, videos[0]);
      } else if (videos.length >= 2) {
        info.preview_video_url = absURL(
          pageURL,
          videoID >= sampleLimit ? videos[0] : videos[1],
        );
      }
    }
  }

  // Score: average user_rating from the JSONP review API (best-effort).
  const siteId = fields.reviewSite as string;
  const movieSeq = fields.reviewSeq as string;
  if (siteId && movieSeq) {
    try {
      const ts = String(Date.now());
      const q = new URLSearchParams({
        callback: `jQuery_${ts}`,
        site_id: siteId,
        movie_seq: movieSeq,
        json: "1",
        _: ts,
      });
      const r = await fetchText(REVIEW_URL.replace("%s", q.toString()), {
        providerName: "KIN8",
      });
      if (r.status >= 200 && r.status < 300) {
        const m = /\w+\((.+?)\);/s.exec(r.text);
        if (m) {
          const data = JSON.parse(m[1]) as { user_rating: number }[];
          if (Array.isArray(data) && data.length > 0) {
            info.score =
              data.reduce((sum, x) => sum + (x.user_rating || 0), 0) / data.length;
          }
        }
      }
    } catch {
      // ignore
    }
  }
  return info;
}

export const kin8Provider: MovieProvider = {
  name: "KIN8",
  priority: 1000,

  normalizeMovieID(id: string): string {
    const m = /^(?:kin8[-_])?(\d+)$/i.exec(id.trim());
    return m ? m[1] : "";
  },

  parseMovieIDFromURL(rawURL: string): string | null {
    try {
      const parts = new URL(rawURL).pathname.split("/").filter(Boolean);
      const id = parts.length >= 2 ? parts[parts.length - 2] : "";
      return id ? decodeURIComponent(id) : null;
    } catch {
      return null;
    }
  },

  async getMovieInfoByID(id: string): Promise<MovieInfo> {
    const normalized = kin8Provider.normalizeMovieID(id);
    if (!normalized) throw new ProviderError(`invalid id: ${id}`, "invalid");
    return kin8Provider.getMovieInfoByURL(
      MOVIE_URL.replace("%s", normalized.padStart(4, "0")),
    );
  },

  async getMovieInfoByURL(rawURL: string): Promise<MovieInfo> {
    const id = kin8Provider.parseMovieIDFromURL(rawURL);
    if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    const r = await fetchPage(rawURL, {
      providerName: "KIN8",
      notFoundMessage: `movie not found: ${id}`,
    });
    const info = await parseKin8Page(r.text, rawURL, id);
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    return info;
  },
};
