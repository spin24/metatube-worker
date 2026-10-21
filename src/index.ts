// MetaTube — slim Workers port (23 movie providers + 1 actor provider,
// no image pipeline).
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
//   GET  /v1/actors/search?q=&provider=&fallback=
//                                       -> actor keyword search (one provider,
//                                          or all providers merged)
//   GET  /v1/actors/:provider/:id      -> actor info (lazy D1 cache by default)
//   POST /v1/actors/:provider/lookup    -> { "url": "..." } resolve info by URL
//
// Responses use the Go server's envelope: { "data": ... } on success,
// { "error": "..." } on failure.

import { Hono } from "hono";
import {
  ActorInfo,
  ActorProvider,
  ActorSearchResult,
  Env,
  MovieInfo,
  MovieProvider,
  MovieSearchResult,
  ProviderError,
  actorInfoToSearchResult,
  asSearcher,
  isValidActorInfo,
  isValidMovieInfo,
  isValidSearchResult,
  movieInfoToSearchResult,
} from "./types";
import {
  getActorInfoFromDB,
  getMovieInfoFromDB,
  saveActorInfoToDB,
  saveMovieInfoToDB,
  searchActorFromDB,
  searchMovieFromDB,
} from "./db";
import { compareStrings, parseActorNames } from "./lib/textutil";
import { FanzaProvider } from "./providers/fanza";
import { JavbusProvider } from "./providers/javbus";
import { AvbaseProvider } from "./providers/avbase";
import { AvleagueProvider } from "./providers/av-league";
import { GfriendsProvider, bindGfriendsDB, GFRIENDS_TABLE } from "./providers/gfriends";
import { pondoProviders } from "./providers/pondo-core";
import { caribProviders } from "./providers/carib-core";
import { site0930Providers } from "./providers/site0930";
import { falenoProviders } from "./providers/faleno-core";
import { heyzoProvider } from "./providers/heyzo";
import { heydougaProvider } from "./providers/heydouga";
import { mywifeProvider } from "./providers/mywife";
import { pcolleProvider } from "./providers/pcolle";
import { gcolleProvider } from "./providers/gcolle";
import { tokyohotProvider } from "./providers/tokyo-hot";
import { madouquProvider } from "./providers/madouqu";
import { fc2hubProvider } from "./providers/fc2hub";
import { dugaProvider } from "./providers/duga";
import { mgsProvider } from "./providers/mgs";
import { getchuProvider } from "./providers/getchu";
import { aveProvider } from "./providers/ave";
import { sodProvider } from "./providers/sod";
import { javfreeProvider } from "./providers/javfree";
import { fc2Provider } from "./providers/fc2";
import { fc2cmadbProvider } from "./providers/fc2cmadb";

const providers = new Map<string, MovieProvider>();
for (const p of [
  new FanzaProvider(),
  new JavbusProvider(),
  new AvbaseProvider(),
  ...pondoProviders,
  ...caribProviders,
  ...site0930Providers,
  ...falenoProviders,
  heyzoProvider,
  heydougaProvider,
  mywifeProvider,
  pcolleProvider,
  gcolleProvider,
  tokyohotProvider,
  madouquProvider,
  fc2hubProvider,
  dugaProvider,
  mgsProvider,
  getchuProvider,
  aveProvider,
  sodProvider,
  javfreeProvider,
  fc2Provider,
  fc2cmadbProvider,
]) {
  providers.set(p.name.toUpperCase(), p);
}

function getProvider(name: string): MovieProvider {
  const provider = providers.get(name.toUpperCase());
  if (!provider) {
    throw new ProviderError(`provider not found: ${name}`, "not_found");
  }
  return provider;
}

const actorProviders = new Map<string, ActorProvider>();
for (const p of [new AvleagueProvider(), new GfriendsProvider()]) {
  actorProviders.set(p.name.toUpperCase(), p);
}

