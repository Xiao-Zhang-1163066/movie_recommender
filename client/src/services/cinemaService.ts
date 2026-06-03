import type { Cinema } from "@/features/cinemas/types";

export async function getCinemas(): Promise<Cinema[]> {
  const res = await fetch("/api/cinemas");
  if (!res.ok) throw new Error("Failed to fetch cinemas");
  const data = await res.json();
  return data.data.cinemas;
}

export async function getCinema(slug: string): Promise<Cinema> {
  const res = await fetch(`/api/cinemas/${slug}`);
  if (!res.ok) throw new Error("Failed to fetch cinema");
  const data = await res.json();
  return data.data.cinema;
}
