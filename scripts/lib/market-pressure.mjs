// Pression du carnet des boosters scellés.
//
// Le modèle décrit des FLUX D'ANNONCES, pas des ventes ni des acheteurs :
// - une disparition peut être une vente, un retrait ou une expiration ;
// - un nouvel identifiant peut être une remise en ligne ;
// - une quantité eBay n'est généralement pas observable.
//
// Une observation n'entre dans le calcul que si le crawl correspondant est
// complet. Les sources ne sont jamais fusionnées : une même offre peut être
// publiée sur plusieurs marketplaces.

import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SETS } from "./sets.mjs";

export const MARKET_PRESSURE_MODEL_VERSION = "market-pressure-beta.1";
export const MIN_DAYS_FOR_VERDICT = 14;
export const VERDICT_WINDOW_DAYS = 7;

const SOURCE_IDS = new Set(["ebay", "cardtrader"]);
const round2 = (value) => Number(value.toFixed(2));
const round4 = (value) => Number(value.toFixed(4));

function quantile(values, q) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * q;
  const lo = Math.floor(position);
  const hi = Math.ceil(position);
  return sorted[lo] * (1 - (position - lo)) + sorted[hi] * (position - lo);
}

function ratioChange(previous, current) {
  if (!(previous > 0) || !Number.isFinite(current)) return null;
  return round4(current / previous - 1);
}

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\W+/g, " ")
    .trim();
}

// Signature plus stricte que celle du ledger historique : langue et état
// évitent de confondre deux offres CardTrader légitimes du même vendeur.
export function pressureRelistSignature(listing) {
  const title = normalizeText(listing.title);
  if (!listing.seller_id || !title) return null;
  return createHash("sha256")
    .update([
      listing.source,
      listing.subject,
      listing.seller_id,
      title,
      listing.language ?? "",
      listing.condition ?? "",
    ].join("|"))
    .digest("hex")
    .slice(0, 20);
}

export function parseCompleteCrawls(manifestText, subject = "sealed") {
  const byKey = new Map();
  for (const line of String(manifestText ?? "").split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (
      row.type !== "crawl" ||
      row.subject !== subject ||
      !SOURCE_IDS.has(row.source) ||
      row.status !== "ok" ||
      row.complete !== true ||
      !row.run_id ||
      !row.date ||
      !row.set
    ) continue;
    const key = `${row.set}:${row.source}:${row.date}`;
    const current = byKey.get(key);
    if (!current || String(row.observed_at ?? "") > String(current.observed_at ?? "")) byKey.set(key, row);
  }
  return [...byKey.values()].sort((a, b) =>
    `${a.date}:${a.set}:${a.source}`.localeCompare(`${b.date}:${b.set}:${b.source}`),
  );
}

const EVENT_FIELDS = [
  "subject",
  "title",
  "url",
  "shipping",
  "country",
  "language",
  "condition",
  "seller_id",
  "seller_feedback_score",
  "matching",
  "integrity",
];

// Rejoue les deltas v5. Le filtrage se fait sur l'état AU MOMENT du crawl,
// jamais sur la seule fiche courante.
export function listingsByRun(store, source, runIds) {
  const wanted = new Set(runIds);
  const result = new Map([...wanted].map((runId) => [runId, new Map()]));
  for (const [listingKey, row] of Object.entries(store?.listings ?? {})) {
    if (row.source !== source) continue;
    const hasLegacyBaseline = (row.history ?? []).some((event) => event.legacy_compacted);
    const state = {
      source: row.source,
      currency: row.currency ?? "EUR",
      graded: row.graded ?? null,
      on_vacation: row.on_vacation ?? null,
      // Les lignes migrées depuis le ledger compact n'avaient pas d'instantané
      // d'identité dans leur premier événement. Pour elles seulement, la fiche
      // courante est la meilleure baseline disponible ; les deltas suivants
      // restent rejoués normalement.
      ...(hasLegacyBaseline ? Object.fromEntries(EVENT_FIELDS.map((field) => [field, row[field] ?? null])) : {}),
    };
    for (const event of row.history ?? []) {
      if (event.legacy_compacted) continue;
      if (Number(event.p) > 0) state.price = Number(event.p);
      if (Object.hasOwn(event, "q")) state.quantity = event.q;
      for (const field of EVENT_FIELDS) if (Object.hasOwn(event, field)) state[field] = event[field];
      if (!wanted.has(event.run_id)) continue;
      if (
        state.subject !== "sealed" ||
        state.matching !== "exact" ||
        state.integrity === "high_risk" ||
        state.graded === true ||
        state.on_vacation === true ||
        !(state.price > 0)
      ) continue;
      const listing = { ...state, key: listingKey };
      listing.relist_signature = pressureRelistSignature(listing);
      result.get(event.run_id).set(listingKey, listing);
    }
  }
  return result;
}

