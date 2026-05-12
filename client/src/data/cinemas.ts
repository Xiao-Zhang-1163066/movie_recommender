export interface Cinema {
  id: string;
  name: string;
  suburb: string;
  screens: number;
}

export const cinemas: Cinema[] = [
  { id: "c1", name: "Hoyts Riccarton", suburb: "Riccarton", screens: 12 },
  {
    id: "c2",
    name: "Reading Cinemas The Palms",
    suburb: "Shirley",
    screens: 8,
  },
  { id: "c3", name: "Alice Cinema", suburb: "Central City", screens: 2 },
  { id: "c4", name: "Hollywood Cinema", suburb: "Sumner", screens: 3 },
];
