import { useState, useEffect } from "react";
import { getCinema } from "@/services/cinemaService";
import type { Cinema } from "@/features/cinemas/types";

function useCinema(slug: string) {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [cinema, setCinema] = useState<Cinema | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    async function fetchCinema() {
      try {
        const data = await getCinema(slug);
        setCinema(data);
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
