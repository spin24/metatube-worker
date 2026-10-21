# metatube-worker

Slim port of [metatube-sdk-go](https://github.com/metatube-community/metatube-sdk-go)
to **Cloudflare Workers (free tier)**.

Scope of this port, by design:

- **30 movie providers**: FANZA, JavBus, AVBASE, the batch-1 set —
  1Pondo, 10musume, PACOPACOMAMA, MURAMURA, Caribbeancom, CaribbeancomPR,
  HEYZO, HeyDouga, MYWIFE, Pcolle, Gcolle, C0930, H0930, H4610,
  FALENO, DAHLIA, TOKYO-HOT, MadouQu, fc2hub — the batch-2 set —
  DUGA, MGS, Getchu, AVE, SOD, JAVFREE — and FC2 (official) plus
  FC2CMADB. KIN8 and FC2PPVDB were removed: KIN8 was abandoned after
  its upstream restructure broke every movie URL, and fc2ppvdb.com
  shut down (FC2CMADB is its successor and takes its place).
- **Two actor providers: AV-LEAGUE and Gfriends** — actor info +
  actor search with the same lazy D1 cache semantics
  (`actor_metadata` table). Gfriends reads a pre-indexed D1 table
  (see the Actors section).
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
  never fatal. Merged fan-outs give each provider a 10 s deadline (a
  provider that misses it is skipped for that response) so a slow
  relay search cannot hold the whole merged result hostage;
  single-provider searches are unbounded, as in Go.
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

### Batch-1 providers (20)

Ports of the Go providers' info lookups; the ones with a Go
`MovieSearcher` (DAHLIA, FALENO, TOKYO-HOT, MadouQu, fc2hub) also search.
Shared plumbing lives in `src/lib/scrape.ts` (fetch + charset-aware
decoding — Caribbeancom and the 0930 family still serve EUC-JP — and
HTMLRewriter field/label-row collectors; note HTMLRewriter rejects
positional pseudo-classes and leaves entities raw in text chunks, both
handled there).

- **1Pondo family** (`pondo-core.ts`: 1Pondo / 10musume / PACOPACOMAMA /
  MURAMURA) is JSON-API based — detail + gallery JSON endpoints, no HTML.
- **Caribbeancom family** (`carib-core.ts`) parses `#moviepages` rows;
  the score is the star-character count, as in Go.
- **0930 family** (`site0930.ts`: C0930 / H0930 / H4610) reads the
  JSON-LD block plus the `#movieInfo` definition list; numbers are
  `{provider}-{id}` lowercased.
- **FALENO / DAHLIA** (`faleno-core.ts`) share one site engine
  (WordPress-style `/?s=` search, `modal=off` cookie, no redirect
  following on search — the body is parsed as-is).
- **HEYZO** additionally resolves the player script's m3u8 to the MP4
  sample URL; **HeyDouga** pulls its score from a rating JSON and genres
  from a tag POST (best-effort).
- **Gcolle** targets the site's current redesign (`/adult/contents/{id}`
  + Product JSON-LD) — the Go version's osCommerce XPaths match nothing
  on the new layout. **HeyDouga**'s info list is likewise gone from the
  current pages, so actors/runtime/release there depend on the
  rating/tag endpoints and the heading cast list.
- **MadouQu** keeps the Go version's priority `0` (registered but
  effectively disabled in merged-search ranking).
- **fc2hub** targets javten.com: JSON-LD primary (the Go version's
  positional `#content` XPaths duplicate the same fields), and search
  is the redirect probe (`/search?kw=` → video page).
- Not yet verified from any egress (blocked in the dev sandbox, first
  real test is production): FALENO, Pcolle. FC2 and FC2CMADB parsers
  are validated locally against real pages from the dev sandbox;
  their first Cloudflare-egress test is the deploy that ships them.

### Batch-2 providers (7)

- **DUGA** info scrape (the page's 作品ID replaces the URL id, as in
  Go). Its own search endpoint answers 503 to datacenter egress, so
  search relays through web search engines like AVE's (shared
  `lib/engines.ts`): `site:duga.jp` queries yield `/ppv/` work slugs
  that resolve to full info and are verified by number; slug-shaped
  keywords resolve directly, and verified number → slug mappings are
  remembered per isolate.
