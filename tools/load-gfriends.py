#!/usr/bin/env python3
"""Loader: index the public gfriends dataset into the metatube-
worker's D1 (gfriends_actors table) via its key-guarded
/admin/gfriends/* endpoints.

Default mode is DELTA: the current table is dumped, diffed against
a freshly flattened Filetree.json, and only added/changed/deleted
names are written. The upstream repo auto-updates daily, but a
day's delta is only a handful of names, so a refresh costs a few
row writes (a full reload costs ~34k rows x2 — D1 also charges
index maintenance per write). Run it weekly/monthly, or whenever.

Usage:
    GF_ADMIN_KEY=<your secret> python3 tools/load-gfriends.py [--full]

Optional env:
    GF_WORKER_URL     worker base URL (default: the production worker)
    GF_FILETREE_URL   dataset URL (default: the gfriends GitHub repo;
                      a file:// URL works for testing)
    GF_BATCH          rows per request    (default: 1000)
    GF_DRY_RUN=1      report only; with a key set, reports the delta
                      against the live table without writing

--full ignores the current table, clears it and loads everything
(disaster recovery; ~68k rows_written against the daily quota).

The dataset maps filenames to paths; an actor's photos are every
file whose stem equals her name, across all categories — exactly
the Go provider's semantics, including its final reverse
(descending order).
"""

import json
import os
import sys
import time
import urllib.parse
import urllib.request

FILETREE_URL = os.environ.get(
    "GF_FILETREE_URL",
    "https://raw.githubusercontent.com/gfriends/gfriends/master/Filetree.json",
)
CONTENT_URL = "https://raw.githubusercontent.com/gfriends/gfriends/master/Content"
WORKER_URL = os.environ.get(
    "GF_WORKER_URL", "https://metatube-worker.spin-tw.workers.dev"
).rstrip("/")
ADMIN_KEY = os.environ.get("GF_ADMIN_KEY", "")
BATCH = int(os.environ.get("GF_BATCH", "1000"))
DRY_RUN = os.environ.get("GF_DRY_RUN") == "1"
FULL = "--full" in sys.argv
BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


def photo_url(category: str, path: str) -> str:
    # The stored path may carry a "?t=" cache-buster, which stays a
    # query string (the Go version builds it with url.Parse too).
    base, _, query = path.partition("?")
    url = f"{CONTENT_URL}/{urllib.parse.quote(category)}/{urllib.parse.quote(base)}"
    return f"{url}?{query}" if query else url


def flatten(tree: dict) -> list[dict]:
    by_name: dict[str, list[str]] = {}
    for category, files in tree.get("Content", {}).items():
        for filename, path in files.items():
            stem = os.path.splitext(filename)[0]
            if not stem:
                continue
            by_name.setdefault(stem, []).append(photo_url(category, path))
    rows = []
    for name, images in by_name.items():
        images.reverse()  # Go: descending order
        rows.append({"name": name, "images": images})
    return rows


def request(path: str, payload: dict | None) -> dict:
    req = urllib.request.Request(
        WORKER_URL + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={
            "x-admin-key": ADMIN_KEY,
            "Content-Type": "application/json",
            # The workers.dev edge rejects Python's default UA (1010).
            "User-Agent": BROWSER_UA,
        },
        method="POST" if payload is not None else "GET",
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        return json.load(resp)


def post_batch(payload: dict) -> dict:
    for attempt in range(3):
        try:
            return request("/admin/gfriends/load", payload)
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2)
    raise AssertionError("unreachable")


def load_filetree() -> list[dict]:
    print(f"downloading {FILETREE_URL} ...")
    req = urllib.request.Request(FILETREE_URL, headers={"User-Agent": BROWSER_UA})
    with urllib.request.urlopen(req, timeout=180) as resp:
        tree = json.load(resp)
    rows = flatten(tree)
    print(f"flattened: {len(rows)} names, {sum(len(r['images']) for r in rows)} photos")
    return rows


def full_load(rows: list[dict]) -> int:
    batches = [rows[i : i + BATCH] for i in range(0, len(rows), BATCH)]
    print(f"FULL load: {len(batches)} batches to {WORKER_URL} ...")
    total = 0
    for i, batch in enumerate(batches):
        result = post_batch({"clear": i == 0, "rows": batch})
        total = result["data"]["total"]
        print(f"  batch {i + 1}/{len(batches)}: table total = {total}")
    return total


def delta_load(rows: list[dict]) -> int:
    print(f"fetching current table from {WORKER_URL}/admin/gfriends/dump ...")
    dump = request("/admin/gfriends/dump", None)["data"]["rows"]
    current: dict[str, list[str]] = {}
    for row in dump:
        try:
            current[row["name"]] = json.loads(row["images"])
        except Exception:
            current[row["name"]] = []
    fresh = {r["name"]: r["images"] for r in rows}
    upserts = [
        {"name": name, "images": images}
        for name, images in fresh.items()
        if current.get(name) != images
    ]
    deletes = [name for name in current if name not in fresh]
    print(
        f"delta: {len(upserts)} to upsert "
        f"({sum(1 for u in upserts if u['name'] not in current)} new, "
        f"{sum(1 for u in upserts if u['name'] in current)} changed), "
        f"{len(deletes)} to delete, {len(current)} currently stored"
    )
    if DRY_RUN:
        print("dry run: nothing written")
        return len(current)
    if not upserts and not deletes:
        print("already up to date")
        return len(current)
    batches = [upserts[i : i + BATCH] for i in range(0, len(upserts), BATCH)] or [[]]
    total = len(current)
    for i, batch in enumerate(batches):
        payload: dict = {"rows": batch}
        if i == 0 and deletes:
            payload["delete"] = deletes
        result = post_batch(payload)
        total = result["data"]["total"]
        print(f"  batch {i + 1}/{len(batches)}: table total = {total}")
    return total


def main() -> int:
    rows = load_filetree()
    if DRY_RUN and not ADMIN_KEY:
        for probe in ("三上悠亜", "明日花キララ"):
            hit = next((r for r in rows if r["name"] == probe), None)
            print(f"  dry-run {probe}: {len(hit['images']) if hit else 0} photos")
        return 0
    if not ADMIN_KEY:
        print("error: set GF_ADMIN_KEY to the worker's ADMIN_KEY secret", file=sys.stderr)
        return 1
    total = full_load(rows) if FULL else delta_load(rows)
    if not DRY_RUN:
        stats = request("/admin/gfriends/stats", None)
        print(f"done: gfriends_actors holds {stats['data']['total']} names")
    else:
        print(f"done (dry run): table holds {total} names")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