function languageChoice(runListings, configuredLanguage, jpOnly) {
  if (configuredLanguage) return { language: configuredLanguage, mode: "quote_language" };
  const counts = new Map();
  for (const listings of runListings.values()) {
    for (const row of listings.values()) {
      if (row.language) counts.set(row.language, (counts.get(row.language) ?? 0) + 1);
    }
  }
  const target = jpOnly ? "jp" : "fr";
  if (counts.has(target)) return { language: target, mode: "target_language" };
  const fallback = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { language: fallback, mode: fallback ? "fallback_depth" : "unavailable" };
}

function filterLanguage(listings, source, language) {
  if (source !== "cardtrader" || !language) return new Map(listings);
  return new Map([...listings].filter(([, row]) => row.language === language));
}

function snapshotOf(crawl, listings) {
  const rows = [...listings.values()];
  const knownQuantities = rows.filter((row) => Number.isFinite(Number(row.quantity)) && Number(row.quantity) >= 0);
  const activeUnitsKnown = knownQuantities.reduce((sum, row) => sum + Number(row.quantity), 0);
  const sellerIds = rows.map((row) => row.seller_id).filter(Boolean);
  const sellerCounts = new Map();
  const sellerFloors = new Map();
  for (const row of rows) {
    const sellerKey = row.seller_id ? `s:${row.seller_id}` : `l:${row.key}`;
    sellerCounts.set(sellerKey, (sellerCounts.get(sellerKey) ?? 0) + 1);
    const current = sellerFloors.get(sellerKey);
    if (current == null || row.price < current) sellerFloors.set(sellerKey, row.price);
  }
  const prices = [...sellerFloors.values()];
  const bestAsk = prices.length ? Math.min(...prices) : null;
  const within = (pct) => bestAsk == null ? [] : rows.filter((row) => row.price <= bestAsk * (1 + pct));
  const depth5 = within(0.05);
  const depth10 = within(0.1);
  const hhi = rows.length
    ? [...sellerCounts.values()].reduce((sum, count) => sum + (count / rows.length) ** 2, 0)
    : null;
  return {
    date: crawl.date,
    runId: crawl.run_id,
    listings,
    activeListings: rows.length,
    activeUnitsKnown,
    listingsWithQuantity: knownQuantities.length,
    quantityCoverage: rows.length ? round4(knownQuantities.length / rows.length) : 0,
    sellers: new Set(sellerIds).size,
    sellerIdentityCoverage: rows.length ? round4(sellerIds.length / rows.length) : 0,
    bestAsk: bestAsk == null ? null : round2(bestAsk),
    floor10: prices.length ? round2(quantile(prices, 0.1)) : null,
    medianAsk: prices.length ? round2(quantile(prices, 0.5)) : null,
    depth5Listings: depth5.length,
    depth10Listings: depth10.length,
    depth10UnitsKnown: depth10
      .filter((row) => Number.isFinite(Number(row.quantity)))
      .reduce((sum, row) => sum + Number(row.quantity), 0),
    sellerHhi: hhi == null ? null : round4(hhi),
    crawl: {
      captured: crawl.captured ?? null,
      totalAvailable: crawl.total_available ?? null,
      pages: crawl.pages ?? null,
      complete: true,
      scope: crawl.scope ?? null,
    },
  };
}

