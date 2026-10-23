// D1 cache layer — the slim equivalent of the Go engine's GORM-backed
// store (getMovieInfoFromDB + delayed auto-save in getMovieInfoWithCallback).

import {
  ActorInfo,
  ActorSearchResult,
  MovieInfo,
  MovieSearchResult,
  actorInfoToSearchResult,
  isValidActorInfo,
  isValidMovieInfo,
  movieInfoToSearchResult,
} from "./types";

interface MovieRow {
  id: string;
  number: string;
  title: string;
  summary: string;
  provider: string;
  homepage: string;
  director: string;
  actors: string;
  thumb_url: string;
  cover_url: string;
  big_thumb_url: string | null;
  preview_video_url: string;
  preview_video_hls_url: string;
  preview_images: string;
  maker: string;
  label: string;
  series: string;
  genres: string;
  score: number;
  runtime: number;
  release_date: string;
}

function rowToMovieInfo(row: MovieRow): MovieInfo {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    summary: row.summary,
    provider: row.provider,
    homepage: row.homepage,
    director: row.director,
    actors: JSON.parse(row.actors) as string[],
    thumb_url: row.thumb_url,
    cover_url: row.cover_url,
    big_thumb_url: row.big_thumb_url ?? "",
    preview_video_url: row.preview_video_url,
    preview_video_hls_url: row.preview_video_hls_url,
    preview_images: JSON.parse(row.preview_images) as string[],
    maker: row.maker,
    label: row.label,
    series: row.series,
    genres: JSON.parse(row.genres) as string[],
    score: row.score,
    runtime: row.runtime,
    release_date: row.release_date,
  };
}

export async function getMovieInfoFromDB(
  db: D1Database,
  provider: string,
  id: string,
): Promise<MovieInfo | null> {
  const row = await db
    .prepare("SELECT * FROM movie_metadata WHERE provider = ? AND id = ? COLLATE NOCASE")
    .bind(provider, id)
    .first<MovieRow>();
  return row ? rowToMovieInfo(row) : null;
}

export async function saveMovieInfoToDB(db: D1Database, info: MovieInfo): Promise<void> {
  try {
    await insertMovieInfo(db, info, true);
  } catch {
    // The big_thumb_url column may not exist yet on databases created
    // before it was added (see schema.sql / the ALTER in the README of
    // this change). Fall back to the legacy column set so cache writes
    // keep working until the migration runs.
    await insertMovieInfo(db, info, false);
  }
}

async function insertMovieInfo(
  db: D1Database,
  info: MovieInfo,
  withBigThumb: boolean,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const bigCols = withBigThumb ? "big_thumb_url, " : "";
  const bigVals = withBigThumb ? "?, " : "";
  const bigSet = withBigThumb ? "big_thumb_url = excluded.big_thumb_url,\n         " : "";
  const stmt = db.prepare(
    `INSERT INTO movie_metadata (
       provider, id, number, title, summary, homepage, director, actors,
       thumb_url, cover_url, ${bigCols}preview_video_url, preview_video_hls_url,
       preview_images, maker, label, series, genres, score, runtime,
       release_date, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${bigVals}?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (provider, id) DO UPDATE SET
       number = excluded.number,
       title = excluded.title,
       summary = excluded.summary,
       homepage = excluded.homepage,
       director = excluded.director,
       actors = excluded.actors,
       thumb_url = excluded.thumb_url,
       cover_url = excluded.cover_url,
       ${bigSet}preview_video_url = excluded.preview_video_url,
       preview_video_hls_url = excluded.preview_video_hls_url,
       preview_images = excluded.preview_images,
       maker = excluded.maker,
       label = excluded.label,
       series = excluded.series,
       genres = excluded.genres,
       score = excluded.score,
       runtime = excluded.runtime,
       release_date = excluded.release_date,
       updated_at = excluded.updated_at`,
  );
  const binds: unknown[] = [
    info.provider,
    info.id,
    info.number,
    info.title,
    info.summary,
    info.homepage,
    info.director,
    JSON.stringify(info.actors),
    info.thumb_url,
    info.cover_url,
  ];
  if (withBigThumb) binds.push(info.big_thumb_url);
  binds.push(
    info.preview_video_url,
    info.preview_video_hls_url,
    JSON.stringify(info.preview_images),
    info.maker,
    info.label,
    info.series,
    JSON.stringify(info.genres),
    info.score,
    info.runtime,
    info.release_date,
    now,
    now,
  );
  await stmt.bind(...binds).run();
}

