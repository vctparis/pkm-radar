import { appendSnapshot, normalizePriceGuide, validateProductCatalog, validateProductMap } from "../lib/cardmarket-public.mjs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SETS } from "../lib/sets.mjs";

let failures = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) console.log(`✓ ${label}`);
  else {
    failures++;
    console.error(`✗ ${label}\n    attendu ${JSON.stringify(expected)}\n    obtenu  ${JSON.stringify(actual)}`);
  }
};
const throws = (label, callback, pattern) => {
  try {
    callback();
    failures++;
    console.error(`✗ ${label}\n    aucune erreur levée`);
  } catch (error) {
    check(label, pattern.test(error.message), true);
  }
};

const mapping = {
  schemaVersion: 1,
  gameId: 6,
  products: [{ setId: "fixture", idProduct: 42, name: "Fixture Booster", category: "Pokémon Booster" }],
};
validateProductMap(mapping, new Set(["fixture"]));
check("mapping revu accepté", true, true);
const productionMapping = JSON.parse(await readFile(join(process.cwd(), "data", "cardmarket", "product-map.json"), "utf8"));
validateProductMap(productionMapping, new Set(SETS.map((set) => set.id)));
check("chaque set suivi possède exactement un booster Cardmarket revu", productionMapping.products.length, SETS.length);
throws(
  "un produit ne peut pas servir à deux sets",
  () => validateProductMap({ ...mapping, products: [...mapping.products, { ...mapping.products[0], setId: "other" }] }),
  /idProduct Cardmarket dupliqué/,
);

const snapshot = normalizePriceGuide(
  {
    version: 1,
    createdAt: "2026-08-12T02:43:55+0200",
    priceGuides: [{ idProduct: 42, avg: 12.345, low: 8, trend: 13.456, avg1: null, avg7: null, avg30: null }],
  },
  mapping,
  { rawSha256: "abc", etag: '"etag"', fetchedAt: "2026-08-12T03:00:00.000Z" },
);
const catalog = validateProductCatalog(
  { version: 1, createdAt: "2026-08-12T11:24:42+0200", products: [{ idProduct: 42, name: "Fixture Booster", categoryName: "Pokémon Booster" }] },
  mapping,
);
check("catalogue officiel confirme l'identité et la catégorie", [catalog.matched, catalog.nameChanges.length], [1, 0]);
throws(
  "un mapping vers un produit non-booster est bloqué",
  () => validateProductCatalog({ version: 1, createdAt: "2026-08-12T11:24:42+0200", products: [{ idProduct: 42, name: "Fixture", categoryName: "Pokémon Box" }] }, mapping),
  /catégorie Cardmarket inattendue/,
);
check("date source Cardmarket normalisée", [snapshot.snapshotDate, snapshot.sourceCreatedAt], ["2026-08-12", "2026-08-12T00:43:55.000Z"]);
check(
  "prix préservés sans transformer les nulls en zéros",
  [snapshot.observations[0].avg, snapshot.observations[0].trend, snapshot.observations[0].avg7],
  [12.35, 13.46, null],
);

const first = appendSnapshot(null, snapshot);
check("snapshot append-only inséré", [first.inserted, first.unchanged, first.history.observations.length], [1, 0, 1]);
const replay = appendSnapshot(first.history, snapshot);
check("même fichier rejouable sans doublon", [replay.inserted, replay.unchanged, replay.history.observations.length], [0, 1, 1]);
throws(
  "une réécriture du même jour est refusée",
  () => appendSnapshot(first.history, { ...snapshot, observations: [{ ...snapshot.observations[0], trend: 99 }] }),
  /réécriture historique refusée/,
);
throws(
  "un produit mappé absent bloque l’import",
  () => normalizePriceGuide({ version: 1, createdAt: "2026-08-12T02:43:55+0200", priceGuides: [] }, mapping),
  /produits absents/,
);

if (failures) process.exit(1);
console.log("\nCardmarket public : invariants tenus.");
