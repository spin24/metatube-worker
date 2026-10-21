#!/usr/bin/env python3
"""One-time loader: index the public gfriends dataset into the
metatube-worker's D1 (gfriends_actors table) via its key-guarded
/admin/gfriends/load endpoint.

Usage:
    GF_ADMIN_KEY=<your secret> python3 tools/load-gfriends.py

Optional env:
    GF_WORKER_URL   worker base URL (default: the production worker)
    GF_BATCH        rows per request    (default: 1000)
    GF_DRY_RUN=1    flatten and report only; no uploads, no key needed

The dataset (Filetree.json from the gfriends GitHub repo) maps
filenames to paths; an actor's photos are every file whose stem
equals her name, across all categories — exactly the Go provider's
semantics, including its final reverse (descending order).
"""

import json
import os
import sys
import time
import urllib.parse
import urllib.request

FILETREE_URL = "https://raw.githubusercontent.com/gfriends/gfriends/master/Filetree.json"
CONTENT_URL = "https://raw.githubusercontent.com/gfriends/gfriends/master/Content"
WORKER_URL = os.environ.get(
    "GF_WORKER_URL", "https://metatube-worker.spin-tw.workers.dev"
).rstrip("/")
ADMIN_KEY = os.environ.get("GF_ADMIN_KEY", "")
BATCH = int(os.environ.get("GF_BATCH", "1000"))
DRY_RUN = os.environ.get("GF_DRY_RUN") == "1"


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


def post(path: str, payload: dict | None) -> dict:
    req = urllib.request.Request(
        WORKER_URL + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"x-admin-key": ADMIN_KEY, "Content-Type": "application/json"},
        method="POST" if payload is not None else "GET",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.load(resp)


def main() -> int:
    print(f"downloading {FILETREE_URL} ...")
    with urllib.request.urlopen(FILETREE_URL, timeout=180) as resp:
        tree = json.load(resp)
    rows = flatten(tree)
    total_images = sum(len(r["images"]) for r in rows)
    print(f"flattened: {len(rows)} names, {total_images} photos")
    if DRY_RUN:
        for probe in ("三上悠亜", "明日花キララ"):
            hit = next((r for r in rows if r["name"] == probe), None)
            print(f"  dry-run {probe}: {len(hit['images']) if hit else 0} photos")
        return 0
    if not ADMIN_KEY:
        print("error: set GF_ADMIN_KEY to the worker's ADMIN_KEY secret", file=sys.stderr)
        return 1
    batches = [rows[i : i + BATCH] for i in range(0, len(rows), BATCH)]
    print(f"uploading {len(batches)} batches to {WORKER_URL}/admin/gfriends/load ...")
    for i, batch in enumerate(batches):
        payload = {"clear": i == 0, "rows": batch}
        for attempt in range(3):
            try:
                result = post("/admin/gfriends/load", payload)
                break
            except Exception as e:  # retry transient failures
                if attempt == 2:
                    raise
                print(f"  batch {i + 1}: retry after {e}")
                time.sleep(2)
        print(f"  batch {i + 1}/{len(batches)}: table total = {result['data']['total']}")
    stats = post("/admin/gfriends/stats", None)
    print(f"done: gfriends_actors holds {stats['data']['total']} names")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
