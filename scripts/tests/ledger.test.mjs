import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalCwd = process.cwd();
const sandbox = await mkdtemp(join(tmpdir(), "pkm-ledger-test-"));
process.chdir(sandbox);

let failures = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) console.log(`✓ ${label}`);
  else {
    failures++;
    console.error(`✗ ${label}\n    attendu ${JSON.stringify(expected)}\n    obtenu  ${JSON.stringify(actual)}`);
  }
};

try {
  const { recordObservations, recordCrawl, relistSignature } = await import(`../lib/ledger.mjs?test=${Date.now()}`);
  const run1 = { runId: "run-1", date: "2026-08-12", observedAt: "2026-08-12T08:00:00.000Z" };
  const base = {
    source: "ebay",
    subject: "card:88a",
    id: "listing-1",
    title: "Darkrai GX 88a/147",
    price: 20,
    quantity: 2,
    currency: "EUR",
    language: "fr",
    condition: "Near Mint",
    sellerId: "seller",
    sellerScore: 100,
    sellerPct: 99.5,
    matching: "exact",
    integrity: "trusted",
    sellerTrust: "trusted",
    listingQuality: "trusted",
  };
  await recordObservations("test-set", [base], run1);
  await recordObservations("test-set", [base], run1);
  const run2 = { runId: "run-2", date: "2026-08-13", observedAt: "2026-08-13T08:00:00.000Z" };
  await recordObservations("test-set", [{ ...base, price: 18, quantity: 5 }], run2);
  await recordObservations("test-set", [{ ...base, id: "wrong", matching: "wrong", integrity: "high_risk" }], run2);
  await recordCrawl("test-set", {
    source: "ebay",
    subject: "card:99",
    captured: 0,
    stored: 0,
    totalAvailable: 0,
    complete: true,
  }, run2);

  const store = JSON.parse(await readFile(join(sandbox, "data", "ledger", "test-set.json"), "utf8"));
  const row = store.listings["ebay:listing-1"];
  check("retry du même run idempotent", row.history.length, 2);
  check("quantité historisée", row.history.map((event) => event.q), [2, 5]);
  check("langue et état historisés", [row.history[0].language, row.history[0].condition], ["fr", "Near Mint"]);
  check("identité d'annonce historisée", [row.history[0].title, row.history[0].seller_id], [base.title, base.sellerId]);
  check("prix courant et bornes cohérents", [row.price_last, row.price_min, row.price_max], [18, 18, 20]);
  check("mauvais matching non évalué comme fraude", store.listings["ebay:wrong"].integrity, "unassessed");
  check("relist même vendeur/titre détectable malgré un nouvel ID",
    relistSignature({ ...base, id: "new-id" }), relistSignature(base));

  const manifest = (await readFile(join(sandbox, "data", "ledger", "_manifest.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map(JSON.parse);
  check("crawl zéro enregistré", manifest[0].captured, 0);
  check("crawl zéro complet", manifest[0].complete, true);
} finally {
  process.chdir(originalCwd);
  await rm(sandbox, { recursive: true });
}

if (failures) process.exit(1);
console.log("\nLedger v4 : invariants tenus.");
