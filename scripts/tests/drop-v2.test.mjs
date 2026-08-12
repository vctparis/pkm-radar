import { buildBoosterMarketHistory, buildDropV2Set, summarizeFreshPullMarket } from "../lib/drop-v2.mjs";

let failures = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) console.log(`✓ ${label}`);
  else {
    failures++;
    console.error(`✗ ${label}\n    attendu ${JSON.stringify(expected)}\n    obtenu  ${JSON.stringify(actual)}`);
  }
};

const generatedAt = "2026-08-12T13:00:00.000Z";
const listing = (key, seller, price, condition, extra = {}) => ({
  key,
  row: {
    source: "cardtrader",
    language: "fr",
    subject: "card:1",
    matching: "exact",
    integrity: "unassessed",
    graded: false,
    on_vacation: false,
    price_last: price,
    seller_id: seller,
    condition,
    last_seen: "2026-08-12",
    ...extra,
  },
});

const marketRows = [
  listing("a1", "a", 20, "Near Mint"),
  listing("a2", "a", 25, "Near Mint"), // même vendeur : ne surpondère pas
  listing("b", "b", 10, "Slightly Played"),
  listing("c", "c", 15, "Near Mint"),
  listing("d", "d", 12, "Slightly Played"),
  listing("played", "e", 1, "Moderately Played"),
  listing("graded", "f", 2, "Near Mint", { graded: true }),
  listing("old", "g", 3, "Near Mint", { last_seen: "2026-08-11" }),
];

const market = summarizeFreshPullMarket(marketRows, generatedAt);
check("EX+ retient NM et Slightly Played, jamais MP", market.conditionMix, { nearMint: 3, slightlyPlayed: 2, ebayFR: 0 });
check("prix au grain vendeur", [market.offers, market.sellers, market.median, market.floor10], [5, 4, 13.5, 10.6]);
check("marché assez profond et frais", [market.adequate, market.ageDays], [true, 0]);
// ---- Doctrine de langue : FR uniquement, deux sources ----
check(
  "CardTrader hors-FR : exclue de la cotation",
  summarizeFreshPullMarket([listing("en1", "x", 5, "Near Mint", { language: "en" }), listing("en2", "y", 6, "Near Mint", { language: "en" })], generatedAt),
  null,
);
const withEbay = summarizeFreshPullMarket(
  [
    ...marketRows,
    listing("e1", "ebay-v1", 18, null, { source: "ebay", language: null }),
    listing("e2", "ebay-v2", 22, null, { source: "ebay", language: null }),
  ],
  generatedAt,
);
check("eBay.fr compte sans condition structurée (état sous EX déjà écarté au matching)",
  [withEbay.sellers, withEbay.conditionMix.ebayFR], [6, 2]);
const crossSourceHomonym = summarizeFreshPullMarket(
  [...marketRows, listing("e-homonym", "a", 18, null, { source: "ebay", language: null })],
  generatedAt,
);
check("un même identifiant vendeur sur deux sources reste deux voix", crossSourceHomonym.sellers, 5);
check(
  "manifeste par source : la source sans crawl valide n'admet rien",
  summarizeFreshPullMarket(
    [listing("e1", "ebay-v1", 18, null, { source: "ebay", language: null })],
    generatedAt,
    { ebay: { status: "error", complete: false, captured: 0, date: "2026-08-12" } },
  ),
  null,
);
check(
  "crawl complet à zéro : aucune ancienne annonce ne redevient active",
  summarizeFreshPullMarket(marketRows, generatedAt, { status: "ok", complete: true, captured: 0, date: "2026-08-12" }),
  null,
);
check(
  "crawl incomplet : snapshot précédent non réutilisé",
  summarizeFreshPullMarket(marketRows, generatedAt, { status: "ok", complete: false, captured: 5, date: "2026-08-12" }),
  null,
);

const set = {
  id: "fixture",
  name: "Fixture",
  era: "Écarlate et Violet",
  opening: {
    mode: "booster",
    boosterPrice: 20,
    netLo: 8.7,
    netHi: 8.7,
    evCoverage: [{ number: "001", name: "Carte test", rarity: "Rare", share: 1, referenceGross: 10 }],
    evCoverageTruncated: false,
  },
  dropRates: {
    confidence: "solide",
    grossPerBooster: 10,
    classes: [
      {
        rarity: "Rare",
        count: 1,
        rateLo: 1,
        rateHi: 1,
        oneInAny: 1,
        oneInSpecific: 1,
        contribution: 10,
        premium: false,
      },
    ],
  },
};
const ledger = { listings: Object.fromEntries(marketRows.map(({ key, row }) => [key, row])) };
const v2 = buildDropV2Set(set, ledger, generatedAt);
check("la valeur EX+ remplace seulement la contribution couverte", [v2.grossCentral, v2.grossQuick], [13.5, 10.6]);
check("frais appliqués après la valeur brute", [v2.netCentralMid, v2.netQuickMid], [11.74, 9.22]);
check("couverture et confiance explicites", [v2.coverage, v2.confidence], [1, "élevée"]);
check("volume d'étude explicite", [v2.study.trackedCards, v2.study.repricedCards, v2.study.observedOffers], [1, 1, 5]);
check("composition de couverture explicite", v2.coverageBreakdown, {
  repriced: 1,
  trackedFallbackThin: 0,
  trackedFallbackConflict: 0,
  trackedFallbackUnavailable: 0,
  untracked: 0,
});

