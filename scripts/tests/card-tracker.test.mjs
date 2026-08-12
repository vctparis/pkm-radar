import { readFile } from "node:fs/promises";
import { join } from "node:path";

let failures = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) console.log(`✓ ${label}`);
  else {
    failures++;
    console.error(`✗ ${label}\n    attendu ${JSON.stringify(expected)}\n    obtenu  ${JSON.stringify(actual)}`);
  }
};

const root = process.cwd();
const artifact = JSON.parse(await readFile(join(root, "public", "card-tracker-index.json"), "utf8"));
// Les marchés vivent dans les fichiers de détail par set.
const { readdir } = await import("node:fs/promises");
const detailFiles = (await readdir(join(root, "public", "card-tracker"))).filter((f) => f.endsWith(".json"));
artifact.markets = {};
for (const file of detailFiles) {
  const detail = JSON.parse(await readFile(join(root, "public", "card-tracker", file), "utf8"));
  Object.assign(artifact.markets, detail.markets);
}
check("index léger : ni image ni preuves dans le fichier de recherche",
  artifact.cards.filter((card) => "image" in card || "reference" in card).length, 0);
check("confiance au vocabulaire du site (élevée, pas forte)",
  Object.values(artifact.markets).some((m) => [m.rawFR, m.ebayFR, m.cardTraderFR].filter(Boolean).some((s) => s.confidence === "forte")), false);
const index = JSON.parse(await readFile(join(root, "public", "cards-index.json"), "utf8"));
const gradeStore = JSON.parse(await readFile(join(root, "data", "manual-card-grades.json"), "utf8"));
check("tracker porte une version", typeof artifact.modelVersion, "string");
check("index et tracker ont le même nombre de cartes", artifact.cards.length, index.cards.length);
check("chaque carte a une identité canonique", artifact.cards.filter((card) => !card.id || !card.setId || !card.number || !card.nameEN).length, 0);
check("Ectoplasma et Gengar coexistent comme alias", artifact.cards.some((card) => card.nameFR?.startsWith("Ectoplasma") && card.nameEN.startsWith("Gengar")), true);
check("FST est un alias du set Poing de Fusion", artifact.sets["fusion-strike"].aliases.some((alias) => alias.toLowerCase() === "fst"), true);
check("magasin PSA carte-niveau versionné", gradeStore.schemaVersion, 1);

let invalidMarkets = 0;
let leakedSellerIds = 0;
let misleadingPriceTypes = 0;
for (const market of Object.values(artifact.markets ?? {})) {
  for (const summary of [market.rawFR, market.ebayFR, market.cardTraderFR].filter(Boolean)) {
    if (!(summary.median > 0) || !(summary.floor10 > 0) || summary.floor10 > summary.median || summary.offers < summary.sellers) invalidMarkets++;
    if (summary.priceType !== "active_ask" || summary.language !== "fr" || summary.conditionScope !== "EX+") misleadingPriceTypes++;
    for (const row of summary.evidence ?? []) if (Object.hasOwn(row, "sellerId") || Object.hasOwn(row, "seller_id")) leakedSellerIds++;
  }
}
check("résumés de marché cohérents", invalidMarkets, 0);
check("aucun prix demandé présenté comme vente", misleadingPriceTypes, 0);
check("aucun identifiant vendeur publié", leakedSellerIds, 0);

if (failures) process.exit(1);
console.log("\nTracker cartes : invariants tenus.");
