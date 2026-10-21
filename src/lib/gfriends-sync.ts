// In-worker Gfriends dataset sync — the fully automatic path.
//
// The loader script (tools/load-gfriends.py) mirrors this logic
// from outside; this module runs the same flatten + diff inside
// the worker, driven by a Cron Trigger (see wrangler.toml
// [triggers]) or manually via POST /admin/gfriends/sync. Only the
// delta is written, so a run costs a handful of row writes; the
// expensive part is fetching and parsing the 6.5 MB Filetree.json,
// which is why writes happen strictly after the diff completes —
// a run interrupted by CPU limits simply changes nothing.

import { GFRIENDS_TABLE } from "../providers/gfriends";

export const FILETREE_URL =
  "https://raw.githubusercontent.com/gfriends/gfriends/master/Filetree.json";
const CONTENT_BASE =
  "https://raw.githubusercontent.com/gfriends/gfriends/master/Content";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// Match Python urllib.parse.quote (the loader's URL builder):
// encodeURIComponent plus escaping !'()* which Python escapes too.
function quotePySegment(s: string): string {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (ch) => "%" + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"),
  );
}

function quotePyPath(s: string): string {
  return s.split("/").map(quotePySegment).join("/");
}

export function gfriendsPhotoURL(category: string, path: string): string {
  const q = path.indexOf("?");
  const base = q >= 0 ? path.slice(0, q) : path;
  const query = q >= 0 ? path.slice(q + 1) : "";
  const url = `${CONTENT_BASE}/${quotePyPath(category)}/${quotePyPath(base)}`;
  return query ? `${url}?${query}` : url;
}

/** filename stem, mirroring os.path.splitext. */
function stemOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}

export interface FileTree {
  Content?: Record<string, Record<string, string>>;
}

/** Filetree.json -> name -> photo URLs (Go order, reversed). */
export function flattenFiletree(tree: FileTree): Map<string, string[]> {
  const byName = new Map<string, string[]>();
  for (const [category, files] of Object.entries(tree.Content ?? {})) {
    for (const [filename, path] of Object.entries(files)) {
      const stem = stemOf(filename);
      if (!stem) continue;
      let list = byName.get(stem);
      if (!list) {
        list = [];
        byName.set(stem, list);
      }
      list.push(gfriendsPhotoURL(category, path));
    }
  }
  for (const list of byName.values()) list.reverse();
  return byName;
}

export interface GfriendsSyncResult {
  upserts: number;
  deletes: number;
  total: number;
}

export async function syncGfriends(env: {
  DB: D1Database;
}): Promise<GfriendsSyncResult> {
  const resp = await fetch(FILETREE_URL, { headers: { "User-Agent": UA } });
  if (!resp.ok) {
    throw new Error(`filetree fetch failed: http ${resp.status}`);
  }
  const fresh = flattenFiletree((await resp.json()) as FileTree);

  const db = env.DB;
  await db.exec(
    `CREATE TABLE IF NOT EXISTS ${GFRIENDS_TABLE} (name TEXT PRIMARY KEY, images TEXT NOT NULL)`,
  );
  const { results } = await db
    .prepare(`SELECT name, images FROM ${GFRIENDS_TABLE}`)
    .all<{ name: string; images: string }>();
  const current = new Map(results.map((r) => [r.name, r.images]));

  const upserts: [string, string][] = [];
  for (const [name, images] of fresh) {
    const serialized = JSON.stringify(images);
    if (current.get(name) !== serialized) upserts.push([name, serialized]);
  }
  const deletes: string[] = [];
  for (const name of current.keys()) {
    if (!fresh.has(name)) deletes.push(name);
  }

  const CHUNK = 200;
  if (deletes.length > 0) {
    const del = db.prepare(`DELETE FROM ${GFRIENDS_TABLE} WHERE name = ?`);
    for (let i = 0; i < deletes.length; i += CHUNK) {
      await db.batch(deletes.slice(i, i + CHUNK).map((n) => del.bind(n)));
    }
  }
  if (upserts.length > 0) {
    const ins = db.prepare(
      `INSERT OR REPLACE INTO ${GFRIENDS_TABLE} (name, images) VALUES (?, ?)`,
    );
    for (let i = 0; i < upserts.length; i += CHUNK) {
      await db.batch(
        upserts.slice(i, i + CHUNK).map(([n, s]) => ins.bind(n, s)),
      );
    }
  }
  const total =
    (await db
      .prepare(`SELECT COUNT(*) AS n FROM ${GFRIENDS_TABLE}`)
      .first<{ n: number }>())?.n ?? 0;
  return { upserts: upserts.length, deletes: deletes.length, total };
}
