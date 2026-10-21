// MetaTube — slim Workers port (FANZA + JavBus, no image pipeline).
//
// Route shape mirrors the Go server's /v1 API:
//   GET  /                              -> service info
//   GET  /v1/providers                  -> registered providers
//   GET  /v1/movies/search?q=&provider=&fallback=
//                                       -> keyword search (one provider, or
//                                          all providers merged + ranked);
//                                          a URL in q resolves directly
//   GET  /v1/movies/:provider/:id      -> movie info (lazy D1 cache by default)
//   POST /v1/movies/:provider/lookup    -> { "url": "..." } resolve info by URL
//
// Responses use the Go server's envelope: { "data": ... } on success,
// { "error": "..." } on failure.

import { Hono } from "hono";
import {
  Env,
  MovieInfo,
  MovieProvider,
  MovieSearchResult,
  ProviderError,
  asSearcher,
  isValidMovieInfo,
  isValidSearchResult,
  movieInfoToSearchResult,
} from "./types";
import { getMovieInfoFromDB, saveMovieInfoToDB, searchMovieFromDB } from "./db";
import { compareStrings } from "./lib/textutil";
import { FanzaProvider } from "./providers/fanza";
import { JavbusProvider } from "./providers/javbus";
import { AvbaseProvider } from "./providers/avbase";

const providers = new Map<string, MovieProvider>();
for (const p of [new FanzaProvider(), new JavbusProvider(), new AvbaseProvider()]) {
  providers.set(p.name.toUpperCase(), p);
}

function getProvider(name: string): MovieProvider {
  const provider = providers.get(name.toUpperCase());
  if (!provider) {
    throw new ProviderError(`provider not found: ${name}`, "not_found");
  }
  return provider;
}

/** Engine equivalent: lazy = D1 first, provider fetch on miss, then upsert. */
async function getMovieInfo(
  env: Env,
  provider: MovieProvider,
  id: string,
  lazy: boolean,
): Promise<MovieInfo> {
  const normalized = provider.normalizeMovieID(id);
  if (lazy) {
    const cached = await getMovieInfoFromDB(env.DB, provider.name, normalized);
    if (cached && isValidMovieInfo(cached)) {
      return cached;
    }
  }
  const info = await provider.getMovieInfoByID(normalized);
  await saveMovieInfoToDB(env.DB, info);
  return info;
}

const app = new Hono<{ Bindings: Env }>();