function getActorProvider(name: string): ActorProvider {
  const provider = actorProviders.get(name.toUpperCase());
  if (!provider) {
    throw new ProviderError(`actor provider not found: ${name}`, "not_found");
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

/** Actor engine equivalent: lazy = D1 first, provider fetch on miss, upsert. */
async function getActorInfo(
  env: Env,
  provider: ActorProvider,
  id: string,
  lazy: boolean,
): Promise<ActorInfo> {
  const normalized = provider.normalizeActorID(id);
  if (lazy) {
    const cached = await getActorInfoFromDB(env.DB, provider.name, normalized);
    if (cached && isValidActorInfo(cached)) {
      return cached;
    }
  }
  const info = await provider.getActorInfoByID(normalized);
  await saveActorInfoToDB(env.DB, info);
  return info;
}

function dedupeActorResults(results: ActorSearchResult[]): ActorSearchResult[] {
  const seen = new Set<string>();
  const out: ActorSearchResult[] = [];
  for (const r of results) {
    const key = `${r.provider}|${r.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}

/**
 * Single-provider actor search — mirrors engine.searchActor: the keyword
 * is split into names (parser.ParseActorNames); per name, live results
 * are merged with DB fallback hits (DB first), filtered to name
 * similarity >= 0.3 and sorted by similarity (stable).
 */
async function searchActorSingle(
  env: Env,
  provider: ActorProvider,
  keyword: string,
  fallback: boolean,
): Promise<ActorSearchResult[]> {
  const names = parseActorNames(keyword);
  if (names.length === 0) {
    throw new ProviderError("invalid keyword", "invalid");
  }
  const all: ActorSearchResult[] = [];
  let firstError: unknown;
  for (const name of names) {
    let live: ActorSearchResult[] = [];
    try {
      live = await provider.searchActor(name);
    } catch (e) {
      if (firstError === undefined) firstError = e;
    }
    let merged = live;
    if (fallback) {
      const dbResults = await searchActorFromDB(env.DB, name, provider.name).catch(
        () => [] as ActorSearchResult[],
      );
      if (dbResults.length > 0) {
        merged = dedupeActorResults([...dbResults, ...live]);
      }
    }
    const scored = merged
      .map((r) => ({ r, s: compareStrings(r.name, name) }))
      .filter((x) => x.s >= 0.3);
    scored.sort((a, b) => b.s - a.s); // stable
    all.push(...scored.map((x) => x.r));
  }
  if (all.length === 0) {
    if (firstError) throw firstError;
    throw new ProviderError("info not found", "not_found");
  }
  return all;
}

/**
 * All-provider actor search — mirrors engine.SearchActorAll: fan out
 * (failures skipped), then stable-sort by provider priority only.
 */
async function searchActorAll(
  env: Env,
  keyword: string,
  fallback: boolean,
): Promise<ActorSearchResult[]> {
  const settled = await Promise.allSettled(
    [...actorProviders.values()].map((p) => searchActorSingle(env, p, keyword, fallback)),
  );
  let results: ActorSearchResult[] = settled.flatMap((s) =>
    s.status === "fulfilled" ? s.value : [],
  );
  const priorities = new Map(
    [...actorProviders.values()].map((p) => [p.name, p.priority]),
  );
  results = [...results].sort(
    (a, b) => (priorities.get(b.provider) ?? 0) - (priorities.get(a.provider) ?? 0),
  );
  if (results.length === 0) {
    throw new ProviderError("info not found", "not_found");
  }
  return results;
}

function actorProviderForURL(rawURL: string): ActorProvider | null {
  try {
    const host = new URL(rawURL).hostname;
    if (host.includes("av-league.com")) return actorProviders.get("AV-LEAGUE") ?? null;
    if (host.includes("github.com")) return actorProviders.get("GFRIENDS") ?? null;
  } catch {
    // not a URL
  }
  return null;
}

const app = new Hono<{ Bindings: Env }>();

// Gfriends reads its pre-indexed dataset from D1; bind the (per-
// isolate constant) DB handle before any actor route runs.
app.use("/v1/actors/*", async (c, next) => {
  bindGfriendsDB(c.env.DB);
  await next();
});

function requireAdminKey(c: { env: Env; req: { header(n: string): string | undefined } }): void {
  if (!c.env.ADMIN_KEY) {
    throw new ProviderError("admin endpoints disabled", "not_found");
  }
  if (c.req.header("x-admin-key") !== c.env.ADMIN_KEY) {
    throw new ProviderError("unauthorized", "invalid");
  }
}

// One-time dataset loader for Gfriends (see tools/load-gfriends.py).
// Guarded by the ADMIN_KEY secret; delete the secret after loading
// and these routes go inert.
app.post("/admin/gfriends/load", async (c) => {
  requireAdminKey(c);
  const body = await c.req
    .json<{ clear?: boolean; rows?: { name?: string; images?: string[] }[] }>()
    .catch(() => ({}) as { clear?: boolean; rows?: { name?: string; images?: string[] }[] });
  const rows = (body.rows ?? []).filter(
    (r) => typeof r.name === "string" && r.name !== "" && Array.isArray(r.images),
  );
  const db = c.env.DB;
  await db.exec(
    `CREATE TABLE IF NOT EXISTS ${GFRIENDS_TABLE} (name TEXT PRIMARY KEY, images TEXT NOT NULL)`,
  );
  if (body.clear) {
    await db.exec(`DELETE FROM ${GFRIENDS_TABLE}`);
  }
  if (rows.length > 0) {
    const stmt = db.prepare(
      `INSERT OR REPLACE INTO ${GFRIENDS_TABLE} (name, images) VALUES (?, ?)`,
    );
    await db.batch(
      rows.map((r) => stmt.bind(r.name, JSON.stringify(r.images))),
    );
  }
  const total = await db
    .prepare(`SELECT COUNT(*) AS n FROM ${GFRIENDS_TABLE}`)
    .first<{ n: number }>();
  return c.json({ data: { inserted: rows.length, total: total?.n ?? 0 } });
});

app.get("/admin/gfriends/stats", async (c) => {
  requireAdminKey(c);
  try {
    const total = await c.env.DB
      .prepare(`SELECT COUNT(*) AS n FROM ${GFRIENDS_TABLE}`)
      .first<{ n: number }>();
    return c.json({ data: { total: total?.n ?? 0 } });
  } catch {
    return c.json({ data: { total: 0 } });
  }
});

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

const HOST_PROVIDERS: [string, string][] = [
  ["dmm.co.jp", "FANZA"],
  ["javbus.com", "JAVBUS"],
  ["avbase.net", "AVBASE"],
  ["1pondo.tv", "1PONDO"],
  ["10musume.com", "10MUSUME"],
  ["pacopacomama.com", "PACOPACOMAMA"],
  ["muramura.tv", "MURAMURA"],
  ["caribbeancompr.com", "CARIBBEANCOMPR"],
  ["caribbeancom.com", "CARIBBEANCOM"],
  ["heyzo.com", "HEYZO"],
  ["heydouga.com", "HEYDOUGA"],
  ["mywife.cc", "MYWIFE"],
  ["pcolle.com", "PCOLLE"],
  ["gcolle.net", "GCOLLE"],
  ["c0930.com", "C0930"],
  ["h0930.com", "H0930"],
  ["h4610.com", "H4610"],
  ["faleno.jp", "FALENO"],
  ["dahlia-av.jp", "DAHLIA"],
  ["tokyo-hot.com", "TOKYO-HOT"],
  ["madouqu.com", "MADOUQU"],
  ["javten.com", "FC2HUB"],
  ["duga.jp", "DUGA"],
  ["mgstage.com", "MGS"],
  ["getchu.com", "GETCHU"],
  ["aventertainments.com", "AVE"],
  ["sod.co.jp", "SOD"],
  ["javfree.me", "JAVFREE"],
  ["fc2.com", "FC2"],
  ["fc2cmadb.com", "FC2CMADB"],
];

function providerForURL(rawURL: string): MovieProvider | null {
  try {
    const host = new URL(rawURL).hostname;
    for (const [needle, name] of HOST_PROVIDERS) {
      if (host.includes(needle)) return providers.get(name) ?? null;
    }
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
      actor_providers: [...actorProviders.values()].map((p) => p.name),
    },
  }),
);

app.get("/v1/providers", (c) =>
  c.json({
    data: [
      ...[...providers.values()].map((p) => ({ name: p.name, type: "movie" })),
      ...[...actorProviders.values()].map((p) => ({ name: p.name, type: "actor" })),
    ],
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

app.get("/v1/actors/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (!q) {
    throw new ProviderError("missing query parameter: q", "invalid");
  }
  const fallback = c.req.query("fallback") !== "false";
  if (/^https?:\/\//i.test(q)) {
    const provider = actorProviderForURL(q);
    const id = provider?.parseActorIDFromURL(q);
    if (provider && id) {
      const info = await getActorInfo(c.env, provider, id, true);
      return c.json({ data: [actorInfoToSearchResult(info)] });
    }
    throw new ProviderError(`unsupported url: ${q}`, "not_found");
  }
  const providerName = c.req.query("provider");
  if (providerName) {
    const provider = getActorProvider(providerName);
    return c.json({ data: await searchActorSingle(c.env, provider, q, fallback) });
  }
  return c.json({ data: await searchActorAll(c.env, q, fallback) });
});

app.get("/v1/actors/:provider/:id", async (c) => {
  const provider = getActorProvider(c.req.param("provider"));
  const lazy = c.req.query("lazy") !== "false";
  const info = await getActorInfo(c.env, provider, c.req.param("id"), lazy);
  return c.json({ data: info });
});

app.post("/v1/actors/:provider/lookup", async (c) => {
  const provider = getActorProvider(c.req.param("provider"));
  const body = await c.req.json<{ url?: string }>().catch(() => ({}) as { url?: string });
  if (!body.url) {
    throw new ProviderError("missing url", "invalid");
  }
  const id = provider.parseActorIDFromURL(body.url);
  if (!id) {
    throw new ProviderError(`cannot parse actor id from url: ${body.url}`, "invalid");
  }
  const lazy = c.req.query("lazy") !== "false";
  const info = await getActorInfo(c.env, provider, id, lazy);
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
