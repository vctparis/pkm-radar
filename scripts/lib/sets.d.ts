export const SETS: {
  id: string;
  name: string;
  nameEN?: string;
  era: string;
  jpOnly?: boolean;
  releaseDate?: string;
  /** Fin d'impression estimée (année), "ongoing" ou "unknown" — jamais officielle. */
  printEnd?: number | "ongoing" | "unknown";
  [key: string]: unknown;
}[];
