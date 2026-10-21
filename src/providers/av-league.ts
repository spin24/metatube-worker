// AV-LEAGUE actor provider — slim port of provider/av-league from
// metatube-sdk-go. av-league.com is an actress database: profile pages
// at /actress/{numeric-id}.html. Profile parsing uses HTMLRewriter
// (streaming) like the JavBus provider; search traverses the static
// actress list pages instead (see searchAvleagueByName).
//
// Porting notes:
// - The raw HTML has no <tbody> (colly/goquery inserts one implicitly,
//   HTMLRewriter does not), so table selectors omit it.
// - List/profile images may use the lazy-load attribute data-layzr or
//   plain src — we take data-layzr first, then src, so images survive
//   either markup.

import {
  ActorInfo,
  ActorProvider,
  ActorSearchResult,
  ProviderError,
  isValidActorSearchResult,
} from "../types";

const BASE_URL = "https://www.av-league.com/";
const ACTOR_URL = "https://www.av-league.com/actress/";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** Parse a Japanese date ("1993年8月16日（33歳）") to YYYY-MM-DD. */
export function parseAvlDate(s: string): string {
  const full = /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/.exec(s);
  if (full) {
    return `${full[1]}-${full[2].padStart(2, "0")}-${full[3].padStart(2, "0")}`;
  }
  const iso = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }
  // Go's fallback: a bare year ("2015年") becomes Feb 2 of that year.
  const year = /(\d{4})年/.exec(s);
  if (year) {
    return `${year[1]}-02-02`;
  }
  return "";
}

/** "B:84（F） / W:58 / H:88" -> measurements + cup, like Go's parseMeasurements. */
export function parseMeasurements(s: string): {
  measurements: string;
  cupSize: string;
} {
  let b = 0;
  let w = 0;
  let h = 0;
  let cup = "";
  for (const item of s.split("/")) {
    const idx = item.indexOf(":");
    if (idx < 0) continue;
    const name = item.slice(0, idx).trim();
    const data = item.slice(idx + 1);
    if (name === "B") {
      const m = /(\d+)（([A-Z])）/.exec(data);
      if (m) {
        b = parseInt(m[1], 10);
        cup = m[2];
      }
    } else if (name === "W") {
      w = parseInt(data, 10) || 0;
    } else if (name === "H") {
      h = parseInt(data, 10) || 0;
    }
  }
  return {
    measurements: b !== 0 && w !== 0 && h !== 0 ? `B:${b} / W:${w} / H:${h}` : "",
    cupSize: cup,
  };
}

function applyProfileRow(info: ActorInfo, label: string, data: string): void {
  if (data === "不明") return; // ignore unknown
  switch (label) {
    case "3サイズ": {
      const { measurements, cupSize } = parseMeasurements(data);
      if (measurements) info.measurements = measurements;
      info.cup_size = cupSize;
      break;
    }
    case "身長":
      info.height = parseInt(data.replace(/cm$/, ""), 10) || 0;
      break;
    case "血液型":
      info.blood_type = data.replace(/型$/, "").trim();
      break;
    case "生年月日":
      info.birthday = parseAvlDate(data);
      break;
    case "出身":
      info.nationality = data;
      break;
    case "デビュー":
      info.debut_date = parseAvlDate(data);
      break;
  }
}

function emptyActorInfo(id: string, homepage: string): ActorInfo {
  return {
    id,
    name: "",
    provider: "AV-LEAGUE",
    homepage,
    summary: "",
    hobby: "",
    skill: "",
    blood_type: "",
    cup_size: "",
    measurements: "",
    nationality: "",
    height: 0,
    aliases: [],
    images: [],
    birthday: "",
    debut_date: "",
  };
}

