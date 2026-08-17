import { readFile, readdir } from "node:fs/promises";
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
const publicData = JSON.parse(await readFile(join(root, "public", "radar-data.json"), "utf8"));
let publicObservations = 0;
const visit = (value) => {
  if (!value || typeof value !== "object") return;
  if (Object.hasOwn(value, "observations")) publicObservations += value.observations?.length ?? 1;
  for (const child of Object.values(value)) visit(child);
};
visit(publicData);
check("aucune observation brute dans l'artefact public", publicObservations, 0);

const dropV2 = JSON.parse(await readFile(join(root, "public", "drop-rate-v2.json"), "utf8"));
let invalidDropV2 = 0;
let unreconciledDropV2 = 0;
let leakingDropV2 = 0;
let invalidDropV2Coverage = 0;
let invalidDropV2Conflicts = 0;
let invalidBoosterHistory = 0;
for (const set of dropV2.sets ?? []) {
  if (!(set.coverage >= 0 && set.coverage <= 1) || set.grossQuick > set.grossCentral || set.netCentralLo > set.netCentralHi) {
    invalidDropV2++;
  }
  const classTotal = set.classes.reduce((sum, row) => sum + row.centralContribution, 0);
  if (Math.abs(classTotal - set.grossCentral) > 0.08) unreconciledDropV2++;
  if (Object.hasOwn(set, "listings") || Object.hasOwn(set, "history")) leakingDropV2++;
  const coverageTotal = Object.values(set.coverageBreakdown ?? {}).reduce((sum, value) => sum + value, 0);
  if (Math.abs(coverageTotal - 1) > 0.012) invalidDropV2Coverage++;
  if (set.blockingConflicts > set.conflicts || set.conflictDetails?.length !== set.conflicts) invalidDropV2Conflicts++;
  const marketHistory = set.boosterMarketHistory;
  const sortedDates = marketHistory?.observations?.map((row) => row.date) ?? [];
  if (
    marketHistory?.windowDays !== 365 ||
    new Set(sortedDates).size !== sortedDates.length ||
    sortedDates.some((date, index) => index > 0 && date < sortedDates[index - 1]) ||
    sortedDates.some((date) => date < marketHistory.from || date > marketHistory.to)
  ) invalidBoosterHistory++;
}
check("drop v2 porte une version de modèle", typeof dropV2.modelVersion, "string");
check("drop v2 : domaines métriques valides", invalidDropV2, 0);
check("drop v2 : classes réconciliées avec la valeur brute", unreconciledDropV2, 0);
check("drop v2 ne publie aucune annonce brute", leakingDropV2, 0);
check("drop v2 : composition de couverture réconciliée", invalidDropV2Coverage, 0);
check("drop v2 : conflits détaillés réconciliés", invalidDropV2Conflicts, 0);
check("drop v2 : historique booster borné, trié et unique", invalidBoosterHistory, 0);

const tracker = JSON.parse(await readFile(join(root, "public", "card-tracker-index.json"), "utf8"));
const cardsIndex = JSON.parse(await readFile(join(root, "public", "cards-index.json"), "utf8"));
check("tracker de cartes porte une version de modèle", typeof tracker.modelVersion, "string");
check("tracker et index ont le même grain carte", tracker.cards.length, cardsIndex.cards.length);

const pressure = JSON.parse(await readFile(join(root, "public", "market-pressure.json"), "utf8"));
let leakingPressure = 0;
let mixedPressureSources = 0;
let invalidPressureDates = 0;
for (const set of pressure.sets ?? []) {
  for (const [sourceId, series] of Object.entries(set.sources ?? {})) {
    if (!series) continue;
    if (series.source !== sourceId) mixedPressureSources++;
    const dates = series.history.map((row) => row.date);
    if (new Set(dates).size !== dates.length || dates.some((date, index) => index > 0 && date < dates[index - 1])) invalidPressureDates++;
    for (const snapshot of series.history) {
      if (Object.hasOwn(snapshot, "listings") || Object.hasOwn(snapshot, "runId") || Object.hasOwn(snapshot, "seller_id")) leakingPressure++;
    }
  }
}
check("pression du carnet porte une version de modèle", typeof pressure.modelVersion, "string");
check("pression du carnet garde les sources séparées", mixedPressureSources, 0);
check("pression du carnet : journées triées et uniques", invalidPressureDates, 0);
check("pression du carnet ne publie aucune annonce brute", leakingPressure, 0);
check("pression du carnet ne fabrique pas d'acheteurs", pressure.methodology.buyerCountAvailable, false);

const cardmarketMap = JSON.parse(await readFile(join(root, "data", "cardmarket", "product-map.json"), "utf8"));
const cardmarketHistory = JSON.parse(await readFile(join(root, "data", "cardmarket", "history.json"), "utf8"));
const cardmarketKeys = cardmarketHistory.observations.map((row) => `${row.date}:${row.idProduct}`);
check("historique Cardmarket en schéma append-only v1", cardmarketHistory.schemaVersion, 1);
check("historique Cardmarket sans doublon jour-produit", new Set(cardmarketKeys).size, cardmarketKeys.length);
check("chaque observation Cardmarket vient d'un produit mappé", cardmarketHistory.observations.filter((row) => !cardmarketMap.products.some((product) => product.idProduct === row.idProduct && product.setId === row.setId)).length, 0);
check("chaque observation Cardmarket garde l'empreinte brute", cardmarketHistory.observations.filter((row) => !/^[a-f0-9]{64}$/.test(row.rawSha256 ?? "")).length, 0);

const ledgerDir = join(root, "data", "ledger");
const files = (await readdir(ledgerDir)).filter((file) => file.endsWith(".json"));
let invalidSchema = 0;
let missingHistory = 0;
let inconsistentSeen = 0;
let wrongAssessed = 0;
let compactGradedExact = 0;
let missingRelistSignature = 0;
for (const file of files) {
  const store = JSON.parse(await readFile(join(ledgerDir, file), "utf8"));
  if (store.schema_version !== 5) invalidSchema++;
  for (const row of Object.values(store.listings ?? {})) {
    if (!Array.isArray(row.history) || !row.history.length) missingHistory++;
    if (row.times_seen !== row.history?.length) inconsistentSeen++;
    if (row.matching === "wrong" && row.integrity !== "unassessed") wrongAssessed++;
    if (row.source === "ebay" && row.matching === "exact" && /\b(?:psa|pca|bgs|cgc)\s*[\d.,]+|grading\s*[\d.,]+/i.test(row.title ?? "")) {
      compactGradedExact++;
    }
    if (row.seller_id && row.title && !row.relist_signature) missingRelistSignature++;
  }
}
check("tous les stores sont en schéma v5", invalidSchema, 0);
check("aucun historique manquant", missingHistory, 0);
check("times_seen correspond aux événements", inconsistentSeen, 0);
check("mauvais matching laissé non évalué", wrongAssessed, 0);
check("aucun grading compact dans les cartes brutes exactes", compactGradedExact, 0);
check("signatures de relisting disponibles", missingRelistSignature, 0);

const manifestLines = (await readFile(join(ledgerDir, "_manifest.jsonl"), "utf8")).trim().split("\n");
let invalidManifest = 0;
for (const line of manifestLines) {
  try {
    JSON.parse(line);
  } catch {
    invalidManifest++;
  }
}
check("manifeste JSONL intégralement lisible", invalidManifest, 0);

if (failures) process.exit(1);
console.log("\nArtefacts data : invariants tenus.");