function pairRelists(exits, entries) {
  const bySignature = (rows) => {
    const buckets = new Map();
    for (const row of rows) {
      if (!row.relist_signature) continue;
      if (!buckets.has(row.relist_signature)) buckets.set(row.relist_signature, []);
      buckets.get(row.relist_signature).push(row);
    }
    return buckets;
  };
  const exitBuckets = bySignature(exits);
  const entryBuckets = bySignature(entries);
  const pairedExitKeys = new Set();
  const pairedEntryKeys = new Set();
  for (const [signature, oldRows] of exitBuckets) {
    const newRows = entryBuckets.get(signature) ?? [];
    // Le prix le plus proche est le meilleur candidat quand un vendeur porte
    // plusieurs annonces au titre identique. Un appariement reste un-pour-un.
    const available = [...newRows];
    for (const oldRow of oldRows) {
      if (!available.length) break;
      available.sort((a, b) => Math.abs(a.price - oldRow.price) - Math.abs(b.price - oldRow.price));
      const paired = available.shift();
      pairedExitKeys.add(oldRow.key);
      pairedEntryKeys.add(paired.key);
    }
  }
  return { pairedExitKeys, pairedEntryKeys };
}

export function compareSnapshots(previous, current) {
  const previousKeys = new Set(previous.listings.keys());
  const currentKeys = new Set(current.listings.keys());
  const exits = [...previous.listings.values()].filter((row) => !currentKeys.has(row.key));
  const entries = [...current.listings.values()].filter((row) => !previousKeys.has(row.key));
  const { pairedExitKeys, pairedEntryKeys } = pairRelists(exits, entries);
  const adjustedExits = exits.filter((row) => !pairedExitKeys.has(row.key));
  const adjustedEntries = entries.filter((row) => !pairedEntryKeys.has(row.key));

  let quantityIncreaseUnits = 0;
  let quantityDecreaseUnits = 0;
  let quantityComparableListings = 0;
  for (const [key, before] of previous.listings) {
    const after = current.listings.get(key);
    if (!after || !Number.isFinite(Number(before.quantity)) || !Number.isFinite(Number(after.quantity))) continue;
    quantityComparableListings++;
    const delta = Number(after.quantity) - Number(before.quantity);
    if (delta > 0) quantityIncreaseUnits += delta;
    if (delta < 0) quantityDecreaseUnits += Math.abs(delta);
  }
  const knownNewUnits = adjustedEntries
    .filter((row) => Number.isFinite(Number(row.quantity)))
    .reduce((sum, row) => sum + Number(row.quantity), 0);
  const knownExitUnits = adjustedExits
    .filter((row) => Number.isFinite(Number(row.quantity)))
    .reduce((sum, row) => sum + Number(row.quantity), 0);
  const knownInflowUnits = knownNewUnits + quantityIncreaseUnits;
  const knownOutflowUnits = knownExitUnits + quantityDecreaseUnits;
  const listingDenominator = adjustedExits.length + adjustedEntries.length;
  const unitDenominator = knownInflowUnits + knownOutflowUnits;

  return {
    from: previous.date,
    to: current.date,
    newListings: entries.length,
    exits: exits.length,
    likelyRelists: pairedExitKeys.size,
    adjustedNewListings: adjustedEntries.length,
    adjustedExits: adjustedExits.length,
    quantityComparableListings,
    quantityIncreaseUnits,
    quantityDecreaseUnits,
    knownNewUnits,
    knownExitUnits,
    knownInflowUnits,
    knownOutflowUnits,
    listingImbalance: listingDenominator
      ? round4((adjustedExits.length - adjustedEntries.length) / listingDenominator)
      : null,
    unitImbalance: unitDenominator ? round4((knownOutflowUnits - knownInflowUnits) / unitDenominator) : null,
    stockChange: current.activeListings - previous.activeListings,
    stockChangePct: ratioChange(previous.activeListings, current.activeListings),
    floor10ChangePct: ratioChange(previous.floor10, current.floor10),
    medianChangePct: ratioChange(previous.medianAsk, current.medianAsk),
    suspectEmptyCrawl: current.activeListings === 0 && previous.activeListings > 0,
  };
}