const boosterHistory = buildBoosterMarketHistory(
  [
    { date: "2026-08-11", trend: 14, avg: 13, low: 9, sourceCreatedAt: "2026-08-11T00:30:00Z" },
    { date: "2026-08-12", trend: 15, avg: 14, low: 10, sourceCreatedAt: "2026-08-12T00:30:00Z" },
  ],
  [
    { date: "2026-08-10", boosterFRp10: 18, boosterFRmedian: 25, boosterFRoffers: 12, boosterFRsellers: 8 },
    { date: "2026-08-12", boosterFRp10: 19, boosterFRmedian: 26, boosterFRoffers: 14, boosterFRsellers: 9, boosterFRcomplete: true },
  ],
  generatedAt,
);
check("fenêtre booster réellement fixée à 365 jours", [boosterHistory.from, boosterHistory.to, boosterHistory.windowDays], ["2025-08-13", "2026-08-12", 365]);
check("Cardmarket et eBay restent deux séries séparées", boosterHistory.coverage, {
  cardmarketDays: 2,
  ebayDays: 2,
  bothDays: 1,
  firstObserved: "2026-08-10",
  lastObserved: "2026-08-12",
});
check(
  "le point commun conserve prix vendus indicatifs et demandes sans fusion",
  [boosterHistory.observations.at(-1).cardmarketTrend, boosterHistory.observations.at(-1).ebayP10, boosterHistory.observations.at(-1).ebayMedian],
  [15, 19, 26],
);

const thinLedger = {
  listings: {
    only: listing("only", "a", 20, "Near Mint").row,
  },
};
const fallback = buildDropV2Set(set, thinLedger, generatedAt);
check("échantillon insuffisant : ancre historique conservée", [fallback.grossCentral, fallback.netCentralMid, fallback.coverage], [10, 8.7, 0]);

const conflictRows = marketRows.map(({ key, row }) => [key, { ...row, price_last: row.condition === "Moderately Played" ? row.price_last : row.price_last * 10 }]);
const conflict = buildDropV2Set(set, { listings: Object.fromEntries(conflictRows) }, generatedAt);
check("écart de source extrême : cotation mise en revue, pas injectée", [conflict.grossCentral, conflict.conflicts], [10, 1]);
check(
  "conflit traçable sans annonce brute",
  {
    card: conflict.conflictDetails[0].number,
    anchor: conflict.conflictDetails[0].anchorGross,
    method: conflict.conflictDetails[0].anchorMethod,
    blocking: conflict.conflictDetails[0].blocking,
    sellers: conflict.conflictDetails[0].sellers,
  },
  { card: "001", anchor: 10, method: "opening_reference", blocking: true, sellers: 4 },
);

const lowConflictRows = marketRows.map(({ key, row }) => [key, {
  ...row,
  price_last: row.condition === "Moderately Played" ? row.price_last : row.price_last * 0.05,
}]);
const lowConflict = buildDropV2Set(set, { listings: Object.fromEntries(lowConflictRows) }, generatedAt);
check("écart extrême sous l'ancre : même quarantaine traçable", [lowConflict.conflicts, lowConflict.conflictDetails[0].direction], [1, "below"]);

const boundaryLedger = (multiplier) => ({
  listings: Object.fromEntries(marketRows.map(({ key, row }) => [key, {
    ...row,
    price_last: row.condition === "Moderately Played" ? row.price_last : 10 * multiplier,
  }])),
});
check("borne 0,2× incluse", buildDropV2Set(set, boundaryLedger(0.2), generatedAt).conflicts, 0);
check("borne 5× incluse", buildDropV2Set(set, boundaryLedger(5), generatedAt).conflicts, 0);

const crawlAware = buildDropV2Set(set, ledger, generatedAt, {
  crawls: new Map([["card:1", {
    cardtrader: { status: "ok", complete: true, captured: 5, date: "2026-08-12" },
    ebay: { status: "error", complete: false, captured: 0, date: "2026-08-12" },
  }]]),
});
check("santé des crawls séparée du volume de marché", crawlAware.study.crawlHealth, {
  available: true,
  expected: 2,
  complete: 1,
  completeZero: 0,
  incomplete: 0,
  error: 1,
  missing: 0,
});

if (failures) process.exit(1);
console.log("\nDrop rate v2 : invariants tenus.");
