# metatube-worker

Slim port of [metatube-sdk-go](https://github.com/metatube-community/metatube-sdk-go)
to **Cloudflare Workers (free tier)**.

Scope of this port, by design:

- **Three providers: FANZA, JavBus and AVBASE** (more can follow the same pattern).
- **No image pipeline** — no pigo face detection, no cropping, no goimagehash,
  no jpegli. Image URLs are returned exactly as the provider serves them.
- **D1 instead of GORM + SQLite/PostgreSQL** for the metadata cache.
- **API shape mirrors the Go server**: `{ "data": ... }` envelope,
  `/v1/...` routes, lazy cache semantics.

## Providers

### FANZA
GraphQL API (`api.video.dmm.co.jp/graphql`) for digital content — one
`fetch`, one JSON parse, no DOM — which is what makes it fit the Workers
free tier (10 ms CPU per request). Mono URLs are accepted and resolved
through the digital API via their `cid`.

Two porting notes:

- The trimmed GraphQL query requests only the fields that map onto
  `MovieInfo` (the Go query pulls pricing/products/playable-info too).
- All floor flags (`isAv` / `isAnime` / `isAmateur` / `isCinema`) are sent as
  `true` in a single request: the flags only gate `@include` fragments and
  the fragments do not conflict, so one subrequest replaces the Go version's
  per-floor probing.

### JavBus
Scrapes `https://www.javbus.com/ja/{ID}` (Japanese pages, like the Go
version) with **HTMLRewriter** — the native streaming parser is the only
HTML option that fits the free-tier CPU budget. Field mapping mirrors the
Go XPath handlers; cross-validated against FANZA data for the same titles.

- Thumb URL is derived (`/cover/{code}_b.jpg` → `/thumb/{code}.jpg`)
  instead of the Go version's HEAD-request probing.
- No summary / score / preview video: JavBus pages do not carry them.
- **JavBus image URLs are hotlink-protected**: they only load with a
  `Referer: https://www.javbus.com/` header (same behaviour as the Go
  version's URLs). Clients that set per-provider referers are fine.

## API

| Route | Description |
|---|---|
| `GET /` | Service info + provider list |
| `GET /v1/providers` | Registered providers |
| `GET /v1/movies/search?q=&provider=&fallback=` | Keyword search (see below). |
| `GET /v1/movies/:provider/:id` | Movie info. Lazy by default: D1 first, provider fetch on miss, then upsert. `?lazy=false` forces a refresh. |
| `POST /v1/movies/:provider/lookup` | Body `{ "url": "..." }` — parse the ID from a FANZA/JavBus URL, then same flow as above. |

### Search

Mirrors the Go server's `/v1/movies/search` handler and engine:

- `provider` given → search that provider only. Omitted → fan out to all
  search-capable providers concurrently; a failing provider is skipped,
  never fatal.
- Results are deduped by `provider + id` and, for all-provider search,
  ranked by `similarity(keyword, number) × provider priority`
  (Levenshtein, ported from `common/comparer`). Exact number matches
  float to the top.
- `fallback` (default `true`) also exact-matches the keyword against the
  D1 cache (`number` or `id`, case-insensitive) — previously fetched
  movies show up even when a live search misses them.
- If `q` is a URL, it resolves directly to that movie's info.

Provider notes:

- **FANZA** searches `www.dmm.co.jp/search` (limit 120, by date). Hyphenated
  numbers are rewritten (`ADN-306` → `adn00306#`, then `adn306`) because
  DMM cannot search them directly. The fetch uses `redirect: "manual"`:
  DMM answers non-Japanese egress with a 307 to a region page, but the 307
  body still contains the full result payload (Next.js `__next_f` flight
  data, from which `backendResponse` is extracted — a port of the Go
  `searchparse` package). Results are internally re-sorted by ID
  similarity, preferring digital homepages on ties.
- **JavBus** searches both `/ja/search/{q}` and
  `/ja/uncensored/search/{q}` and parses the `movie-box` cards; the cover
  URL is guessed from the thumb URL, like the Go version.

### AVBASE
Uses avbase.net's Next.js data API (`_next/data/{buildId}/works/...`),
with the buildId scraped from the homepage's `__NEXT_DATA__` and cached
for ~2 hours; a 404 invalidates the cache and retries once (AVBase
redeploys change the buildId).

AVBase is an aggregator: a work bundles products from source sites
(duga / fanza / getchu / mgstage / pcolle). Like the Go version, info
lookups delegate to the source provider for full metadata and then
supplement missing fields (maker/label/series/summary/genres, actors,
number) from the work record — in this port the delegation target is
FANZA only, and works without a FANZA product fall back to the work
record itself. Work IDs may carry a prefix (`prestige:ABP-588`).

Errors: `404` not found, `400` invalid input, `502` upstream failure,
returned as `{ "error": "..." }`.

## Setup

```bash
npm install

# Create the D1 database and paste the returned database_id into wrangler.toml
npm run db:create

# Apply the schema (remote for production, local for `wrangler dev`)
npm run db:remote
npm run db:local

# Run / deploy
npm run dev
npm run deploy
```

## Known limitations & next steps

- **Mono-only content** (DVD releases with no digital edition) will 404
  on FANZA info lookups, since the mono HTML path is not ported. (FANZA
  *search* does return mono results, like the Go version.)
- **Reviews are not implemented** (the GraphQL `UserReviews` query ports
  trivially if wanted).
- **FANZA region behaviour from Cloudflare egress IPs is unverified.**
  The GraphQL API answered fine from generic egress during development,
  but Cloudflare's own IP ranges may be treated differently — verify with
  a real ID right after deploying (`GET /v1/movies/FANZA/adn00306`).
- Free-tier budget: cache hits are ~1–2 ms CPU; a cache miss costs one
  GraphQL subrequest plus a small JSON parse — comfortably inside limits
  for personal use.

## Credits

Provider logic, GraphQL query shape and field mapping are ported from
metatube-sdk-go (Apache-2.0) by the MetaTube community.
