import {
  compareSnapshots,
  computeMarketPressure,
  listingsByRun,
  parseCompleteCrawls,
  pressureRelistSignature,
} from "../lib/market-pressure.mjs";

let failures = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) console.log(`✓ ${label}`);
  else {
    failures++;
    console.error(`✗ ${label}\n    attendu ${JSON.stringify(expected)}\n    obtenu  ${JSON.stringify(actual)}`);
  }
};

const event = (runId, date, price, quantity, overrides = {}) => ({
  d: date,
  run_id: runId,
  p: price,
  q: quantity,
  subject: "sealed",
  title: "Booster Test Set",
  language: null,
  condition: "1000",
  seller_id: "seller-a",
  matching: "exact",
  integrity: "trusted",
  ...overrides,
});

const row = (source, history, overrides = {}) => ({
  source,
  currency: "EUR",
  graded: false,
  on_vacation: false,
  history,
  ...overrides,
});

const store = {
  schema_version: 5,
  listings: {
    "ebay:a": row("ebay", [
      event("run-1", "2026-08-12", 10, 5),
      { d: "2026-08-13", run_id: "run-2", p: 11, q: 3 },
    ]),
    "ebay:b": row("ebay", [event("run-1", "2026-08-12", 12, 1, { seller_id: "seller-b" })]),
    "ebay:c": row("ebay", [event("run-2", "2026-08-13", 12.5, 1, { seller_id: "seller-b" })]),
    "ebay:exit": row("ebay", [event("run-1", "2026-08-12", 14, 1, { title: "Autre booster", seller_id: "seller-c" })]),
    "ebay:new": row("ebay", [event("run-2", "2026-08-13", 13, 2, { title: "Nouveau booster", seller_id: "seller-d" })]),
    // Même run global, autre source : ne doit jamais contaminer eBay.
    "cardtrader:en": row("cardtrader", [event("run-2", "2026-08-13", 8, 4, { language: "en", seller_id: "ct-en" })]),
    "cardtrader:it": row("cardtrader", [event("run-2", "2026-08-13", 6, 9, { language: "it", seller_id: "ct-it" })]),
    // Capturée mais écartée du carnet retenu.
    "ebay:risk": row("ebay", [event("run-2", "2026-08-13", 2, 1, { integrity: "high_risk", seller_id: "risk" })]),
  },
};

const crawl = (run_id, date, source, overrides = {}) => JSON.stringify({
  type: "crawl",
  run_id,
  date,
  observed_at: `${date}T12:00:00.000Z`,
  set: "test-set",
  source,
  subject: "sealed",
  status: "ok",
  captured: 10,
  total_available: 10,
  pages: 1,
  complete: true,
  ...overrides,
});

const manifestText = [
  crawl("run-1", "2026-08-12", "ebay"),
  crawl("ignored-incomplete", "2026-08-13", "ebay", { complete: false, observed_at: "2026-08-13T13:00:00.000Z" }),
  crawl("run-2-old", "2026-08-13", "ebay", { observed_at: "2026-08-13T11:00:00.000Z" }),
  crawl("run-2", "2026-08-13", "ebay"),
  crawl("run-2", "2026-08-13", "cardtrader"),
].join("\n");

const crawls = parseCompleteCrawls(manifestText);
check("une seule photo complète, la plus récente, par jour et source", crawls.map((row) => row.run_id), ["run-1", "run-2", "run-2"]);

const ebayRuns = listingsByRun(store, "ebay", ["run-1", "run-2"]);
check("sources séparées même quand le run id est partagé", ebayRuns.get("run-2").size, 3);
check("annonce à haut risque absente du carnet retenu", ebayRuns.get("run-2").has("ebay:risk"), false);

const previous = { date: "2026-08-12", activeListings: 3, floor10: 10.4, medianAsk: 12, listings: ebayRuns.get("run-1") };
const current = { date: "2026-08-13", activeListings: 3, floor10: 11.3, medianAsk: 12.5, listings: ebayRuns.get("run-2") };
const flow = compareSnapshots(previous, current);
check("relisting apparié une fois, sans faux exit/new", [flow.likelyRelists, flow.adjustedExits, flow.adjustedNewListings], [1, 1, 1]);
check("deux états CardTrader ne partagent pas une signature de relisting",
  pressureRelistSignature({ source: "cardtrader", subject: "sealed", seller_id: "s", title: "Booster", language: "en", condition: "Near Mint" }) ===
    pressureRelistSignature({ source: "cardtrader", subject: "sealed", seller_id: "s", title: "Booster", language: "en", condition: "Slightly Played" }),
  false);
check("baisse de quantité comptée comme sortie observable", flow.quantityDecreaseUnits, 2);
check("sortie d'annonce jamais nommée vente", Object.hasOwn(flow, "sales"), false);

const artifact = computeMarketPressure({
  stores: { "test-set": store },
  manifestText,
  sets: [{ id: "test-set", name: "Test Set", era: "Test", jpOnly: false }],
  languageBySet: { "test-set": "en" },
  generatedAt: "2026-08-13T14:00:00.000Z",
});
const testSet = artifact.sets[0];
check("CardTrader limité à la langue cotée", [testSet.sources.cardtrader.language, testSet.sources.cardtrader.latest.activeListings], ["en", 1]);
check("le verdict reste bloqué avec deux jours", testSet.sources.ebay.verdict.status, "collecting");
check("aucun nombre d'acheteurs fabriqué", artifact.methodology.buyerCountAvailable, false);
check("aucune annonce brute dans l'artefact", Object.hasOwn(testSet.sources.ebay.latest, "listings"), false);

// À 14 journées, trois signaux réellement convergents débloquent seulement un
// verdict PROBABLE : sorties > entrées, stock en baisse, p10 en hausse.
const dates14 = Array.from({ length: 14 }, (_, index) => `2026-09-${String(index + 1).padStart(2, "0")}`);
const trendListings = {};
for (let listingIndex = 0; listingIndex < 20; listingIndex++) {
  const activeDays = listingIndex < 8 ? 14 : Math.max(1, 13 - (listingIndex - 8));
  trendListings[`ebay:${listingIndex}`] = row("ebay", dates14.slice(0, activeDays).map((day, dayIndex) =>
    dayIndex === 0
      ? event(`trend-${dayIndex}`, day, 10 + listingIndex * 0.02, undefined, { seller_id: `seller-${listingIndex}` })
      : { d: day, run_id: `trend-${dayIndex}`, p: 10 + dayIndex * 0.2 + listingIndex * 0.02 },
  ));
}
const trendManifest = dates14.map((day, index) => crawl(`trend-${index}`, day, "ebay", { observed_at: `${day}T12:00:00.000Z` })).join("\n");
const matureArtifact = computeMarketPressure({
  stores: { "test-set": { schema_version: 5, listings: trendListings } },
  manifestText: trendManifest,
  sets: [{ id: "test-set", name: "Test Set", era: "Test", jpOnly: false }],
  generatedAt: "2026-09-14T14:00:00.000Z",
});
check("14 journées et trois signaux convergents débloquent un verdict probable", matureArtifact.sets[0].sources.ebay.verdict.status, "buyer");
check("le premier verdict reste de confiance faible", matureArtifact.sets[0].sources.ebay.verdict.confidence, "faible");

if (failures) process.exit(1);
console.log("\nPression du carnet : invariants tenus.");