function confidenceStage(days) {
  if (days < MIN_DAYS_FOR_VERDICT) return "collecting";
  if (days < 30) return "exploratory";
  if (days < 90) return "established";
  return "calibrated";
}

function verdictOf(snapshots) {
  const days = snapshots.length;
  const stage = confidenceStage(days);
  if (days < MIN_DAYS_FOR_VERDICT) {
    return {
      status: "collecting",
      label: "Collecte en cours",
      confidence: "insuffisante",
      reason: `${days}/${MIN_DAYS_FOR_VERDICT} journées complètes`,
    };
  }
  const window = snapshots.slice(-(VERDICT_WINDOW_DAYS + 1));
  const flows = window.slice(1).map((snapshot) => snapshot.flowFromPrevious).filter((flow) => flow && !flow.suspectEmptyCrawl);
  const first = window[0];
  const last = window.at(-1);
  if (last.activeListings < 5 || !flows.length || first.floor10 == null || last.floor10 == null) {
    return {
      status: "insufficient_sample",
      label: "Échantillon trop mince",
      confidence: "insuffisante",
      reason: "Moins de 5 annonces actives ou prix incomplet",
    };
  }
  const out = flows.reduce((sum, flow) => sum + flow.adjustedExits, 0);
  const incoming = flows.reduce((sum, flow) => sum + flow.adjustedNewListings, 0);
  const imbalance = out + incoming ? (out - incoming) / (out + incoming) : 0;
  const stockChangePct = ratioChange(first.activeListings, last.activeListings) ?? 0;
  const priceChangePct = ratioChange(first.floor10, last.floor10) ?? 0;
  const buyerSignals = Number(imbalance >= 0.1) + Number(stockChangePct <= -0.05) + Number(priceChangePct >= 0.02);
  const sellerSignals = Number(imbalance <= -0.1) + Number(stockChangePct >= 0.05) + Number(priceChangePct <= -0.02);
  const confidence = stage === "exploratory" ? "faible" : stage === "established" ? "moyenne" : "élevée";
  if (buyerSignals >= 2 && buyerSignals > sellerSignals) {
    return { status: "buyer", label: "Pression acheteuse probable", confidence, reason: `${buyerSignals}/3 signaux convergents` };
  }
  if (sellerSignals >= 2 && sellerSignals > buyerSignals) {
    return { status: "seller", label: "Pression vendeuse probable", confidence, reason: `${sellerSignals}/3 signaux convergents` };
  }
  return { status: "mixed", label: "Signaux mixtes", confidence, reason: "Flux, stock et prix ne convergent pas" };
}

function publicSnapshot(snapshot) {
  const { listings, runId, ...safe } = snapshot;
  void listings;
  void runId;
  return safe;
}

function sourceSeries({ store, source, crawls, configuredLanguage, jpOnly }) {
  if (!crawls.length) return null;
  const runIds = crawls.map((crawl) => crawl.run_id);
  const allListings = listingsByRun(store, source, runIds);
  const languageScope = source === "cardtrader"
    ? languageChoice(allListings, configuredLanguage, jpOnly)
    : { language: jpOnly ? "jp" : "fr", mode: "api_scope" };
  const snapshots = crawls.map((crawl) => snapshotOf(
    crawl,
    filterLanguage(allListings.get(crawl.run_id) ?? new Map(), source, languageScope.language),
  ));
  for (let index = 1; index < snapshots.length; index++) {
    snapshots[index].flowFromPrevious = compareSnapshots(snapshots[index - 1], snapshots[index]);
  }
  const latest = snapshots.at(-1);
  return {
    source,
    language: languageScope.language,
    languageScopeMode: languageScope.mode,
    coverage: {
      completeDays: snapshots.length,
      firstDate: snapshots[0]?.date ?? null,
      lastDate: latest?.date ?? null,
      minimumDaysForVerdict: MIN_DAYS_FOR_VERDICT,
      stage: confidenceStage(snapshots.length),
    },
    verdict: verdictOf(snapshots),
    latest: latest ? publicSnapshot(latest) : null,
    history: snapshots.map(publicSnapshot),
  };
}

