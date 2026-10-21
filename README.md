# metatube-worker

Slim port of [metatube-sdk-go](https://github.com/metatube-community/metatube-sdk-go)
to **Cloudflare Workers (free tier)**: movie/actor metadata lookup and
search with a D1 cache, API-compatible with the Go server
(`{ "data": ... }` envelope, `/v1/...` routes, lazy cache semantics).

By design: **no image pipeline** (no pigo/jpegli/goimagehash — image
URLs are returned exactly as providers serve them) and **no reviews**.

## Providers

### Movies (30)

| Provider | Search | | Provider | Search |
|---|:---:|---|---|:---:|
| FANZA | ✓ | | HEYZO | — |
| MGS | △ | | HeyDouga | — |
| Getchu | — | | MYWIFE | — |
| FC2 | — | | Gcolle | — |
| SOD | △ | | Pcolle | — † |
| fc2hub | ✓ | | C0930 | — |
| DUGA | ✓ | | H0930 | — |
| AVE | ✓ | | H4610 | — |
| FC2CMADB | — | | TOKYO-HOT | ✓ |
| AVBase | ✓ | | MadouQu | ✓ |
| JavBus | ✓ | | 1Pondo | — |
| FALENO | △ | | 10musume | — |
| DAHLIA | ✓ | | PACOPACOMAMA | — |
| JAVFREE | ✓ | | MURAMURA | — |
| Caribbeancom | — | | CaribbeancomPR | — |

### Actors (2)

| Provider | Search |
|---|:---:|
| AV-LEAGUE | ✓ |
| Gfriends | ✓ (exact name only, photos only) |

Legend: ✓ search implemented and working · △ search implemented but
the source site blocks Cloudflare egress (info lookups are blocked
too) · — info lookups only · † Pcolle info is implemented but its
site loops redirects against Workers `fetch`; kept registered,
effectively unusable.

Removed: KIN8 (upstream restructure broke every movie URL) and
FC2PPVDB (site shut down; FC2CMADB is its successor). Not ported:
ThePornDB (movie/scene/actor — needs a personal API token).

Notes:

- Providers whose own search endpoint is bot-gated from datacenter
  egress (AVE, DUGA) search through a web-search-engine relay
  (shared `src/lib/engines.ts`); JAVFREE search uses the site's
  WordPress REST API instead of its gated front end.
- JavBus image URLs are hotlink-protected: they only load with a
  `Referer: https://www.javbus.com/` header.
- Gfriends' dataset (one 6.5 MB Filetree.json, ~34k names) is
  pre-indexed into D1 and kept fresh automatically — see
  [Gfriends sync](#gfriends-sync).

## API

| Route | Description |
|---|---|
| `GET /` | Service info + provider list |
| `GET /v1/providers` | Registered providers |
| `GET /v1/movies/search?q=&provider=&fallback=` | Movie search (below) |
| `GET /v1/movies/:provider/:id` | Movie info. Lazy by default: D1 first, provider fetch on miss, then upsert. `?lazy=false` forces a refresh. |
| `POST /v1/movies/:provider/lookup` | Body `{ "url": "..." }` — parse the ID from a provider URL, then same flow as above. |
| `GET /v1/actors/search?q=&provider=&fallback=` | Actor search (below) |
| `GET /v1/actors/:provider/:id` | Actor info, same lazy cache flow. |
| `POST /v1/actors/:provider/lookup` | Body `{ "url": "..." }` — parse the actor ID from a URL. |

Errors: `404` not found, `400` invalid input, `501` unsupported,
`502` upstream failure, returned as `{ "error": "..." }`.

### Search semantics (mirrors the Go engine)

- `provider` given → that provider only. Omitted → fan out to all
  search-capable providers concurrently; a failing provider is
  skipped, never fatal. Merged fan-outs give each provider a **10 s
  deadline** (a provider that misses it is skipped for that
  response); single-provider searches are unbounded, as in Go.
- Movie results are deduped by `provider + id` and ranked by
  `similarity(keyword, number) × provider priority`; actor results
  are ranked by provider priority only.
- `fallback` (default `true`) exact-matches the keyword against the
  D1 cache (movie `number`/`id`, actor name — case-insensitive), so
  previously fetched entries show up even when a live search misses.
- If `q` is a URL, it resolves directly to that item's info.
- Actor keywords are split into names on `、;,（）`; per-name
  results are filtered to name similarity ≥ 0.3.

## Database (D1)

One database (`metatube`, binding `DB`) with three tables
(`schema.sql`):

- `movie_metadata`, `actor_metadata` — the lazy info caches.
- `gfriends_actors` — the pre-indexed Gfriends dataset.

### A note on `database_id`

The `database_id` in `wrangler.toml` is an **identifier, not a
credential** — it is safe to commit and publish. D1 is only
reachable through a Worker binding in the same account, the
dashboard, or the API with the account's API token; unauthenticated
API calls against the ID simply return `Authentication error`.

If you deploy your own copy: create **your own** D1 database, put
*its* ID in `wrangler.toml`, and apply `schema.sql`. The committed
ID points at the author's database, which your account cannot
access — by design, not by secrecy.

Quota note (free tier): 100k `rows_written`/day, and every index on
a written column costs at least one extra written row — a full
Gfriends reload is ~68k, so it is a disaster-recovery operation,
never a routine one. Normal traffic only writes cache misses.

## Gfriends sync

The Gfriends table syncs itself: a `scheduled()` handler fetches
Filetree.json, flattens it (34k names → photo URL lists), diffs
against the table and writes only the delta (a day's upstream
change is a few names). Enable it with a Cron Trigger —
`0 20 * * *` (04:00 Asia/Taipei) is in `wrangler.toml` `[triggers]`
and applies automatically on wrangler/Git deploys; for dashboard
deployments add it under Settings → Triggers → Cron Triggers.
`POST /admin/gfriends/sync` runs the identical path on demand.

The external loader (`tools/load-gfriends.py`, delta by default,
`--full` for disaster recovery) talks to the key-guarded
`/admin/gfriends/*` endpoints (`ADMIN_KEY` secret). Once the cron
sync is verified, the secret can be deleted and those endpoints go
inert; the loader is then a recovery tool only.

## Deployment via GitHub (Workers Builds)

1. Push this repo to GitHub (public or private).
2. Cloudflare dashboard: Workers & Pages → `metatube-worker`
   → Settings → **Builds** → Connect → GitHub; pick the repo and the
   production branch (`main`). Build command: *(empty)*; deploy
   command: `npx wrangler deploy` (the default).
3. Every push to `main` now builds and deploys. `wrangler.toml` is
   the source of truth for bindings, observability and the cron
   trigger; dashboard-set secrets survive deploys untouched.

The manual alternative — pasting `dist/metatube-worker.bundle.js`
into the dashboard code editor — keeps working, but stop mixing the
two flows once Git deployments are on.

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

## Known limitations

- **Mono-only content** (DVD releases with no digital edition) 404s
  on FANZA info lookups — the mono HTML path is not ported. (FANZA
  *search* does return mono results, like the Go version.)
- Free-tier budget: subrequests per invocation cap merged searches
  at the current 13 searchers; cache hits are ~1–2 ms CPU.

## Credits

Provider logic and field mapping are ported from metatube-sdk-go
(Apache-2.0) by the MetaTube community.
