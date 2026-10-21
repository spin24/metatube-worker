// Search-engine relay shared by providers whose own search endpoint
// is bot-gated from datacenter egress while their detail pages stay
// fetchable and indexed (AVE pioneered the pattern; DUGA and JAVFREE
// reuse it here). The public engines randomly answer with challenge
// or empty pages, so each query variant races all three engines in
// parallel with a short timeout and the first page that yields
// candidates wins.

import { fetchText } from "./scrape";

export const DDG_URL = "https://html.duckduckgo.com/html/?q=%s";
export const DDG_LITE_URL = "https://lite.duckduckgo.com/lite/?q=%s";
export const BING_URL = "https://www.bing.com/search?q=%s";

export async function raceSearchEngines(
  providerName: string,
  queryVariants: string[],
  extract: (html: string) => string[],
): Promise<string[]> {
  for (const queryText of queryVariants) {
    const q = encodeURIComponent(queryText);
    const pages = await Promise.allSettled(
      [DDG_URL, DDG_LITE_URL, BING_URL].map((template) =>
        fetchText(template.replace("%s", q), {
          providerName,
          timeoutMs: 6000,
        }),
      ),
    );
    for (const page of pages) {
      if (page.status !== "fulfilled") continue;
      const found = extract(page.value.text);
      if (found.length > 0) return found;
    }
  }
  return [];
}