/** Parse one actress profile page. Exported for parser tests. */
export async function parseAvleagueActorPage(
  html: string,
  pageURL: string,
  id: string,
): Promise<ActorInfo> {
  const info = emptyActorInfo(id, pageURL);
  let ogImage = "";
  let nameText = "";
  let profText = "";
  let pendingLabel: string | null = null;
  let thText = "";
  let tdText = "";

  const rewriter = new HTMLRewriter()
    .on("#pan span", {
      text(t) {
        nameText += t.text;
      },
    })
    .on("#j-prof span", {
      text(t) {
        profText += t.text;
      },
    })
    .on("#contents .i-pic-box img", {
      element(el) {
        const src = el.getAttribute("src");
        if (src) info.images.push(new URL(src, pageURL).toString());
      },
    })
    .on('meta[property="og:image"]', {
      element(el) {
        ogImage = el.getAttribute("content") ?? "";
      },
    })
    .on("#contents table th", {
      text(t) {
        thText += t.text;
        if (t.lastInTextNode) {
          pendingLabel = thText.trim();
          thText = "";
        }
      },
    })
    .on("#contents table td", {
      text(t) {
        tdText += t.text;
        if (t.lastInTextNode) {
          if (pendingLabel !== null) {
            applyProfileRow(info, pendingLabel, tdText.trim());
            pendingLabel = null;
          }
          tdText = "";
        }
      },
    });

  await rewriter.transform(new Response(html)).text();

  info.name = nameText.trim();
  // Aliases: a #j-prof span like "別名: xxx、yyy" (Go cuts on ":").
  const cut = profText.indexOf(":");
  if (cut >= 0 && profText.slice(0, cut).includes("別名")) {
    for (const alias of profText.slice(cut + 1).split("、")) {
      const a = alias.trim();
      if (a) info.aliases.push(a);
    }
  }
  if (info.images.length === 0 && ogImage) {
    info.images.push(new URL(ogImage, pageURL).toString());
  }
  return info;
}

/** Parse one search-results page. Exported for parser tests. */
/** One actor entry parsed from a list page (name + ID + list avatar). */
export interface AvleagueIndexEntry {
  id: string;
  name: string;
  image: string;
}

const ACTOR_LIST_URL =
  "https://www.av-league.com/actress-list/all-3/all_all_default_";
const ACTOR_LIST_MAX_PAGE = 31;

/**
 * Parse one actress list page into index entries. Cards look like:
 * <a href="/actress/{id}.html"><div class="l-pic"><img alt="{name}"
 * src="..."> — the avatar may use data-layzr instead of src; take
 * data-layzr first, then src, like the info parser does.
 */
export function parseAvleagueListPage(html: string): AvleagueIndexEntry[] {
  const entries: AvleagueIndexEntry[] = [];
  const seen = new Set<string>();
  const cardRe =
    /<a href="\/actress\/(\d+)\.html">\s*<div class="l-pic">\s*<img([^>]*)>/g;
  for (const m of html.matchAll(cardRe)) {
    const id = m[1] as string;
    if (seen.has(id)) continue;
    const attrs = m[2] as string;
    const name = /alt="([^"]*)"/.exec(attrs)?.[1]?.trim() ?? "";
    if (!name) continue;
    seen.add(id);
    const img =
      /data-layzr="([^"]*)"/.exec(attrs)?.[1] ??
      /src="([^"]*)"/.exec(attrs)?.[1] ??
      "";
    entries.push({
      id,
      name,
      image: img ? new URL(img, BASE_URL).toString() : "",
    });
  }
  return entries;
}

// The site's in-page search is no longer server-rendered (upstream
// PR #375), so search traverses the static actress list pages and
// matches by name. The full index (~31 pages) is built once per
// isolate and cached in memory; later searches are pure lookups.
let actorIndexCache: AvleagueIndexEntry[] | null = null;
let actorIndexBuilding: Promise<AvleagueIndexEntry[]> | null = null;

async function buildActorIndex(): Promise<AvleagueIndexEntry[]> {
  const pages = await Promise.allSettled(
    Array.from({ length: ACTOR_LIST_MAX_PAGE }, (_, i) =>
      fetch(`${ACTOR_LIST_URL}${i + 1}.html`, {
        headers: { "User-Agent": UA },
      }).then(async (r) => (r.ok ? parseAvleagueListPage(await r.text()) : [])),
    ),
  );
  const all: AvleagueIndexEntry[] = [];
  for (const p of pages) {
    if (p.status === "fulfilled") all.push(...p.value);
  }
  if (all.length === 0) {
    throw new ProviderError(
      "av-league actor index empty: site may be unreachable",
      "upstream",
    );
  }
  return all;
}

