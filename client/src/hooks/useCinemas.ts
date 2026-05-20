import { useState, useEffect } from "react";
import type { Cinema } from "@/types/cinema";

function useCinemas() {
  // step 1: declare isLoading, data, error state
  const [isLoading, setIsLoading] = useState(true);
  const [cinemas, setCinemas] = useState<Cinema[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    // step 2: define an async fetchCinemas function
    //   - fetch from "/api/cinemas"
    //   - parse the JSON
    //   - set data to the cinemas array from the response
    //   - catch errors and set error state
    //   - set isLoading to false when done (hint: which block always runs?)
    async function fetchCinemas() {
      try {
        const response = await fetch("/api/cinemas");
        if (!response.ok) {
          const body = await response.json();
          setError(body.message ?? "Failed to fetch cinemas");
          return;
        }
        const data = await response.json();
        setCinemas(data.data.cinemas);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch cinemas",
        );
      } finally {
        setIsLoading(false);
      }
    }

    // step 3: call fetchCinemas
    fetchCinemas();
  }, []);

  // step 4: return isLoading, data, error
  return { isFetching: isLoading, cinemas, error };
}

export default useCinemas;
