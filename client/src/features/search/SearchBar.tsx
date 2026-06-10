import { SearchIcon, X } from "lucide-react";
import { useSearchMovies } from "./useSearchMovies";
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useDebounce } from "use-debounce";
import SearchResultItem from "./SearchResultItem";

function SearchBar() {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm] = useDebounce(searchTerm, 300);
  const { movies, isLoading, error } = useSearchMovies(debouncedSearchTerm);
  const navigate = useNavigate();
  const showDropdown = searchTerm.trim().length > 0;
  const preview = movies.slice(0, 7);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSearchTerm("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleShowAll() {
    navigate(`/search?q=${encodeURIComponent(searchTerm.trim())}`);
    setSearchTerm("");
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleShowAll();
        }}
      >
        <SearchIcon
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
        <input
          type="text"
          placeholder="Search movies..."
          className="w-full pl-9 pr-9 py-2 rounded-full bg-secondary text-sm focus:outline-none focus:ring-2 focus:ring-primary transition"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </form>

      {showDropdown && (
        <div className="absolute mt-1 py-2 w-full bg-secondary rounded-md shadow-lg z-10">
          {isLoading && (
            <div className="px-4 py-2 text-sm text-muted-foreground">
              Loading...
            </div>
          )}
          {error && (
            <div className="px-4 py-2 text-sm text-destructive">
              {error instanceof Error ? error.message : "An error occurred"}
            </div>
          )}
          {!isLoading &&
            !error &&
            preview.map((movie) => (
              <SearchResultItem
                key={movie.id}
                movie={movie}
                onClick={() => navigate(`/movie/${movie.id}`)}
              />
            ))}
          {!isLoading && !error && movies.length > 0 && (
            <button
              onClick={handleShowAll}
              className="w-full px-4 py-2 text-sm text-primary cursor-pointer hover:bg-white/10 border-t border-border transition text-left"
            >
              Show all results for "{searchTerm}"
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default SearchBar;