function getActorIndex(): Promise<AvleagueIndexEntry[]> {
  if (actorIndexCache) return Promise.resolve(actorIndexCache);
  if (!actorIndexBuilding) {
    actorIndexBuilding = buildActorIndex()
      .then((entries) => {
        actorIndexCache = entries;
        return entries;
      })
      .finally(() => {
        actorIndexBuilding = null;
      });
  }
  return actorIndexBuilding;
}

/** Name comparison key (upstream PR #375): drop spaces, drop the
 *  trailing "ari" the site appends to romaji names, lowercase. */
function normalizeActorName(s: string): string {
  let t = s.trim().replaceAll(" ", "").replaceAll("　", "");
  if (t.endsWith("ari")) t = t.slice(0, -3);
  return t.toLowerCase();
}

export async function searchAvleagueByName(
  keyword: string,
): Promise<ActorSearchResult[]> {
  const target = normalizeActorName(keyword);
  if (!target) {
    throw new ProviderError("invalid keyword", "invalid");
  }
  const entries = await getActorIndex();
  const results: ActorSearchResult[] = [];
  for (const e of entries) {
    const nn = normalizeActorName(e.name);
    if (nn !== target && !nn.includes(target)) continue;
    const result: ActorSearchResult = {
      id: e.id,
      name: e.name,
      provider: "AV-LEAGUE",
      homepage: ACTOR_URL + e.id + ".html",
      aliases: [],
      images: e.image ? [e.image] : [],
    };
    if (isValidActorSearchResult(result)) results.push(result);
  }
  // Exact matches first; shorter names are the likelier precise match.
  results.sort((a, b) => {
    const na = normalizeActorName(a.name);
    const nb = normalizeActorName(b.name);
    const ea = na === target;
    const eb = nb === target;
    if (ea !== eb) return ea ? -1 : 1;
    return na.length - nb.length;
  });
  return results;
}

function parseIDFromHomepage(homepage: string): string {
  try {
    const base = new URL(homepage).pathname.split("/").filter(Boolean).pop() ?? "";
    return base.replace(/\.[^.]*$/, "");
  } catch {
    return "";
  }
}

export class AvleagueProvider implements ActorProvider {
  readonly name = "AV-LEAGUE";
  readonly priority = 1000;

  normalizeActorID(id: string): string {
    return id.trim();
  }

  parseActorIDFromURL(rawURL: string): string | null {
    const id = parseIDFromHomepage(rawURL);
    return id ? this.normalizeActorID(decodeURIComponent(id)) : null;
  }

  async getActorInfoByID(id: string): Promise<ActorInfo> {
    const normalized = this.normalizeActorID(id);
    if (!normalized) {
      throw new ProviderError("invalid id", "invalid");
    }
    return this.getActorInfoByURL(`${ACTOR_URL}${normalized}.html`);
  }

  async getActorInfoByURL(rawURL: string): Promise<ActorInfo> {
    const id = this.parseActorIDFromURL(rawURL);
    if (!id) {
      throw new ProviderError(`cannot parse actor id from url: ${rawURL}`, "invalid");
    }
    let resp: Response;
    try {
      resp = await fetch(rawURL, { headers: { "User-Agent": UA } });
    } catch (e) {
      throw new ProviderError(`av-league fetch failed: ${String(e)}`, "upstream");
    }
    if (resp.status === 404) {
      throw new ProviderError(`actor not found: ${id}`, "not_found");
    }
    if (!resp.ok) {
      throw new ProviderError(`av-league http ${resp.status}`, "upstream");
    }
    const info = await parseAvleagueActorPage(await resp.text(), rawURL, id);
    if (!info.name) {
      throw new ProviderError(`actor not found: ${id}`, "not_found");
    }
    return info;
  }

  async searchActor(keyword: string): Promise<ActorSearchResult[]> {
    const kw = keyword.trim();
    if (!kw) {
      throw new ProviderError("invalid keyword", "invalid");
    }
    return searchAvleagueByName(kw);
  }
}