- **MGS** needs the `adc=1` cookie; the preview video comes from the
  sampleplayer JSON endpoint (ISM URL rewritten to .mp4). The Go
  version's BigThumbURL derivation is dropped — this port's MovieInfo
  has no big-thumb field. Reviews are not ported (out of scope).
- **Getchu** (dl.getchu.com, EUC-JP) keys its title/cover/gallery
  cells off presentational attributes, and its spec rows are read by
  regex because the page is one nest of layout tables.
- **AVE** takes IDs from the `pro` query param; search numbers come
  from jacket image filenames. The native `/dvd/search` is hard-gated
  by a reCAPTCHA v2 (verifybot) for datacenter egress, so search is
  resolved through web search engines instead: a `site:`-restricted
  DuckDuckGo (Lite/Bing fallbacks) query finds candidate detail
  pages, and each candidate is verified against its real metadata
  before being returned — for number-like keywords only exact number
  matches survive.
- **SOD** reproduces the age-gate flow (follow the enter link with
  the page as Referer, parse that body) and fails lookups whose cover
  is still the `now_*.jpg` placeholder, as Go does.
- **JAVFREE** is FC2-only with dual IDs (`{post}-{number}`). The
  front-end `?s=` search is WAF-gated from datacenter egress, so
  search uses the site's WordPress REST API
  (`/wp-json/wp/v2/search`), which returns post URLs directly;
  a search-engine relay and the original `?s=` page remain as
  fallbacks.
- **FC2** (official, priority 1000) scrapes adult.contents.fc2.com
  article pages, Go-faithful: hidden spam spans are stripped from
  the title, the summary comes from its iframe subdocument, and a
  mismatched 商品ID row fails the lookup. Info only, as in Go.
- **FC2CMADB** (998, FC2PPVDB's replacement) parses the article
  record out of the site's Inertia props JSON (`data-page` script
  block): title, release date, duration, writer as maker, tags as
  genres; the cover is the w800 rendition of the FC2 thumbnail.

Not yet verified from the dev sandbox (blocked there; first real
test is production, as with batch 1): MGS, SOD. AVE's
engine-relay search is verified live (flaky per request by nature;
it leans on its learned-mapping fast path). The DUGA relay and
JAVFREE wp-json search get their first live test with the deploy
that ships them — their extractors are validated locally against
real engine/REST responses.

### Actors (AV-LEAGUE, Gfriends)
`GET /v1/actors/AV-LEAGUE/{id}`, `POST /v1/actors/AV-LEAGUE/lookup` and
`GET /v1/actors/search?q=&provider=&fallback=` mirror the movie engine:
lazy D1 cache in `actor_metadata`, keyword split into names on
`、;,（）`, per-name results merged with exact-name DB fallback hits,
filtered to name similarity >= 0.3; the all-provider variant sorts by
provider priority only. Profiles are scraped from av-league.com actress
pages (name, aliases, measurements/cup, height, blood type, birthday,
debut date, nationality, profile image URL).

**Gfriends** (priority 999) is photos-only, as in Go: an actor's ID is
her name and a lookup returns every dataset photo whose filename stem
equals it (search is exact-name only). The dataset is one 6.5 MB
Filetree.json — unparseable within the free tier's 10 ms CPU budget —
so it is pre-indexed into the `gfriends_actors` D1 table (~34k names)
by `tools/load-gfriends.py`, which posts batches to the key-guarded
`POST /admin/gfriends/load` endpoint (create an `ADMIN_KEY` secret,
run the loader once, then delete the secret; the endpoint creates
the table itself). ThePornDB's actor provider is not ported: it
requires a personal API token.

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
- **Reviews are not ported** (out of scope by decision).
- FANZA / JavBus / AVBase / AV-LEAGUE are all verified reachable from
  Cloudflare egress in production; the batch-1 providers are verified
  per-provider as deployments land (see the note in their section).
- Free-tier budget: cache hits are ~1–2 ms CPU; a cache miss costs one
  GraphQL subrequest plus a small JSON parse — comfortably inside limits
  for personal use.

## Credits

Provider logic, GraphQL query shape and field mapping are ported from
metatube-sdk-go (Apache-2.0) by the MetaTube community.
