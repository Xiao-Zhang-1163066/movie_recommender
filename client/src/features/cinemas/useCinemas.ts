import { useQuery } from "@tanstack/react-query";
import { getCinemas } from "@/services/cinemaService";
import type { Cinema } from "./types";

export function useCinemas() {
  const { data: cinemas = [], isLoading, error } = useQuery<Cinema[]>({
    queryKey: ["cinemas"],
    queryFn: getCinemas,
  });
  return { cinemas, isLoading, error };
}
