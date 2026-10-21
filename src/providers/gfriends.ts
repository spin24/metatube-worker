// Gfriends — port of provider/gfriends from metatube-sdk-go.
// A photos-only actor provider backed by the public gfriends
// dataset on GitHub: an actor's ID is her name, and a lookup
// returns every photo whose filename stem equals that name.
//
// The dataset is a single 6.5 MB Filetree.json (107k files,
// ~34k names) — far beyond the free tier's 10 ms CPU budget to
// parse per request — so it is pre-indexed into D1 instead:
// the gfriends_actors table (name -> JSON array of photo URLs)
// is populated once by tools/load-gfriends.py through the
// key-guarded /admin/gfriends/load endpoint. Lookups here are a
// single indexed SELECT. Search is exact-name only, as in Go.

import {
  ActorInfo,
  ActorProvider,
  ActorSearchResult,
  ProviderError,
  actorInfoToSearchResult,
} from "../types";

const BASE_URL = "https://github.com/gfriends/gfriends";
export const GFRIENDS_TABLE = "gfriends_actors";

// The engine's providers are env-free by design; the D1 binding
// (identical for every request in an isolate) is bound per request
// by middleware in index.ts before any actor route runs.
let boundDB: D1Database | null = null;
export function bindGfriendsDB(db: D1Database): void {
  boundDB = db;
}

function db(): D1Database {
  if (!boundDB) {
    throw new ProviderError("gfriends index unavailable", "upstream");
  }
  return boundDB;
}

function formatHomepage(id: string): string {
  return `${BASE_URL}?gfriends-id=${encodeURIComponent(id)}`;
}

export class GfriendsProvider implements ActorProvider {
  readonly name = "Gfriends";
  readonly priority = 999;

  normalizeActorID(id: string): string {
    return id.trim();
  }

  parseActorIDFromURL(rawURL: string): string | null {
    try {
      return new URL(rawURL).searchParams.get("gfriends-id");
    } catch {
      return null;
    }
  }

  async getActorInfoByID(id: string): Promise<ActorInfo> {
    const name = this.normalizeActorID(id);
    if (!name) throw new ProviderError(`invalid id: ${id}`, "invalid");
    const row = await db()
      .prepare(`SELECT images FROM ${GFRIENDS_TABLE} WHERE name = ?`)
      .bind(name)
      .first<{ images: string }>();
    if (!row) {
      throw new ProviderError(`actor not found: ${name}`, "not_found");
    }
    let images: string[] = [];
    try {
      const parsed = JSON.parse(row.images) as unknown;
      if (Array.isArray(parsed)) {
        images = parsed.filter((u): u is string => typeof u === "string");
      }
    } catch {
      images = [];
    }
    if (images.length === 0) {
      throw new ProviderError(`actor not found: ${name}`, "not_found");
    }
    return {
      id: name,
      name,
      provider: this.name,
      homepage: formatHomepage(name),
      summary: "",
      hobby: "",
      skill: "",
      blood_type: "",
      cup_size: "",
      measurements: "",
      nationality: "",
      height: 0,
      aliases: [],
      images,
      birthday: "",
      debut_date: "",
    };
  }

  async getActorInfoByURL(rawURL: string): Promise<ActorInfo> {
    const id = this.parseActorIDFromURL(rawURL);
    if (!id) {
      throw new ProviderError(
        `cannot parse actor id from url: ${rawURL}`,
        "invalid",
      );
    }
    return this.getActorInfoByID(id);
  }

  async searchActor(keyword: string): Promise<ActorSearchResult[]> {
    // Go semantics: search is an exact-name lookup, nothing fuzzier.
    try {
      const info = await this.getActorInfoByID(keyword);
      return [actorInfoToSearchResult(info)];
    } catch {
      return [];
    }
  }
}
