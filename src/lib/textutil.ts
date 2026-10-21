// Text helpers ported from metatube-sdk-go (common/comparer, common/number).

/**
 * Similarity between two strings — port of comparer.Compare:
 * Levenshtein-based, case-insensitive, insert/delete cost 1, replace cost 2.
 * Returns a value in [0, 1]; used only for relative ranking.
 */
export function compareStrings(a: string, b: string): number {
  const s = [...a.toLowerCase()];
  const t = [...b.toLowerCase()];
  if (s.length === 0 || t.length === 0) {
    return s.length === t.length ? 1 : 0;
  }
  let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
  let cur = new Array<number>(t.length + 1);
  for (let i = 1; i <= s.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 2;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  const dist = prev[t.length];
  return Math.max(0, 1 - dist / Math.max(s.length, t.length));
}

const UNCENSORED_RE =
  /^(\d{4,6}[-_]\d{2,3}|(cz|gedo|k|n|kb|se)\d{2,4}|(heyzo|xxx-av|heydouga|kin8)[-_].+|([hc]0930|h4610|av9898|1000giri)[-_][a-z\d]+)$/i;
const FC2_RE = /^FC2([-_]?PPV)?[-_]?\d+$/i;
const SPECIAL_BRAND_RE = /^(gcolle|getchu|gyutto|pcolle|mywife)[-_]?.+$/i;

/** Port of number.IsSpecial: uncensored / FC2 / certain amateur brands. */
export function isSpecial(s: string): boolean {
  return isUncensored(s) || isFC2(s) || SPECIAL_BRAND_RE.test(s);
}

/** Port of number.IsUncensored. */
export function isUncensored(s: string): boolean {
  return UNCENSORED_RE.test(s);
}

/** Port of number.IsFC2. */
export function isFC2(s: string): boolean {
  return FC2_RE.test(s);
}

/** Port of parser.ParseIDToNumber: "adn00306" -> "ADN-00306". */
export function parseIDToNumber(s: string): string {
  const up = s.toUpperCase();
  const m = /(\d*[A-Z]+)(\d+)/.exec(up);
  return m ? `${m[1]}-${m[2]}` : up;
}

/** Port of parser.ParseScore: strips 点, takes the first field, parseFloat. */
export function parseScore(s: string): number {
  const fields = s.replace(/点/g, "").trim().split(/\s+/).filter(Boolean);
  if (fields.length === 0) return 0;
  const n = parseFloat(fields[0]);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Port of parser.ParseRuntime (via ParseDuration): "1:23:45", "83分",
 * "PT1H23M", "2h10m" -> whole minutes (truncated).
 */
export function parseRuntime(s: string): number {
  if (!s) return 0;
  let t = s
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/秒/g, "s")
    .replace(/分/g, "m")
    .replace(/時/g, "h")
    .replace(/时/g, "h")
    .replace(/sec/g, "s")
    .replace(/min/g, "m");
  let m = /(\d+):(\d+):(\d+)/.exec(t);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  m = /(\d+):(\d+)/.exec(t);
  if (m) return parseInt(m[1], 10);
  let total = 0;
  let found = false;
  for (const part of t.matchAll(/(\d+)([hms])/g)) {
    found = true;
    const v = parseInt(part[1], 10);
    if (part[2] === "h") total += v * 60;
    else if (part[2] === "m") total += v;
    else total += v / 60;
  }
  return found ? Math.floor(total) : 0;
}

const ACTOR_NAME_SEPARATORS = new Set(["、", ";", ",", "(", "（", ")", "）"]);

/**
 * Port of parser.ParseActorNames: split a keyword into individual actor
 * names on 、 ; , and parentheses (full/half width).
 */
export function parseActorNames(s: string): string[] {
  const names: string[] = [];
  let buf = "";
  const flush = () => {
    const name = buf.trim();
    if (name) names.push(name);
    buf = "";
  };
  for (const ch of s) {
    if (ACTOR_NAME_SEPARATORS.has(ch)) {
      flush();
    } else {
      buf += ch;
    }
  }
  flush();
  return names;
}
