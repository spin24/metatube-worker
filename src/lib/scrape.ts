// Shared scraping helpers for the HTML/JSON providers.
//
// fetchText wraps fetch with the browser UA the Go scrapers present, an
// optional Cookie header (several providers gate on age/modal cookies),
// and ProviderError mapping. collectFields / collectPairs drive
// HTMLRewriter for the common extraction shapes the Go providers express
// as XPath: text/attr of a selector, and label->value table rows.

import { MovieInfo, ProviderError } from "../types";

export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export interface FetchTextResult {
  status: number;
  text: string;
  /** Final URL after redirects. */
  url: string;
  headers: Headers;
}

export async function fetchText(
  url: string,
  opts: {
    cookie?: string;
    referer?: string;
    method?: string;
    body?: string;
    contentType?: string;
    redirect?: "follow" | "manual";
    providerName?: string;
  } = {},
): Promise<FetchTextResult> {
  const headers: Record<string, string> = { "User-Agent": UA };
  if (opts.cookie) headers["Cookie"] = opts.cookie;
  if (opts.referer) headers["Referer"] = opts.referer;
  if (opts.contentType) headers["Content-Type"] = opts.contentType;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body,
      redirect: opts.redirect ?? "follow",
    });
  } catch (e) {
    throw new ProviderError(
      `${opts.providerName ?? "fetch"} failed: ${String(e)}`,
      "upstream",
    );
  }
  // Response.text() always decodes UTF-8, but several of these sites
  // still serve EUC-JP / Shift_JIS (the Go scrapers detect charset).
  // Decode from the buffer with the declared/sniffed charset instead.
  const buf = await resp.arrayBuffer();
  return { status: resp.status, text: decodeBody(buf, resp.headers), url: resp.url, headers: resp.headers };
}

/** Decode a body using Content-Type charset, else a <meta charset> sniff. */
export function decodeBody(buf: ArrayBuffer, headers?: Headers): string {
  let label = "";
  const ct = headers?.get("content-type") ?? "";
  const fromHeader = /charset=([a-zA-Z0-9_-]+)/.exec(ct);
  if (fromHeader) label = fromHeader[1];
  if (!label) {
    const head = new TextDecoder("utf-8").decode(buf.slice(0, 4096));
    const fromMeta = /charset=["']?([a-zA-Z0-9_-]+)/i.exec(head);
    if (fromMeta) label = fromMeta[1];
  }
  if (label && !/^utf-?8$/i.test(label)) {
    try {
      return new TextDecoder(label).decode(buf);
    } catch {
      // unknown label: fall through to UTF-8
    }
  }
  return new TextDecoder("utf-8").decode(buf);
}

/** fetchText that throws not_found on 404 and upstream on other non-2xx. */
export async function fetchPage(
  url: string,
  opts: Parameters<typeof fetchText>[1] & { notFoundMessage?: string } = {},
): Promise<FetchTextResult> {
  const r = await fetchText(url, opts);
  if (r.status === 404) {
    throw new ProviderError(opts.notFoundMessage ?? `not found: ${url}`, "not_found");
  }
  if (r.status < 200 || r.status >= 300) {
    throw new ProviderError(`http ${r.status} for ${url}`, "upstream");
  }
  return r;
}

export function absURL(base: string, rel: string): string {
  if (!rel) return "";
  try {
    return new URL(rel, base).toString();
  } catch {
    return rel;
  }
}

export function baseMovieInfo(provider: string, id: string, homepage: string): MovieInfo {
  return {
    id,
    number: "",
    title: "",
    summary: "",
    provider,
    homepage,
    director: "",
    actors: [],
    thumb_url: "",
    cover_url: "",
    preview_video_url: "",
    preview_video_hls_url: "",
    preview_images: [],
    maker: "",
    label: "",
    series: "",
    genres: [],
    score: 0,
    runtime: 0,
    release_date: "",
  };
}

/**
 * Loose date parser covering the formats these sites use:
 * 1993年8月16日 / 2021-04-07 / 2021/4/7 / 2021.4.7.
 * (Go uses dateparse; these providers' dates are all in this family.)
 */
export function parseDateLoose(s: string | undefined): string {
  if (!s) return "";
  const jp = /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/.exec(s);
  if (jp) return `${jp[1]}-${jp[2].padStart(2, "0")}-${jp[3].padStart(2, "0")}`;
  const iso = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const en = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})|(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(s);
  if (en) {
    const months: Record<string, number> = {
      january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
      july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
      jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
    };
    const mon = months[(en[1] ?? en[5]).toLowerCase()];
    if (mon) {
      const day = (en[2] ?? en[4]).padStart(2, "0");
      return `${en[3] ?? en[6]}-${String(mon).padStart(2, "0")}-${day}`;
    }
  }
  return "";
}

/** Extract and JSON-parse every <script type="application/ld+json"> block. */
export function extractJsonLd(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    try {
      const data = JSON.parse(m[1].replace(/\n/g, "") as string) as unknown;
      if (Array.isArray(data)) {
        for (const d of data) {
          if (d && typeof d === "object") out.push(d as Record<string, unknown>);
        }
      } else if (data && typeof data === "object") {
        out.push(data as Record<string, unknown>);
      }
    } catch {
      // ignore malformed blocks
    }
  }
  return out;
}

