const BASE_URL = "https://api.themoviedb.org/3";
export const IMG_URL = "https://image.tmdb.org/t/p/w500";
const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
export interface Movie {
  id: number;
  title: string;
  poster_path: string | null;
  vote_average: number;
  overview: string;
  release_date: string; // e.g. "2024-11-15"
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
}

export interface MovieDetail extends Movie {
  runtime: number;
  genres: { id: number; name: string }[];
  credits?: { cast: CastMember[] };
}

export async function getMovieById(id: string) {
  // append_to_response=credits pulls cast in the same request.
  const res = await fetch(
    `${BASE_URL}/movie/${id}?api_key=${API_KEY}&append_to_response=credits`,
  );
  if (!res.ok) {
    throw new Error("Failed to fetch movie details");
  }
  const data = (await res.json()) as MovieDetail;
  return data;
}

export interface MoviesResponse {
  results: Movie[];
  totalPages: number;
  totalResults: number;
}

export async function fetchMovies(query: string = "", page: number = 1): Promise<MoviesResponse> {
  const endpoint = query
    ? `${BASE_URL}/search/movie?api_key=${API_KEY}&query=${encodeURIComponent(query)}&page=${page}`
    : `${BASE_URL}/discover/movie?api_key=${API_KEY}&sort_by=popularity.desc&page=${page}`;
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error("Failed to fetch movies");
  const data = await res.json();
  return {
    results: data.results as Movie[],
    totalPages: data.total_pages as number,
    totalResults: data.total_results as number,
  };
}
