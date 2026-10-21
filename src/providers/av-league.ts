// AV-LEAGUE actor provider — slim port of provider/av-league from
// metatube-sdk-go. av-league.com is an actress database: profile pages at
// /actress/{numeric-id}.html and a plain-HTML search endpoint. Parsing
// uses HTMLRewriter (streaming) like the JavBus provider.
//
// Two porting notes:
// - The raw HTML has no <tbody> (colly/goquery inserts one implicitly,
//   HTMLRewriter does not), so table selectors omit it.
// - Search cards: the Go code reads the lazy-load attribute data-layzr;
//   the site now also serves plain src — we take data-layzr first, then
//   src, so images survive either markup.

import {
  ActorInfo,
  ActorProvider,
  ActorSearchResult,
  ProviderError,
  isValidActorSearchResult,
} from "../types";

const BASE_URL = "https://www.av-league.com/";
const ACTOR_URL = "https://www.av-league.com/actress/";
const SEARCH_URL = "https://www.av-league.com/search/search.php?k=";

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
export async function parseAvleagueSearchPage(
  html: string,
  pageURL: string,
): Promise<ActorSearchResult[]> {
  const results: ActorSearchResult[] = [];
  let picHref = "";
  let picImg = "";
  let nameHref = "";
  let nameText = "";

  const flush = () => {
    const href = nameHref || picHref;
    if (href && nameText.trim()) {
      const homepage = new URL(href, pageURL).toString();
      const id = parseIDFromHomepage(homepage);
      if (id) {
        results.push({
          id,
          name: nameText.trim(),
          provider: "AV-LEAGUE",
          homepage,
          aliases: [],
          images: picImg ? [new URL(picImg, pageURL).toString()] : [],
        });
      }
    }
    picHref = "";
    picImg = "";
    nameHref = "";
    nameText = "";
  };

  const rewriter = new HTMLRewriter()
    .on(".l-pic a", {
      element(el) {
        // A new card's picture link: flush any un-flushed previous card.
        if (nameHref || nameText) flush();
        picHref = el.getAttribute("href") ?? "";
      },
    })
    .on(".l-pic a img", {
      element(el) {
        picImg = el.getAttribute("data-layzr") || el.getAttribute("src") || "";
      },
    })
    .on(".l-name a", {
      element(el) {
        nameHref = el.getAttribute("href") ?? "";
      },
      text(t) {
        nameText += t.text;
        if (t.lastInTextNode) flush();
      },
    });

  await rewriter.transform(new Response(html)).text();
  flush();
  return results.filter(isValidActorSearchResult);
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
    const url = SEARCH_URL + encodeURIComponent(keyword);
    let resp: Response;
    try {
      resp = await fetch(url, { headers: { "User-Agent": UA } });
    } catch (e) {
      throw new ProviderError(`av-league search failed: ${String(e)}`, "upstream");
    }
    if (!resp.ok) {
      throw new ProviderError(`av-league search http ${resp.status}`, "upstream");
    }
    return parseAvleagueSearchPage(await resp.text(), url);
  }
}