/**
 * Decode the HTML entities HTMLRewriter leaves raw in text chunks
 * (it streams text undecoded, unlike a DOM parser). Covers the named
 * entities these sites use plus numeric references.
 */
export function decodeEntities(s: string): string {
  return s
    .replace(/\u0000/g, "")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/g, "\u00A0")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export interface FieldSpec {
  key: string;
  selector: string;
  mode: "text" | "texts" | "attr" | "attrs";
  attr?: string;
}

/**
 * One HTMLRewriter pass collecting per-selector values:
 * - text:  concatenated text of all matches (document order)
 * - texts: one item per text node (trimmed, non-empty) — mirrors
 *          parser.ParseTexts semantics
 * - attr:  attribute of the first match
 * - attrs: attribute of every match
 */
export async function collectFields(
  html: string,
  specs: FieldSpec[],
): Promise<Record<string, string | string[]>> {
  const out: Record<string, string | string[]> = {};
  let rw = new HTMLRewriter();
  for (const spec of specs) {
    if (spec.mode === "text") out[spec.key] = "";
    else if (spec.mode === "attr") out[spec.key] = "";
    else out[spec.key] = [];
    rw = rw.on(spec.selector, {
      element(el) {
        if (spec.mode === "attr") {
          if (out[spec.key] === "") {
            out[spec.key] = el.getAttribute(spec.attr ?? "") ?? "";
          }
        } else if (spec.mode === "attrs") {
          const v = el.getAttribute(spec.attr ?? "");
          if (v !== null) (out[spec.key] as string[]).push(v);
        }
      },
      text(t) {
        if (spec.mode === "text") {
          out[spec.key] = (out[spec.key] as string) + decodeEntities(t.text);
        } else if (spec.mode === "texts") {
          const v = decodeEntities(t.text).trim();
          if (v) (out[spec.key] as string[]).push(v);
        }
      },
    });
  }
  await rw.transform(new Response(html)).text();
  if (typeof out.__dummy === "string") delete out.__dummy;
  return out;
}

/**
 * Collect label->value rows where label and value cells share one
 * selector and simply alternate in document order (two cells per row:
 * span pairs, td pairs). Needed because HTMLRewriter's selector engine
 * rejects positional pseudo-classes like :first-child/:first-of-type.
 */
export async function collectPairsSeq(
  html: string,
  cellSelector: string,
): Promise<PairRow[]> {
  interface Cell {
    text: string;
    texts: string[];
    linkBuf: string;
    linkDone: boolean;
  }
  const cells: Cell[] = [];
  let cur: Cell | null = null;
  const rw = new HTMLRewriter()
    .on(cellSelector, {
      element() {
        cur = { text: "", texts: [], linkBuf: "", linkDone: false };
        cells.push(cur);
      },
      text(t) {
        if (!cur) return;
        cur.text += decodeEntities(t.text);
        const v = decodeEntities(t.text).trim();
        if (v) cur.texts.push(v);
      },
    })
    .on(`${cellSelector} a`, {
      text(t) {
        if (cur && !cur.linkDone) {
          cur.linkBuf += decodeEntities(t.text);
          if (t.lastInTextNode) cur.linkDone = true;
        }
      },
    });
  await rw.transform(new Response(html)).text();
  const rows: PairRow[] = [];
  for (let i = 0; i + 1 < cells.length; i += 2) {
    rows.push({
      label: cells[i].text.trim(),
      value: cells[i + 1].text.trim(),
      valueTexts: cells[i + 1].texts,
      valueFirstLink: cells[i + 1].linkBuf.trim(),
    });
  }
  return rows;
}

export interface PairRow {
  label: string;
  /** Concatenated text of the value cell. */
  value: string;
  /** Text nodes of the value cell (ParseTexts semantics). */
  valueTexts: string[];
  /** Text of the first <a> inside the value cell ("" when none). */
  valueFirstLink: string;
}

/**
 * Collect label->value rows where label and value cells alternate in
 * document order (dt/dd, th/td, span pairs). A row is flushed when the
 * next label element starts.
 */
export async function collectPairs(
  html: string,
  labelSelector: string,
  valueSelector: string,
): Promise<PairRow[]> {
  const rows: PairRow[] = [];
  let cur: (PairRow & { linkBuf: string; linkDone: boolean }) | null = null;
  const flush = () => {
    if (cur) {
      cur.label = cur.label.trim();
      cur.value = cur.value.trim();
      cur.valueFirstLink = cur.linkBuf.trim();
      rows.push(cur);
      cur = null;
    }
  };
  const linkSelector = `${valueSelector} a`;
  const rw = new HTMLRewriter()
    .on("tr", {
      element() {
        flush();
      },
    })
    .on(labelSelector, {
      element() {
        flush();
        cur = { label: "", value: "", valueTexts: [], valueFirstLink: "", linkBuf: "", linkDone: false };
      },
      text(t) {
        if (cur) cur.label += decodeEntities(t.text);
      },
    })
    .on(valueSelector, {
      text(t) {
        if (!cur) return;
        cur.value += decodeEntities(t.text);
        const v = decodeEntities(t.text).trim();
        if (v) cur.valueTexts.push(v);
      },
    })
    .on(linkSelector, {
      text(t) {
        if (cur && !cur.linkDone) {
          cur.linkBuf += decodeEntities(t.text);
          if (t.lastInTextNode) cur.linkDone = true;
        }
      },
    });
  await rw.transform(new Response(html)).text();
  flush();
  return rows;
}
