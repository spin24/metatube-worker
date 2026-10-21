// Shared types — field names mirror the JSON shape of metatube-sdk-go
// (model.MovieInfo) so existing clients keep working.

export interface MovieInfo {
  id: string;
  number: string;
  title: string;
  summary: string;
  provider: string;
  homepage: string;
  director: string;
  actors: string[];
  thumb_url: string;
  cover_url: string;
  preview_video_url: string;
  preview_video_hls_url: string;
  preview_images: string[];
  maker: string;
  label: string;
  series: string;
  genres: string[];
  score: number;
  /** minutes */
  runtime: number;
  /** YYYY-MM-DD or "" */
  release_date: string;
}

export function isValidMovieInfo(info: MovieInfo): boolean {
  // Same rule as the Go version: ID, Number, Title and CoverURL are required.
  return info.id !== "" && info.number !== "" && info.title !== "" && info.cover_url !== "";
}

export interface MovieProvider {
  readonly name: string;
  readonly priority: number;
  normalizeMovieID(id: string): string;
  parseMovieIDFromURL(rawURL: string): string | null;
  getMovieInfoByID(id: string): Promise<MovieInfo>;
  getMovieInfoByURL(rawURL: string): Promise<MovieInfo>;
}

export interface MovieSearchResult {
  id: string;
  number: string;
  title: string;
  provider: string;
  homepage: string;
  actors: string[];
  thumb_url: string;
  cover_url: string;
  score: number;
  /** YYYY-MM-DD or "" */
  release_date: string;
}

export function isValidSearchResult(r: MovieSearchResult): boolean {
  return r.id !== "" && r.number !== "" && r.title !== "" && r.provider !== "" && r.homepage !== "";
}

export function movieInfoToSearchResult(info: MovieInfo): MovieSearchResult {
  return {
    id: info.id,
    number: info.number,
    title: info.title,
    provider: info.provider,
    homepage: info.homepage,
    actors: info.actors,
    thumb_url: info.thumb_url,
    cover_url: info.cover_url,
    score: info.score,
    release_date: info.release_date,
  };
}

/** Optional search capability — mirrors the Go MovieSearcher interface. */
export interface MovieSearcher {
  normalizeMovieKeyword(keyword: string): string;
  searchMovie(keyword: string): Promise<MovieSearchResult[]>;
}

export function asSearcher(p: MovieProvider): (MovieProvider & MovieSearcher) | null {
  const s = p as MovieProvider & Partial<MovieSearcher>;
  return typeof s.searchMovie === "function" && typeof s.normalizeMovieKeyword === "function"
    ? (s as MovieProvider & MovieSearcher)
    : null;
}

/** Actor metadata — mirrors model.ActorInfo from the Go SDK. */
export interface ActorInfo {
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
  aliases: string[];
  images: string[];
  birthday: string;
  debut_date: string;
}

export function isValidActorInfo(info: ActorInfo): boolean {
  return info.id !== "" && info.name !== "" && info.provider !== "" && info.homepage !== "";
}

/** Subset of ActorInfo returned by actor searches — mirrors model.ActorSearchResult. */
export interface ActorSearchResult {
  id: string;
  name: string;
  provider: string;
  homepage: string;
  aliases: string[];
  images: string[];
}

export function isValidActorSearchResult(r: ActorSearchResult): boolean {
  return r.id !== "" && r.name !== "" && r.provider !== "" && r.homepage !== "";
}

export function actorInfoToSearchResult(info: ActorInfo): ActorSearchResult {
  return {
    id: info.id,
    name: info.name,
    provider: info.provider,
    homepage: info.homepage,
    aliases: info.aliases,
    images: info.images,
  };
}

export interface ActorProvider {
  readonly name: string;
  readonly priority: number;
  normalizeActorID(id: string): string;
  parseActorIDFromURL(rawURL: string): string | null;
  getActorInfoByID(id: string): Promise<ActorInfo>;
  getActorInfoByURL(rawURL: string): Promise<ActorInfo>;
  /** All actor providers implement search in the Go SDK (ActorSearcher). */
  searchActor(keyword: string): Promise<ActorSearchResult[]>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: "not_found" | "upstream" | "unsupported" | "invalid",
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface Env {
  DB: D1Database;
}
