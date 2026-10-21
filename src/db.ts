// D1 cache layer — the slim equivalent of the Go engine's GORM-backed
// store (getMovieInfoFromDB + delayed auto-save in getMovieInfoWithCallback).

import { MovieInfo, MovieSearchResult, isValidMovieInfo, movieInfoToSearchResult } from "./types";

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
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO movie_metadata (
         provider, id, number, title, summary, homepage, director, actors,
         thumb_url, cover_url, preview_video_url, preview_video_hls_url,
         preview_images, maker, label, series, genres, score, runtime,
         release_date, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (provider, id) DO UPDATE SET
         number = excluded.number,
         title = excluded.title,
         summary = excluded.summary,
         homepage = excluded.homepage,
         director = excluded.director,
         actors = excluded.actors,
         thumb_url = excluded.thumb_url,
         cover_url = excluded.cover_url,
         preview_video_url = excluded.preview_video_url,
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
    )
    .bind(
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
    )
    .run();
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
