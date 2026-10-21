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
