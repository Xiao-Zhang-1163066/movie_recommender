import CinemaCard from "@/components/CinemaCard";
import useCinemas from "@/hooks/useCinemas.ts";

function CinemasPage() {
  const { isFetching, cinemas, error } = useCinemas();
  if (isFetching) {
    return (
      <div
        className="flex items-center justify-center min-h-[60vh] text-sm"
        style={{ color: "var(--text-2)" }}
      >
        Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-sm text-destructive">
        {error}
      </div>
    );
  }
  return (
    <div className="px-10 py-10">
      <h1
        className="text-3xl font-black mb-8"
        style={{ letterSpacing: "-0.03em" }}
      >
        Cinemas
      </h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cinemas.map((cinema) => (
          <CinemaCard key={cinema.id} cinema={cinema} />
        ))}
      </div>
    </div>
  );
}

export default CinemasPage;
