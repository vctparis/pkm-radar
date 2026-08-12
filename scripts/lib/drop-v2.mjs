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

export const DROP_V2_MODEL_VERSION = "drop-rate-v2.4";
// Mint > Near Mint : l'oublier excluait paradoxalement les annonces les
// mieux conservées (bug latent — aucune annonce CT-FR « Mint » à ce jour,
// mais la liste blanche doit couvrir tout l'EX+).
export const FRESH_PULL_CONDITIONS = new Set(["Mint", "Near Mint", "Slightly Played"]);

const DEFAULT_FEES = 0.13;
const DEFAULT_BULK_THRESHOLD = 0.4;
const MIN_OFFERS = 5;
const MIN_SELLERS = 3;
const MAX_AGE_DAYS = 30;
const MIN_REFERENCE_RATIO = 0.2;
const MAX_REFERENCE_RATIO = 5;

const round2 = (value) => Number(value.toFixed(2));
const round3 = (value) => Number(value.toFixed(3));

const positiveOrNull = (value) => (Number(value) > 0 ? round2(Number(value)) : null);
const finiteOrNull = (value) => (value == null || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null);

export function buildBoosterMarketHistory(cardmarketRows, marketplaceRows, generatedAt, windowDays = 365) {
  const end = new Date(generatedAt);
  if (!Number.isFinite(end.getTime())) throw new Error("date de génération invalide pour l'historique booster");
  const endDate = end.toISOString().slice(0, 10);
  const start = new Date(`${endDate}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - (windowDays - 1));
  const startDate = start.toISOString().slice(0, 10);
  const byDate = new Map();
  const pointOf = (date) => {
    if (!byDate.has(date)) byDate.set(date, { date });
    return byDate.get(date);
  };
  for (const row of cardmarketRows ?? []) {
    if (row.date < startDate || row.date > endDate) continue;
    const point = pointOf(row.date);
    point.cardmarketTrend = positiveOrNull(row.trend);
    point.cardmarketAvg = positiveOrNull(row.avg);
    point.cardmarketLow = positiveOrNull(row.low);
    point.cardmarketSourceCreatedAt = row.sourceCreatedAt ?? null;
  }
  for (const row of marketplaceRows ?? []) {
    if (row.date < startDate || row.date > endDate) continue;
    const point = pointOf(row.date);
    point.ebayP10 = positiveOrNull(row.boosterFRp10);
    point.ebayMedian = positiveOrNull(row.boosterFRmedian);
    point.ebayOffers = finiteOrNull(row.boosterFRoffers);
    point.ebaySellers = finiteOrNull(row.boosterFRsellers);
    point.ebayTrusted = finiteOrNull(row.boosterFRtrusted);
    point.ebayReview = finiteOrNull(row.boosterFRreview);
    point.ebayQuarantined = finiteOrNull(row.boosterFRquarantined);
    point.ebayComplete = typeof row.boosterFRcomplete === "boolean" ? row.boosterFRcomplete : null;
  }
  const observations = [...byDate.values()]
    .filter((point) => point.cardmarketTrend != null || point.cardmarketAvg != null || point.ebayP10 != null || point.ebayMedian != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const cardmarketDays = observations.filter((point) => point.cardmarketTrend != null).length;
  const ebayDays = observations.filter((point) => point.ebayP10 != null || point.ebayMedian != null).length;
  const bothDays = observations.filter((point) => point.cardmarketTrend != null && (point.ebayP10 != null || point.ebayMedian != null)).length;
  return {
    windowDays,
    from: startDate,
    to: endDate,
    observations,
    coverage: {
      cardmarketDays,
      ebayDays,
      bothDays,
      firstObserved: observations[0]?.date ?? null,
      lastObserved: observations.at(-1)?.date ?? null,
    },
    doctrine: {
      cardmarket: "Trend Price quotidien du guide public Cardmarket, marché européen et langues confondues",
      ebay: "p10 et médiane des annonces actives eBay.fr retenues après matching et contrôle d'intégrité",
    },
  };
}

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
export function summarizeFreshPullMarket(entries, generatedAt, crawls = null) {
  // Doctrine de langue du site : le français quand il existe, jamais le
  // toutes-langues. Les cotations viennent d'eBay.fr (français par
  // construction — aspect Langue + matching, l'état sous EX déjà écarté) et
  // de CardTrader restreint aux annonces FR. Un vendeur = une voix, les deux
  // sources confondues.
  const structural = entries.filter(
    ({ row }) =>
      (row.source === "cardtrader" ? row.language === "fr" : row.source === "ebay") &&
      row.matching === "exact" &&
      row.integrity !== "high_risk" &&
      !row.graded &&
      !row.on_vacation &&
      row.price_last > 0,
  );
  if (!structural.length) return null;

  // Une annonce sortie du dernier crawl ne doit pas rester dans la cotation.
  // Le manifeste est l'autorité sur la fenêtre observée, SOURCE PAR SOURCE :
  // un crawl complet à zéro signifie réellement « aucune annonce vue » ; un
  // crawl en erreur, incomplet ou absent n'admet aucune annonce de sa source
  // — jamais de résurrection silencieuse du snapshot précédent.
  const legacyCrawl = crawls && typeof crawls.status === "string" ? { cardtrader: crawls } : null;
  const bySource = legacyCrawl ?? crawls ?? null;
  const active = [];
  const windows = [];
  for (const source of ["ebay", "cardtrader"]) {
    const crawl = bySource?.[source] ?? null;
    if (bySource != null || source === "cardtrader") {
      // mode strict dès qu'un manifeste est fourni ; compat : sans manifeste,
      // CardTrader retombe sur la dernière date vue (fixtures historiques).
      if (bySource != null && (!crawl || crawl.status !== "ok" || crawl.complete !== true || crawl.captured === 0)) {
        continue;
      }
    }
    const fallbackDate =
      structural.filter(({ row }) => row.source === source).map(({ row }) => row.last_seen).filter(Boolean).sort().at(-1) ?? null;
    const windowDate = crawl?.date ?? fallbackDate;
    if (!windowDate) continue;
    const rows = structural.filter(
      ({ row }) =>
        row.source === source &&
        row.last_seen === windowDate &&
        // CardTrader déclare la condition ; eBay ne la structure pas — le
        // matching a déjà écarté l'explicitement sous EX (etat_sous_ex).
        (source === "ebay" || FRESH_PULL_CONDITIONS.has(row.condition)),
    );
    if (rows.length) {
      active.push(...rows);
      windows.push(windowDate);
    }
  }
  const latestSeen = windows.sort().at(-1) ?? null;
  if (!latestSeen) return null;

  const bySeller = new Map();
  for (const { key, row } of active) {
    // Un identifiant vendeur n'est canonique qu'à l'intérieur de sa source.
    // Sans ce préfixe, un compte eBay et un compte CardTrader homonymes
    // deviennent artificiellement une seule voix.
    const sellerKey = row.seller_id ? `seller:${row.source}:${row.seller_id}` : `listing:${key}`;
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
      ebayFR: active.filter(({ row }) => row.source === "ebay").length,
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
  const conflictDetails = [];
  const cards = [];
  let repricedCards = 0;
  let observedOffers = 0;
  let sellerCardVoices = 0;
  let ebayOffers = 0;
  let cardTraderOffers = 0;
  let trackedFallbackThin = 0;
  let trackedFallbackConflict = 0;
  let trackedFallbackUnavailable = 0;

  const crawlHealth = {
    available: options.crawls instanceof Map,
    expected: 0,
    complete: 0,
    completeZero: 0,
    incomplete: 0,
    error: 0,
    missing: 0,
  };

  if (crawlHealth.available) {
    for (const coverage of opening.evCoverage) {
      const subject = `card:${normalizeCollectorNumber(coverage.number)}`;
      const bySource = options.crawls.get(subject) ?? {};
      for (const source of ["ebay", "cardtrader"]) {
        crawlHealth.expected++;
        const crawl = bySource[source];
        if (!crawl) crawlHealth.missing++;
        else if (crawl.status !== "ok") crawlHealth.error++;
        else if (crawl.complete !== true) crawlHealth.incomplete++;
        else if (crawl.captured === 0) crawlHealth.completeZero++;
        else crawlHealth.complete++;
      }
    }
  }

  for (const coverage of opening.evCoverage) {
    const row = classState.get(coverage.rarity);
    if (!row || !(row.count > 0)) {
      trackedFallbackUnavailable += coverage.share;
      continue;
    }
    const rateMid = (row.rateLo + row.rateHi) / 2;
    const pMid = rateMid / row.count;
    const pLo = row.rateLo / row.count;
    const pHi = row.rateHi / row.count;
    if (!(pMid > 0)) {
      trackedFallbackUnavailable += coverage.share;
      continue;
    }

    const oldNetContributionMid = coverage.share * netBaseMid;
    const reconstructedOldNetValue = oldNetContributionMid / pMid;
    const reconstructedOldGrossValue = reconstructedOldNetValue / (1 - fees);
    const openingReference = Number(coverage.referenceGross);
    const indexedReference = Number(options.referenceByNumber?.get(normalizeCollectorNumber(coverage.number)));
    const directReference = openingReference > 0 ? openingReference : indexedReference;
    const oldGrossValue = directReference > 0 ? directReference : reconstructedOldGrossValue;
    const oldNetValue = netOf(oldGrossValue, fees, bulkThreshold);
    const anchorMethod = openingReference > 0
      ? "opening_reference"
      : indexedReference > 0
        ? "cards_index_reference"
        : "reconstructed_from_rounded_share";
    const subject = `card:${normalizeCollectorNumber(coverage.number)}`;
    const market = summarizeFreshPullMarket(
      entriesBySubject.get(subject) ?? [],
      generatedAt,
      options.crawls?.get(subject) ?? null,
    );
    const ratio = market?.median && oldGrossValue > 0 ? market.median / oldGrossValue : null;
    if (market) {
      observedOffers += market.offers;
      sellerCardVoices += market.sellers;
      ebayOffers += market.conditionMix.ebayFR;
      cardTraderOffers += Math.max(0, market.offers - market.conditionMix.ebayFR);
    }
    const conflict = ratio != null && (ratio < MIN_REFERENCE_RATIO || ratio > MAX_REFERENCE_RATIO);
    if (conflict) {
      conflictDetails.push({
        number: coverage.number,
        name: coverage.name,
        rarity: coverage.rarity,
        anchorGross: round2(oldGrossValue),
        anchorMethod,
        marketMedian: market.median,
        ratio: round2(ratio),
        direction: ratio < MIN_REFERENCE_RATIO ? "below" : "above",
        blocking: market.adequate,
        offers: market.offers,
        sellers: market.sellers,
        latestSeen: market.latestSeen,
        ageDays: market.ageDays,
        sourceOffers: {
          ebayFR: market.conditionMix.ebayFR,
          cardTraderFR: Math.max(0, market.offers - market.conditionMix.ebayFR),
        },
      });
    }
    const usable = Boolean(market?.adequate && market.median != null && market.floor10 != null && !conflict);

    if (!usable) {
      if (!market || market.median == null) trackedFallbackUnavailable += coverage.share;
      else if (market.adequate && conflict) trackedFallbackConflict += coverage.share;
      else trackedFallbackThin += coverage.share;
      continue;
    }

    repricedCards++;

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
    conflicts: conflictDetails.length,
    blockingConflicts: conflictDetails.filter((conflict) => conflict.blocking).length,
    conflictDetails,
    sample: dropRates.sample ?? null,
    sampleSource: dropRates.sampleSource ?? null,
    partialNote: dropRates.partialNote ?? null,
    evCoverageTruncated: Boolean(opening.evCoverageTruncated),
    coverageBreakdown: {
      repriced: round3(coverage),
      trackedFallbackThin: round3(trackedFallbackThin),
      trackedFallbackConflict: round3(trackedFallbackConflict),
      trackedFallbackUnavailable: round3(trackedFallbackUnavailable),
      untracked: round3(Math.max(0, 1 - Math.min(1, opening.evCoverage.reduce((sum, item) => sum + item.share, 0)))),
    },
    study: {
      trackedCards: opening.evCoverage.length,
      repricedCards,
      observedOffers,
      sellerCardVoices,
      sourceOffers: { ebayFR: ebayOffers, cardTraderFR: cardTraderOffers },
      crawlHealth,
    },
    boosterMarketHistory: options.boosterMarketHistory ?? buildBoosterMarketHistory([], [], generatedAt),
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
  const referencesBySet = new Map();
  try {
    const cardIndex = JSON.parse(await readFile(join(root, "public", "cards-index.json"), "utf8"));
    for (const card of cardIndex.cards ?? []) {
      const price = Number(card.p);
      if (!card.s || !card.num || !(price > 0)) continue;
      if (!referencesBySet.has(card.s)) referencesBySet.set(card.s, new Map());
      referencesBySet.get(card.s).set(normalizeCollectorNumber(card.num), price);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const cardmarketHistoryBySet = new Map();
  try {
    const cardmarketHistory = JSON.parse(await readFile(join(root, "data", "cardmarket", "history.json"), "utf8"));
    if (cardmarketHistory.schemaVersion !== 1 || !Array.isArray(cardmarketHistory.observations)) {
      throw new Error("historique Cardmarket invalide");
    }
    for (const row of cardmarketHistory.observations) {
      if (!cardmarketHistoryBySet.has(row.setId)) cardmarketHistoryBySet.set(row.setId, []);
      cardmarketHistoryBySet.get(row.setId).push(row);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  let marketplaceHistory = { snapshots: {} };
  try {
    marketplaceHistory = JSON.parse(await readFile(join(root, "data", "history.json"), "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const crawlsBySet = new Map();
  try {
    const manifest = await readFile(join(root, "data", "ledger", "_manifest.jsonl"), "utf8");
    for (const line of manifest.split("\n")) {
      if (!line.trim()) continue;
      const row = JSON.parse(line);
      if (row.type !== "crawl" || !row.subject?.startsWith("card:")) continue;
      if (row.source !== "cardtrader" && row.source !== "ebay") continue;
      if (!crawlsBySet.has(row.set)) crawlsBySet.set(row.set, new Map());
      const subjectMap = crawlsBySet.get(row.set);
      if (!subjectMap.has(row.subject)) subjectMap.set(row.subject, {});
      const bucket = subjectMap.get(row.subject);
      const current = bucket[row.source];
      if (!current || String(row.observed_at ?? row.date) > String(current.observed_at ?? current.date)) {
        bucket[row.source] = row;
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
    const built = buildDropV2Set(set, ledger, radarPayload.generatedAt, {
      crawls: crawlsBySet.get(set.id),
      referenceByNumber: referencesBySet.get(set.id),
      boosterMarketHistory: buildBoosterMarketHistory(
        cardmarketHistoryBySet.get(set.id) ?? [],
        marketplaceHistory.snapshots?.[set.id] ?? [],
        radarPayload.generatedAt,
      ),
    });
    if (built) sets.push(built);
  }

  const artifact = {
    generatedAt: radarPayload.generatedAt,
    modelVersion: DROP_V2_MODEL_VERSION,
    definition: {
      languageDoctrine:
        "cotations françaises uniquement : eBay.fr (aspect Langue, état sous EX écarté au matching) + CardTrader restreint aux annonces FR — jamais de toutes-langues",
      conditions: [...FRESH_PULL_CONDITIONS],
      priceGrain: "minimum par vendeur, puis médiane et p10 entre vendeurs",
      minimumOffers: MIN_OFFERS,
      minimumSellers: MIN_SELLERS,
      maximumAgeDays: MAX_AGE_DAYS,
      minimumReferenceRatio: MIN_REFERENCE_RATIO,
      maximumReferenceRatio: MAX_REFERENCE_RATIO,
      fees: DEFAULT_FEES,
      bulkThreshold: DEFAULT_BULK_THRESHOLD,
    },
    sets,
  };
  await writeFile(join(root, "public", "drop-rate-v2.json"), `${JSON.stringify(artifact, null, 2)}\n`);
  return artifact;
}
