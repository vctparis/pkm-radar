// Modèle « drop frais EX+ ».
//
// Cette couche ne remplace pas les taux de tirage : elle remplace seulement
// les valeurs de cartes qui disposent d'un marché CardTrader actuel et assez
// profond. Le reste de l'EV conserve explicitement l'ancre historique
// Cardmarket. Le résultat est donc recomputable, borné et accompagné de sa
// couverture — jamais présenté comme une observation exhaustive.

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeCollectorNumber } from "./identifiers.mjs";

export const DROP_V2_MODEL_VERSION = "drop-rate-v2.1";
export const FRESH_PULL_CONDITIONS = new Set(["Near Mint", "Slightly Played"]);

const DEFAULT_FEES = 0.13;
const DEFAULT_BULK_THRESHOLD = 0.4;
const MIN_OFFERS = 5;
const MIN_SELLERS = 3;
const MAX_AGE_DAYS = 30;
const MIN_REFERENCE_RATIO = 0.2;
const MAX_REFERENCE_RATIO = 5;

const round2 = (value) => Number(value.toFixed(2));
const round3 = (value) => Number(value.toFixed(3));

export function quantile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * p;
  const lo = Math.floor(position);
  const hi = Math.ceil(position);
  return sorted[lo] * (1 - (position - lo)) + sorted[hi] * (position - lo);
}

function daysBetween(laterIso, earlierDate) {
  const later = Date.parse(laterIso);
  const earlier = Date.parse(`${earlierDate}T12:00:00Z`);
  if (!Number.isFinite(later) || !Number.isFinite(earlier)) return null;
  return Math.max(0, Math.round((later - earlier) / 86_400_000));
}

/**
 * Résume le marché actuel d'une carte au grain vendeur.
 *
 * Un vendeur qui duplique dix annonces ne pèse pas dix fois plus : on garde
 * son offre la moins chère, puis on calcule médiane et p10 entre vendeurs.
 */
export function summarizeFreshPullMarket(entries, generatedAt, crawl = null) {
  const structural = entries.filter(
    ({ row }) =>
      row.source === "cardtrader" &&
      row.matching === "exact" &&
      row.integrity !== "high_risk" &&
      !row.graded &&
      !row.on_vacation &&
      row.price_last > 0,
  );
  if (!structural.length) return null;

  // Une annonce sortie du dernier crawl ne doit pas rester dans la cotation.
  // Le manifeste est l'autorité sur la fenêtre observée. Un crawl complet à
  // zéro signifie réellement « aucune annonce vue » ; un crawl en erreur ou
  // incomplet ne doit jamais ressusciter silencieusement le snapshot précédent.
  if (crawl && (crawl.status !== "ok" || crawl.complete !== true || crawl.captured === 0)) return null;
  const latestSeen =
    crawl?.date ?? structural.map(({ row }) => row.last_seen).filter(Boolean).sort().at(-1) ?? null;
  if (!latestSeen) return null;
  const active = structural.filter(
    ({ row }) => row.last_seen === latestSeen && FRESH_PULL_CONDITIONS.has(row.condition),
  );

  const bySeller = new Map();
  for (const { key, row } of active) {
    const sellerKey = row.seller_id ? `seller:${row.seller_id}` : `listing:${key}`;
    const previous = bySeller.get(sellerKey);
    if (previous == null || row.price_last < previous) bySeller.set(sellerKey, row.price_last);
  }
  const sellerPrices = [...bySeller.values()];
  const median = quantile(sellerPrices, 0.5);
  const floor10 = quantile(sellerPrices, 0.1);
  const ageDays = daysBetween(generatedAt, latestSeen);
  const offers = active.length;
  const sellers = sellerPrices.length;

  return {
    median: median == null ? null : round2(median),
    floor10: floor10 == null ? null : round2(floor10),
    offers,
    sellers,
    latestSeen,
    ageDays,
    adequate: offers >= MIN_OFFERS && sellers >= MIN_SELLERS && ageDays != null && ageDays <= MAX_AGE_DAYS,
    floorIndicative: sellers < 10,
    conditionMix: {
      nearMint: active.filter(({ row }) => row.condition === "Near Mint").length,
      slightlyPlayed: active.filter(({ row }) => row.condition === "Slightly Played").length,
    },
  };
}

