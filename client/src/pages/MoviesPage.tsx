import SectionHeading from "@/components/SectionHeading";
import InTheaterMovieGrid from "@/features/movies/InTheaterMovieGrid";
import DiscoverMovieGrid from "@/features/movies/DiscoverMovieGrid";

function MoviesPage() {
  return (
    <div className="px-4 md:px-10 py-10">
      <SectionHeading title="In Theatres Now" />
      <InTheaterMovieGrid />
      <SectionHeading title="Discover" />
      <DiscoverMovieGrid />
    </div>
  );
}

export default MoviesPage;
