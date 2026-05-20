export interface Cinema {
  // fill in the fields from the Cinema model
  // id, name, slug, address, suburb, latitude, longitude, websiteUrl, bookingUrl;
  id: string;
  name: string;
  slug: string;
  address: string;
  suburb: string;
  latitude: number;
  longitude: number;
  websiteUrl: string;
  bookingUrl?: string;
  sessions: Session[];
}

export interface Session {
  id: string;
  startsAt: string;
  bookingUrl?: string;
  movie: {
    id: string;
    title: string;
    tmdbId: number;
    posterUrl: string;
  };
}
