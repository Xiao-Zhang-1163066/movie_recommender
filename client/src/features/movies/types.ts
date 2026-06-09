export type InTheaterMovie = {
  id: string;
  tmdbId: number | null;
  title: string;
  posterUrl: string | null;
  voteAverage: number | null;
  overview: string | null;
  releaseYear: number;
};

export type WatchlistPayload = {
  tmdbId: number;
  title: string;
  posterUrl: string | null;
  overview: string | null;
  releaseYear: number | null;
  voteAverage?: number | null;
};

export type MovieCardData = {
  tmdbId: number;
  title: string;
  posterUrl: string | null;
  overview: string | null;
  voteAverage: number | null;
  releaseYear: number | null;
};