function confidenceFor({ coverage, freshnessDays, rateConfidence }) {
  if (coverage >= 0.7 && freshnessDays <= 7 && rateConfidence === "solide") return "élevée";
  if (coverage >= 0.5 && freshnessDays <= MAX_AGE_DAYS && rateConfidence !== "grossière") return "moyenne";
  return "faible";
}

function netOf(value, fees, bulkThreshold) {
  return value >= bulkThreshold ? value * (1 - fees) : 0;
}

/** Construit un set v2 à partir de l'artefact v1 et de son ledger. */
export function buildDropV2Set(set, ledger, generatedAt, options = {}) {
  const opening = set.opening;
  const dropRates = set.dropRates;
  if (!dropRates || !opening || opening.mode === "box" || !opening.evCoverage?.length) return null;

  const fees = options.fees ?? DEFAULT_FEES;
  const bulkThreshold = options.bulkThreshold ?? DEFAULT_BULK_THRESHOLD;
  const netBaseLo = opening.netLo;
  const netBaseHi = opening.netHi;
  const netBaseMid = (netBaseLo + netBaseHi) / 2;
  if (!(netBaseMid > 0)) return null;

  const entriesBySubject = new Map();
  for (const [key, row] of Object.entries(ledger?.listings ?? {})) {
    if (!row?.subject?.startsWith("card:")) continue;
    if (!entriesBySubject.has(row.subject)) entriesBySubject.set(row.subject, []);
    entriesBySubject.get(row.subject).push({ key, row });
  }

  const classState = new Map(
    dropRates.classes.map((row) => [
      row.rarity,
      {
        ...row,
        centralContribution: row.contribution,
        quickContribution: row.contribution,
      },
    ]),
  );

  let centralGross = dropRates.grossPerBooster;
  let quickGross = dropRates.grossPerBooster;
  let centralNetLo = netBaseLo;
  let centralNetHi = netBaseHi;
  let quickNetLo = netBaseLo;
  let quickNetHi = netBaseHi;
  let refreshedShare = 0;
  let freshnessDays = 0;
  let conflicts = 0;
  const cards = [];

  for (const coverage of opening.evCoverage) {
    const row = classState.get(coverage.rarity);
    if (!row || !(row.count > 0)) continue;
    const rateMid = (row.rateLo + row.rateHi) / 2;
    const pMid = rateMid / row.count;
    const pLo = row.rateLo / row.count;
    const pHi = row.rateHi / row.count;
    if (!(pMid > 0)) continue;

    const oldNetContributionMid = coverage.share * netBaseMid;
    const oldNetValue = oldNetContributionMid / pMid;
    const oldGrossValue = oldNetValue / (1 - fees);
    const subject = `card:${normalizeCollectorNumber(coverage.number)}`;
    const market = summarizeFreshPullMarket(
      entriesBySubject.get(subject) ?? [],
      generatedAt,
      options.crawls?.get(subject) ?? null,
    );
    const ratio = market?.median && oldGrossValue > 0 ? market.median / oldGrossValue : null;
    const conflict = ratio != null && (ratio < MIN_REFERENCE_RATIO || ratio > MAX_REFERENCE_RATIO);
    if (conflict) conflicts++;
    const usable = Boolean(market?.adequate && market.median != null && market.floor10 != null && !conflict);

    if (!usable) continue;

    const centralNetValue = netOf(market.median, fees, bulkThreshold);
    const quickNetValue = netOf(market.floor10, fees, bulkThreshold);
    const oldGrossContribution = pMid * oldGrossValue;
    const centralGrossContribution = pMid * market.median;
    const quickGrossContribution = pMid * market.floor10;

    centralGross += centralGrossContribution - oldGrossContribution;
    quickGross += quickGrossContribution - oldGrossContribution;
    centralNetLo += pLo * (centralNetValue - oldNetValue);
    centralNetHi += pHi * (centralNetValue - oldNetValue);
    quickNetLo += pLo * (quickNetValue - oldNetValue);
    quickNetHi += pHi * (quickNetValue - oldNetValue);
    row.centralContribution += centralGrossContribution - oldGrossContribution;
    row.quickContribution += quickGrossContribution - oldGrossContribution;

    refreshedShare += coverage.share;
    freshnessDays = Math.max(freshnessDays, market.ageDays ?? 0);
    cards.push({
      number: coverage.number,
      name: coverage.name,
      rarity: coverage.rarity,
      oneIn: Math.round(1 / pMid),
      median: market.median,
      floor10: market.floor10,
      offers: market.offers,
      sellers: market.sellers,
      latestSeen: market.latestSeen,
      floorIndicative: market.floorIndicative,
      contribution: round2(centralGrossContribution),
    });
  }

  const coverage = Math.min(1, refreshedShare);
  const boosterPrice = opening.boosterPrice;
  const centralNetMid = (centralNetLo + centralNetHi) / 2;
  const quickNetMid = (quickNetLo + quickNetHi) / 2;
  const rateConfidence = dropRates.confidence;
  const confidence = confidenceFor({ coverage, freshnessDays, rateConfidence });

  return {
    id: set.id,
    name: set.name,
    nameEN: set.nameEN ?? null,
    era: set.era,
    logo: set.logo ?? null,
    boosterPrice,
    grossCentral: round2(Math.max(0, centralGross)),
    grossQuick: round2(Math.max(0, quickGross)),
    netCentralLo: round2(Math.max(0, centralNetLo)),
    netCentralHi: round2(Math.max(0, centralNetHi)),
    netCentralMid: round2(Math.max(0, centralNetMid)),
    netQuickLo: round2(Math.max(0, quickNetLo)),
    netQuickHi: round2(Math.max(0, quickNetHi)),
    netQuickMid: round2(Math.max(0, quickNetMid)),
    lossPct: boosterPrice > 0 ? Math.round((1 - centralNetMid / boosterPrice) * 100) : null,
    quickLossPct: boosterPrice > 0 ? Math.round((1 - quickNetMid / boosterPrice) * 100) : null,
    coverage: round3(coverage),
    trackedCoverage: round3(Math.min(1, opening.evCoverage.reduce((sum, item) => sum + item.share, 0))),
    freshnessDays,
    confidence,
    rateConfidence,
    conflicts,
    sample: dropRates.sample ?? null,
    sampleSource: dropRates.sampleSource ?? null,
    partialNote: dropRates.partialNote ?? null,
    classes: [...classState.values()].map((row) => ({
      rarity: row.rarity,
      count: row.count,
      rateLo: row.rateLo,
      rateHi: row.rateHi,
      oneInAny: row.oneInAny,
      oneInSpecific: row.oneInSpecific,
      premium: row.premium,
      baselineContribution: row.contribution,
      centralContribution: round2(Math.max(0, row.centralContribution)),
      quickContribution: round2(Math.max(0, row.quickContribution)),
    })),
    cards: cards.sort((a, b) => b.contribution - a.contribution).slice(0, 10),
  };
}

