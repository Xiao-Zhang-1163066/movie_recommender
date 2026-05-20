import CinemaCard from "@/components/CinemaCard";
import useCinemas from "@/hooks/useCinemas.ts";

function CinemasPage() {
  const { isFetching, cinemas, error } = useCinemas();
  if (isFetching) {
    return <div className="p-6">Loading...</div>;
  }
  if (error) {
    return <div className="p-6 text-red-500">Error: {error}</div>;
  }
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Cinemas</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cinemas.map((cinema) => (
          <CinemaCard key={cinema.id} cinema={cinema} />
        ))}
      </div>
    </div>
  );
}

export default CinemasPage;
