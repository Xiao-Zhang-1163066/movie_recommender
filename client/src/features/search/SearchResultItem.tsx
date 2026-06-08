import { IMG_URL, type Movie } from "@/api/tmdb";

interface Props {
  movie: Movie;
  onClick: () => void;
}

function SearchResultItem({ movie, onClick }: Props) {
  const year = movie.release_date?.slice(0, 4) ?? "—";

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2 hover:bg-white/10 cursor-pointer transition"
    >
      {movie.poster_path ? (
        <img
          src={`${IMG_URL}${movie.poster_path}`}
          alt={movie.title}
          className="w-12 h-18 object-cover rounded flex-shrink-0"
        />
      ) : (
        <div className="w-12 h-18 bg-muted rounded flex-shrink-0" />
      )}
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium truncate">{movie.title}</span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{year}</span>
          <span className="font-bold" style={{ color: "var(--lime)" }}>
            ★ {movie.vote_average.toFixed(1)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default SearchResultItem;