export async function buildDropV2Artifact(root, radarPayload) {
  const crawlsBySet = new Map();
  try {
    const manifest = await readFile(join(root, "data", "ledger", "_manifest.jsonl"), "utf8");
    for (const line of manifest.split("\n")) {
      if (!line.trim()) continue;
      const row = JSON.parse(line);
      if (row.type !== "crawl" || row.source !== "cardtrader" || !row.subject?.startsWith("card:")) continue;
      if (!crawlsBySet.has(row.set)) crawlsBySet.set(row.set, new Map());
      const current = crawlsBySet.get(row.set).get(row.subject);
      if (!current || String(row.observed_at ?? row.date) > String(current.observed_at ?? current.date)) {
        crawlsBySet.get(row.set).set(row.subject, row);
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const sets = [];
  for (const set of radarPayload.sets) {
    let ledger = { listings: {} };
    try {
      ledger = JSON.parse(await readFile(join(root, "data", "ledger", `${set.id}.json`), "utf8"));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    const built = buildDropV2Set(set, ledger, radarPayload.generatedAt, { crawls: crawlsBySet.get(set.id) });
    if (built) sets.push(built);
  }

  const artifact = {
    generatedAt: radarPayload.generatedAt,
    modelVersion: DROP_V2_MODEL_VERSION,
    definition: {
      conditions: [...FRESH_PULL_CONDITIONS],
      priceGrain: "minimum par vendeur, puis médiane et p10 entre vendeurs",
      minimumOffers: MIN_OFFERS,
      minimumSellers: MIN_SELLERS,
      maximumAgeDays: MAX_AGE_DAYS,
      fees: DEFAULT_FEES,
      bulkThreshold: DEFAULT_BULK_THRESHOLD,
    },
    sets,
  };
  await writeFile(join(root, "public", "drop-rate-v2.json"), `${JSON.stringify(artifact, null, 2)}\n`);
  return artifact;
}
