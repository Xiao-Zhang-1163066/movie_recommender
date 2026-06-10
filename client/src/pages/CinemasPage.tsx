import CinemaGrid from "@/features/cinemas/CinemaGrid";

function CinemasPage() {
  return (
    <div className="px-4 md:px-10 py-10">
      <h1
        className="text-3xl font-black mb-8"
        style={{ letterSpacing: "-0.03em" }}
      >
        Cinemas
      </h1>
      <CinemaGrid />
    </div>
  );
}

export default CinemasPage;
