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
  if (store.schema_version !== 4) invalidSchema++;
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
check("tous les stores sont en schéma v4", invalidSchema, 0);
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
