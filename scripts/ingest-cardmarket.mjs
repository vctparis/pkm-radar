import { ingestCardmarket } from "./lib/cardmarket-public.mjs";

const result = await ingestCardmarket(process.cwd());
console.log(
  result.status === "unchanged"
    ? `Cardmarket : fichier inchangé · ${result.mapped} produits suivis`
    : `Cardmarket : ${result.inserted} observations ajoutées · ${result.mapped} boosters appariés · ${result.snapshotDate}`,
);