export function computeMarketPressure({ stores, manifestText, sets = SETS, languageBySet = {}, generatedAt = new Date().toISOString() }) {
  const completeCrawls = parseCompleteCrawls(manifestText);
  const setsOutput = [];
  for (const set of sets) {
    const store = stores[set.id];
    if (!store) continue;
    const sources = {};
    for (const source of SOURCE_IDS) {
      const crawls = completeCrawls.filter((row) => row.set === set.id && row.source === source);
      sources[source] = sourceSeries({
        store,
        source,
        crawls,
        configuredLanguage: source === "cardtrader" ? languageBySet[set.id] : null,
        jpOnly: Boolean(set.jpOnly),
      });
    }
    if (!sources.ebay && !sources.cardtrader) continue;
    setsOutput.push({ id: set.id, name: set.name, era: set.era, jpOnly: Boolean(set.jpOnly), sources });
  }
  const allSeries = setsOutput.flatMap((set) => Object.values(set.sources).filter(Boolean));
  const asOf = allSeries.map((series) => series.coverage.lastDate).filter(Boolean).sort().at(-1) ?? null;
  return {
    schemaVersion: 1,
    modelVersion: MARKET_PRESSURE_MODEL_VERSION,
    generatedAt,
    asOf,
    subject: "sealed_booster",
    readiness: {
      minimumDaysForVerdict: MIN_DAYS_FOR_VERDICT,
      completeDaysMax: Math.max(0, ...allSeries.map((series) => series.coverage.completeDays)),
      seriesReady: allSeries.filter((series) => series.coverage.completeDays >= MIN_DAYS_FOR_VERDICT).length,
      seriesTotal: allSeries.length,
    },
    methodology: {
      unit: "listing_level_order_book",
      timezone: "UTC",
      sourcesCombined: false,
      buyerCountAvailable: false,
      exitIsSale: false,
      priceBasis: "active_ask_excluding_shipping",
      sellerPriceWeighting: "one_floor_ask_per_seller",
      flowDefinition: "adjusted listing entries/exits plus known quantity changes",
      verdictDefinition: "7 complete-day convergence of adjusted flow, active stock and p10 ask; published from 14 complete days",
      knownLimitations: [
        "Une sortie d'annonce n'est pas une vente confirmée.",
        "Les quantités eBay sont généralement inconnues.",
        "Les offres publiées sur plusieurs sources ne sont pas dédupliquées entre marketplaces.",
        "Le grading et le statut vacances sont stockés sur la fiche courante, pas dans chaque delta historique v5.",
        "Les lignes migrées sans instantané d'identité utilisent leur fiche courante comme baseline historique.",
      ],
    },
    sources: [
      { id: "ebay", label: "eBay.fr", scope: "Boosters scellés dans la langue du set, achat immédiat, zone d'achat UE" },
      { id: "cardtrader", label: "CardTrader", scope: "Langue cotée séparément pour chaque set" },
    ],
    sets: setsOutput,
  };
}

export async function buildMarketPressureArtifact(root, radarPayload = null) {
  const radar = radarPayload ?? JSON.parse(await readFile(join(root, "public", "radar-data.json"), "utf8"));
  const languageBySet = Object.fromEntries(
    (radar.sets ?? []).map((set) => [set.id, set.live?.booster?.language ?? null]),
  );
  const ledgerDir = join(root, "data", "ledger");
  const files = (await readdir(ledgerDir)).filter((file) => file.endsWith(".json"));
  const stores = Object.fromEntries(await Promise.all(files.map(async (file) => [
    file.slice(0, -5),
    JSON.parse(await readFile(join(ledgerDir, file), "utf8")),
  ])));
  const manifestText = await readFile(join(ledgerDir, "_manifest.jsonl"), "utf8");
  const artifact = computeMarketPressure({ stores, manifestText, languageBySet });
  await writeFile(join(root, "public", "market-pressure.json"), `${JSON.stringify(artifact, null, 2)}\n`);
  return artifact;
}
