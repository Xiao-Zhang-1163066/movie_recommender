const BASE_URL = "https://api.themoviedb.org/3";
export const IMG_URL = "https://image.tmdb.org/t/p/w500";
const API_KEY = import.meta.env.VITE_TMDB_API_KEY;

export interface Movie {
  id: number;
  title: string;
  poster_path: string | null;
  vote_average: number;
}

export interface NowPlayingResponse {
  results: Movie[];
}

export async function getNowPlaying() {
  const res = await fetch(
    `${BASE_URL}/movie/now_playing?api_key=${API_KEY}&region=NZ`,
  );
  if (!res.ok) {
    throw new Error("Failed to fetch now playing movies");
  }
  const data = (await res.json()) as NowPlayingResponse;
  return data.results;
}

export interface MovieDetail extends Movie {
  overview: string;
  runtime: number;
  genres: { id: number; name: string }[];
}

export async function getMovieById(id: string) {
  const res = await fetch(`${BASE_URL}/movie/${id}?api_key=${API_KEY}`);
  if (!res.ok) {
    throw new Error("Failed to fetch movie details");
  }
  const data = (await res.json()) as MovieDetail;
  return data;
}