/**
 * DB fallback for search — mirrors engine.searchMovieFromDB: exact match
 * on number OR id (case-insensitive), optionally scoped to one provider.
 */
export async function searchMovieFromDB(
  db: D1Database,
  keyword: string,
  providerName?: string,
): Promise<MovieSearchResult[]> {
  const scoped = providerName !== undefined;
  const stmt = scoped
    ? db
        .prepare(
          "SELECT * FROM movie_metadata WHERE provider = ? AND (number = ? COLLATE NOCASE OR id = ? COLLATE NOCASE)",
        )
        .bind(providerName, keyword, keyword)
    : db
        .prepare(
          "SELECT * FROM movie_metadata WHERE number = ? COLLATE NOCASE OR id = ? COLLATE NOCASE",
        )
        .bind(keyword, keyword);
  const { results } = await stmt.all<MovieRow>();
  return results
    .map(rowToMovieInfo)
    .filter(isValidMovieInfo)
    .map(movieInfoToSearchResult);
}

// ---------------------------------------------------------------------------
// Actors — the actor_metadata table mirrors model.ActorInfo the same way.
// ---------------------------------------------------------------------------

interface ActorRow {
  id: string;
  name: string;
  provider: string;
  homepage: string;
  summary: string;
  hobby: string;
  skill: string;
  blood_type: string;
  cup_size: string;
  measurements: string;
  nationality: string;
  height: number;
  aliases: string;
  images: string;
  birthday: string;
  debut_date: string;
}

function rowToActorInfo(row: ActorRow): ActorInfo {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    homepage: row.homepage,
    summary: row.summary,
    hobby: row.hobby,
    skill: row.skill,
    blood_type: row.blood_type,
    cup_size: row.cup_size,
    measurements: row.measurements,
    nationality: row.nationality,
    height: row.height,
    aliases: JSON.parse(row.aliases) as string[],
    images: JSON.parse(row.images) as string[],
    birthday: row.birthday,
    debut_date: row.debut_date,
  };
}

export async function getActorInfoFromDB(
  db: D1Database,
  provider: string,
  id: string,
): Promise<ActorInfo | null> {
  const row = await db
    .prepare("SELECT * FROM actor_metadata WHERE provider = ? AND id = ? COLLATE NOCASE")
    .bind(provider, id)
    .first<ActorRow>();
  return row ? rowToActorInfo(row) : null;
}

export async function saveActorInfoToDB(db: D1Database, info: ActorInfo): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO actor_metadata (
         provider, id, name, homepage, summary, hobby, skill, blood_type,
         cup_size, measurements, nationality, height, aliases, images,
         birthday, debut_date, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (provider, id) DO UPDATE SET
         name = excluded.name,
         homepage = excluded.homepage,
         summary = excluded.summary,
         hobby = excluded.hobby,
         skill = excluded.skill,
         blood_type = excluded.blood_type,
         cup_size = excluded.cup_size,
         measurements = excluded.measurements,
         nationality = excluded.nationality,
         height = excluded.height,
         aliases = excluded.aliases,
         images = excluded.images,
         birthday = excluded.birthday,
         debut_date = excluded.debut_date,
         updated_at = excluded.updated_at`,
    )
    .bind(
      info.provider,
      info.id,
      info.name,
      info.homepage,
      info.summary,
      info.hobby,
      info.skill,
      info.blood_type,
      info.cup_size,
      info.measurements,
      info.nationality,
      info.height,
      JSON.stringify(info.aliases),
      JSON.stringify(info.images),
      info.birthday,
      info.debut_date,
      now,
      now,
    )
    .run();
}

/**
 * DB fallback for actor search — mirrors engine.searchActorFromDB: exact
 * name match (case-insensitive) scoped to one provider.
 */
export async function searchActorFromDB(
  db: D1Database,
  keyword: string,
  providerName: string,
): Promise<ActorSearchResult[]> {
  const { results } = await db
    .prepare(
      "SELECT * FROM actor_metadata WHERE provider = ? AND name = ? COLLATE NOCASE",
    )
    .bind(providerName, keyword)
    .all<ActorRow>();
  return results
    .map(rowToActorInfo)
    .filter(isValidActorInfo)
    .map(actorInfoToSearchResult);
}