function dedupeSearchResults(results: MovieSearchResult[]): MovieSearchResult[] {
  const seen = new Set<string>();
  const out: MovieSearchResult[] = [];
  for (const r of results) {
    const key = `${r.provider}|${r.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}

/** Single-provider search — mirrors engine.searchMovie (incl. DB fallback). */
async function searchSingleProvider(
  env: Env,
  provider: MovieProvider,
  keyword: string,
  fallback: boolean,
): Promise<MovieSearchResult[]> {
  const searcher = asSearcher(provider);
  if (!searcher) {
    // Providers without search fall back to a plain ID lookup.
    const info = await getMovieInfo(env, provider, keyword, true);
    return [movieInfoToSearchResult(info)];
  }
  const kw = searcher.normalizeMovieKeyword(keyword.trim());
  if (!kw) {
    throw new ProviderError("invalid keyword", "invalid");
  }
  let live: MovieSearchResult[] = [];
  let liveError: unknown;
  try {
    live = await searcher.searchMovie(kw);
  } catch (e) {
    liveError = e;
  }
  let merged = live;
  if (fallback) {
    const dbResults = await searchMovieFromDB(env.DB, kw, provider.name).catch(
      () => [] as MovieSearchResult[],
    );
    if (dbResults.length > 0) {
      merged = dedupeSearchResults([...live, ...dbResults]);
    }
  }
  if (merged.length === 0) {
    if (liveError) throw liveError;
    throw new ProviderError("info not found", "not_found");
  }
  return merged;
}

/**
 * All-provider search — mirrors engine.SearchMovieAll: fan out to every
 * search-capable provider (a failing provider is skipped, never fatal),
 * merge DB fallback hits, dedupe by provider+id, then rank by
 * similarity(keyword, number) x provider priority.
 */
async function searchAllProviders(
  env: Env,
  keyword: string,
  fallback: boolean,
): Promise<MovieSearchResult[]> {
  const searchers = [...providers.values()]
    .map((p) => asSearcher(p))
    .filter((s) => s !== null);
  const settled = await Promise.allSettled(
    searchers.map(async (s) => {
      const kw = s.normalizeMovieKeyword(keyword);
      if (!kw) return [] as MovieSearchResult[];
      return s.searchMovie(kw);
    }),
  );
  let results: MovieSearchResult[] = settled.flatMap((s) =>
    s.status === "fulfilled" ? s.value : [],
  );
  if (fallback) {
    const dbResults = await searchMovieFromDB(env.DB, keyword).catch(
      () => [] as MovieSearchResult[],
    );
    results = [...results, ...dbResults];
  }
  results = dedupeSearchResults(results).filter(isValidSearchResult);
  const priorities = new Map(
    [...providers.values()].map((p) => [p.name, p.priority]),
  );
  const score = (r: MovieSearchResult) =>
    compareStrings(keyword, r.number) * (priorities.get(r.provider) ?? 0);
  results = [...results].sort((a, b) => score(b) - score(a)); // stable sort
  if (results.length === 0) {
    throw new ProviderError("info not found", "not_found");
  }
  return results;
}

function providerForURL(rawURL: string): MovieProvider | null {
  try {
    const host = new URL(rawURL).hostname;
    if (host.includes("dmm.co.jp")) return providers.get("FANZA") ?? null;
    if (host.includes("javbus.com")) return providers.get("JAVBUS") ?? null;
    if (host.includes("avbase.net")) return providers.get("AVBASE") ?? null;
  } catch {
    // not a URL
  }
  return null;
}

app.get("/", (c) =>
  c.json({
    data: {
      name: "metatube-worker",
      version: "0.1.0",
      providers: [...providers.values()].map((p) => p.name),
    },
  }),
);

app.get("/v1/providers", (c) =>
  c.json({
    data: [...providers.values()].map((p) => ({ name: p.name })),
  }),
);

app.get("/v1/movies/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (!q) {
    throw new ProviderError("missing query parameter: q", "invalid");
  }
  const fallback = c.req.query("fallback") !== "false";
  // A URL in q resolves directly to movie info (original handler behaviour).
  if (/^https?:\/\//i.test(q)) {
    const provider = providerForURL(q);
    const id = provider?.parseMovieIDFromURL(q);
    if (provider && id) {
      const info = await getMovieInfo(c.env, provider, id, true);
      return c.json({ data: [movieInfoToSearchResult(info)] });
    }
    throw new ProviderError(`unsupported url: ${q}`, "not_found");
  }
  const providerName = c.req.query("provider");
  if (providerName) {
    const provider = getProvider(providerName);
    return c.json({ data: await searchSingleProvider(c.env, provider, q, fallback) });
  }
  return c.json({ data: await searchAllProviders(c.env, q, fallback) });
});

app.get("/v1/movies/:provider/:id", async (c) => {
  const provider = getProvider(c.req.param("provider"));
  const lazy = c.req.query("lazy") !== "false";
  const info = await getMovieInfo(c.env, provider, c.req.param("id"), lazy);
  return c.json({ data: info });
});

app.post("/v1/movies/:provider/lookup", async (c) => {
  const provider = getProvider(c.req.param("provider"));
  const body = await c.req.json<{ url?: string }>().catch(() => ({}) as { url?: string });
  if (!body.url) {
    throw new ProviderError("missing url", "invalid");
  }
  const id = provider.parseMovieIDFromURL(body.url);
  if (!id) {
    throw new ProviderError(`cannot parse movie id from url: ${body.url}`, "invalid");
  }
  const lazy = c.req.query("lazy") !== "false";
  const info = await getMovieInfo(c.env, provider, id, lazy);
  return c.json({ data: info });
});

app.onError((err, c) => {
  if (err instanceof ProviderError) {
    const status =
      err.kind === "not_found"
        ? 404
        : err.kind === "invalid"
          ? 400
          : err.kind === "unsupported"
            ? 501
            : 502;
    return c.json({ error: err.message }, status);
  }
  return c.json({ error: String(err) }, 500);
});

app.notFound((c) => c.json({ error: "not found" }, 404));

export default app;
