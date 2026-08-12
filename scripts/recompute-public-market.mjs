// Recalcule les agrégats eBay publics depuis l'état v4 du ledger. Aucun brut
// n'est copié vers public/ : seules les statistiques et URL de référence sortent.

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { preliminaryReference } from "./lib/integrity.mjs";
import { normalizeCollectorNumber } from "./lib/identifiers.mjs";

const ROOT = process.cwd();
const PUBLIC_PATH = join(ROOT, "public", "radar-data.json");

const quantile = (values, q) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lo = Math.floor(position);
  const hi = Math.ceil(position);
  return sorted[lo] * (1 - (position - lo)) + sorted[hi] * (position - lo);
};

function summarize(rows) {
  const eligible = rows.filter((row) => row.matching === "exact" && row.price_last > 0);
  const retained = eligible.filter((row) => row.integrity !== "high_risk");
  const sorted = [...retained].sort((a, b) => a.price_last - b.price_last);
  const prices = sorted.map((row) => row.price_last);
  const floor10 = quantile(prices, 0.1);
  const median = quantile(prices, 0.5);
  const p10Row = floor10 == null
    ? null
    : sorted.reduce((best, row) => Math.abs(row.price_last - floor10) < Math.abs(best.price_last - floor10) ? row : best);
  const reference = preliminaryReference(eligible.map((row) => ({
    price: row.price_last,
    title: row.title,
    sellerId: row.seller_id,
    sellerScore: row.seller_feedback_score,
  })));
  return {
    price: sorted[0]?.price_last ?? null,
    priceUrl: sorted[0]?.url ?? null,
    floor10: floor10 == null ? null : Number(floor10.toFixed(2)),
    floor10Url: p10Row?.url ?? null,
    median: median == null ? null : Number(median.toFixed(2)),
    offers: retained.length,
    sellers: new Set(retained.map((row) => row.seller_id).filter(Boolean)).size,
    observedFloor: eligible.length ? Math.min(...eligible.map((row) => row.price_last)) : null,
    trusted: eligible.filter((row) => row.integrity === "trusted").length,
    review: eligible.filter((row) => row.integrity === "review").length,
    quarantined: eligible.filter((row) => row.integrity === "high_risk").length,
    matched: eligible.length,
    sampleSufficient: retained.length >= 10,
    referenceBasis: reference.basis,
  };
}

function applySummary(quote, rows) {
  if (!quote) return;
  const operational = {
    scanned: quote.scanned,
    totalAvailable: quote.totalAvailable,
    complete: quote.complete,
    pages: quote.pages,
    scope: quote.scope,
  };
  Object.assign(quote, summarize(rows), operational);
  delete quote.observations;
}

const data = JSON.parse(await readFile(PUBLIC_PATH, "utf8"));
for (const set of data.sets) {
  const store = JSON.parse(await readFile(join(ROOT, "data", "ledger", `${set.id}.json`), "utf8"));
  const ebay = Object.values(store.listings ?? {}).filter((row) => row.source === "ebay");
  applySummary(set.boosterFR, ebay.filter((row) => row.subject === "sealed"));
  for (const pick of set.picks ?? []) {
    const number = normalizeCollectorNumber(pick.number);
    applySummary(pick.marketFR, ebay.filter((row) => row.subject === `card:${number}`));
  }
}
await writeFile(PUBLIC_PATH, `${JSON.stringify(data, null, 2)}\n`);
console.log("Agrégats publics eBay recalculés depuis le ledger v4.");
