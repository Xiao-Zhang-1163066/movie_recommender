import { useState, useEffect } from "react";
import type { Cinema } from "@/features/cinemas/types";

function useCinema(slug: string) {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [cinema, setCinema] = useState<Cinema | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    async function fetchCinema() {
      try {
        const response = await fetch(`/api/cinemas/${slug}`);
        if (!response.ok) {
          const body = await response.json();
          setError(body.message ?? "Failed to fetch cinema");
          return;
        }
        const data = await response.json();
        setCinema(data.data.cinema);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch cinema",
        );
      } finally {
        setIsLoading(false);
      }
    }

    fetchCinema();
  }, [slug]);

  return { isFetching: isLoading, cinema, error };
}

export default useCinema;
