// Artefact public du tracker de cartes.
//
// Il ne fabrique aucun « prix marché » global : le guide Cardmarket reste un
// repère européen distinct, tandis que les offres françaises EX+ issues du
// ledger sont résumées au grain vendeur. Les annonces brutes restent dans le
// ledger ; seules quelques preuves publiques sans identifiant vendeur sortent
// dans l'artefact de consultation.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SETS } from "./sets.mjs";
import { normalizeCollectorNumber } from "./identifiers.mjs";
import { FRESH_PULL_CONDITIONS, quantile } from "./drop-v2.mjs";

export const CARD_TRACKER_MODEL_VERSION = "card-tracker-beta.4";

const round2 = (value) => Number(value.toFixed(2));

// Même vocabulaire que le reste du site (drop v2, taux) : élevée/moyenne/faible.
function confidenceOf(offers, sellers) {
  if (offers >= 10 && sellers >= 5) return "élevée";
  if (offers >= 5 && sellers >= 3) return "moyenne";
  return "faible";
}

function setAliases(set) {
  return [...new Set([
    set.id,
    set.name,
    set.nameEN,
    set.ptcg,
    set.tcgdex,
    set.cardtrader,
  ].filter(Boolean).map(String))];
}

function latestCrawls(manifest) {
  const result = new Map();
  for (const line of manifest.split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (row.type !== "crawl" || !row.subject?.startsWith("card:")) continue;
    if (row.source !== "ebay" && row.source !== "cardtrader") continue;
    const key = `${row.set}:${row.subject}:${row.source}`;
    const current = result.get(key);
    if (!current || String(row.observed_at ?? row.date) > String(current.observed_at ?? current.date)) {
      result.set(key, row);
    }
  }
  return result;
}

// Doctrine de langue du site : le français quand la série existe en français,
// le japonais quand elle n'existe QU'en japonais. Exiger « fr » sur un set
// japonais jetait tout son marché légitime (vécu : Gengar 071 de Shiny Star V
// — 16 annonces jp Near Mint écartées, la cotation retombait sur 3 annonces
// eBay dont deux d'autres cartes).
function included(row, source, language) {
  return row.source === source &&
    row.matching === "exact" &&
    row.integrity !== "high_risk" &&
    !row.graded &&
    !row.on_vacation &&
    Number(row.price_last) > 0 &&
    (source === "ebay" || (row.language === language && FRESH_PULL_CONDITIONS.has(row.condition)));
}

function summarize(rows, source, crawl, { language = "fr", evidenceLimit = 6 } = {}) {
  const sourceRows = rows.filter((row) => row.source === source);
  if (!sourceRows.length) return null;
  const fallbackDate = sourceRows.map((row) => row.last_seen).filter(Boolean).sort().at(-1) ?? null;
  const windowDate = crawl?.date ?? fallbackDate;
  if (!windowDate) return null;
  if (crawl && (crawl.status !== "ok" || crawl.complete !== true)) return null;

  const observed = sourceRows.filter((row) => row.last_seen === windowDate);
  const retained = observed.filter((row) => included(row, source, language));
  if (!retained.length) return null;

  const bySeller = new Map();
  for (const row of retained) {
    const key = row.seller_id ? `${source}:${row.seller_id}` : `${source}:${row.url ?? row.title ?? row.price_last}`;
    const current = bySeller.get(key);
    if (!current || Number(row.price_last) < Number(current.price_last)) bySeller.set(key, row);
  }
  const sellerRows = [...bySeller.values()];
  const prices = sellerRows.map((row) => Number(row.price_last));
  const median = quantile(prices, 0.5);
  const floor10 = quantile(prices, 0.1);
  // Ce qu'on paie vraiment se lit EN BAS du carnet, pas au milieu : sur un
  // marché profond la médiane des demandes vit loin au-dessus du prix
  // transactable (vécu : médiane 27,70 € quand la carte s'achetait à 12 €).
  const bestAsk = Math.min(...prices);
  const excluded = observed.filter((row) => !included(row, source, language)).length;
  return {
    source,
    priceType: "active_ask",
    language,
    conditionScope: "EX+",
    median: round2(median),
    floor10: round2(floor10),
    bestAsk: round2(bestAsk),
    offers: retained.length,
    sellers: sellerRows.length,
    trusted: retained.filter((row) => row.integrity === "trusted").length,
    review: retained.filter((row) => row.integrity === "review").length,
    excluded,
    latestSeen: windowDate,
    complete: crawl ? crawl.complete === true : null,
    confidence: confidenceOf(retained.length, sellerRows.length),
    _prices: prices,
    evidence: sellerRows
      .sort((a, b) => Number(a.price_last) - Number(b.price_last))
      .slice(0, evidenceLimit)
      .map((row) => ({
        title: row.title ?? null,
        url: row.url ?? null,
        price: round2(Number(row.price_last)),
        condition: row.condition ?? null,
        trust: row.integrity === "trusted" ? "trusted" : "review",
      })),
  };
}

function combine(summaries, language = "fr") {
  const available = summaries.filter(Boolean);
  if (!available.length) return null;
  const evidence = available.flatMap((summary) => summary.evidence);
  const prices = available.flatMap((summary) => summary._prices);
  const offers = available.reduce((sum, row) => sum + row.offers, 0);
  const sellers = available.reduce((sum, row) => sum + row.sellers, 0);
  return {
    source: "combined",
    priceType: "active_ask",
    language,
    conditionScope: "EX+",
    median: round2(quantile(prices, 0.5)),
    floor10: round2(quantile(prices, 0.1)),
    bestAsk: round2(Math.min(...prices)),
    offers,
    sellers,
    trusted: available.reduce((sum, row) => sum + row.trusted, 0),
    review: available.reduce((sum, row) => sum + row.review, 0),
    excluded: available.reduce((sum, row) => sum + row.excluded, 0),
    latestSeen: available.map((row) => row.latestSeen).sort().at(-1),
    complete: available.every((row) => row.complete === true) ? true : available.some((row) => row.complete === false) ? false : null,
    confidence: confidenceOf(offers, sellers),
    evidence: evidence.sort((a, b) => a.price - b.price).slice(0, 8),
  };
}

function publicSummary(summary) {
  if (!summary) return null;
  const { _prices, ...safe } = summary;
  void _prices;
  return safe;
}

function historyOf(rows) {
  const byDate = new Map();
  for (const row of rows) {
    if (row.matching !== "exact" || row.integrity === "high_risk" || row.graded || row.on_vacation) continue;
    for (const event of row.history ?? []) {
      if (event.legacy_compacted || !(Number(event.p) > 0)) continue;
      if (event.matching !== "exact" || event.integrity === "high_risk" || event.graded || event.on_vacation) continue;
      if (row.source === "cardtrader" && (event.language !== "fr" || !FRESH_PULL_CONDITIONS.has(event.condition))) continue;
      if (!byDate.has(event.d)) byDate.set(event.d, { sellers: new Map(), listings: new Set() });
      const bucket = byDate.get(event.d);
      const seller = event.seller_id ? `${row.source}:${event.seller_id}` : `${row.source}:${row.url ?? row.title ?? event.p}`;
      const listing = `${row.source}:${row.url ?? row.title ?? seller}`;
      bucket.listings.add(listing);
      const current = bucket.sellers.get(seller);
      if (current == null || Number(event.p) < current) bucket.sellers.set(seller, Number(event.p));
    }
  }
  return [...byDate.entries()]
    .map(([date, bucket]) => {
      const prices = [...bucket.sellers.values()];
      return {
        date,
        median: round2(quantile(prices, 0.5)),
        floor10: round2(quantile(prices, 0.1)),
        offers: bucket.listings.size,
        sellers: bucket.sellers.size,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-365);
}

function imageMapFromRadar(radar) {
  const result = new Map();
  for (const set of radar.sets ?? []) {
    for (const card of set.picks ?? []) {
      if (card.id && card.image) result.set(card.id, card.image);
    }
    for (const card of [set.bestCard, ...(set.podium ?? [])].filter(Boolean)) {
      if (!card.image) continue;
      result.set(`${set.id}:${normalizeCollectorNumber(card.number)}`, card.image);
    }
  }
  return result;
}

export async function buildCardTrackerArtifact(root, radarPayload = null) {
  const radar = radarPayload ?? JSON.parse(await readFile(join(root, "public", "radar-data.json"), "utf8"));
  const index = JSON.parse(await readFile(join(root, "public", "cards-index.json"), "utf8"));
  let manifest = "";
  try {
    manifest = await readFile(join(root, "data", "ledger", "_manifest.jsonl"), "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const crawls = latestCrawls(manifest);
  const setById = new Map(SETS.map((set) => [set.id, set]));
  const imageMap = imageMapFromRadar(radar);
  const markets = {};
  let gradeObservations = [];
  try {
    const gradeStore = JSON.parse(await readFile(join(root, "data", "manual-card-grades.json"), "utf8"));
    if (gradeStore.schemaVersion !== 1 || !Array.isArray(gradeStore.observations)) throw new Error("schéma manual-card-grades invalide");
    gradeObservations = gradeStore.observations;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const gradesByCard = new Map();
  for (const row of gradeObservations) {
    if (!row.cardId || row.company !== "PSA" || !(Number(row.grade) > 0) || !row.observedAt) continue;
    if (!gradesByCard.has(row.cardId)) gradesByCard.set(row.cardId, {});
    gradesByCard.get(row.cardId)[`PSA:${Number(row.grade)}`] = {
      company: "PSA",
      grade: Number(row.grade),
      soldMedian90: Number(row.soldMedian90) > 0 ? round2(Number(row.soldMedian90)) : null,
      lastSold: Number(row.lastSold) > 0 ? round2(Number(row.lastSold)) : null,
      sales90: Math.max(0, Number(row.sales90) || 0),
      population: Number.isFinite(Number(row.population)) ? Number(row.population) : null,
      populationHigher: Number.isFinite(Number(row.populationHigher)) ? Number(row.populationHigher) : null,
      observedAt: row.observedAt,
      priceSource: row.priceSource ?? null,
    };
  }

  for (const set of SETS) {
    let ledger = { listings: {} };
    try {
      ledger = JSON.parse(await readFile(join(root, "data", "ledger", `${set.id}.json`), "utf8"));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    const bySubject = new Map();
    for (const row of Object.values(ledger.listings ?? {})) {
      if (!row.subject?.startsWith("card:")) continue;
      if (!bySubject.has(row.subject)) bySubject.set(row.subject, []);
      bySubject.get(row.subject).push(row);
    }
    for (const [subject, rows] of bySubject) {
      const normalized = subject.slice(5);
      const candidates = index.cards.filter((card) => card.s === set.id && normalizeCollectorNumber(card.num) === normalized);
      for (const card of candidates) {
        const language = set.jpOnly ? "jp" : "fr";
        const ebay = summarize(rows, "ebay", crawls.get(`${set.id}:${subject}:ebay`), { language });
        const cardtrader = summarize(rows, "cardtrader", crawls.get(`${set.id}:${subject}:cardtrader`), { language });
        markets[card.i] = {
          rawFR: combine([ebay, cardtrader], language),
          ebayFR: publicSummary(ebay),
          cardTraderFR: publicSummary(cardtrader),
          history: historyOf(rows),
          grades: gradesByCard.get(card.i) ?? {},
        };
      }
    }
  }

  // Une carte peut avoir une observation PSA avant que son marché raw ne soit
  // suivi dans le ledger : elle mérite tout de même une entrée marché.
  for (const [cardId, grades] of gradesByCard) {
    if (!markets[cardId]) markets[cardId] = { rawFR: null, ebayFR: null, cardTraderFR: null, history: [], grades };
  }

  // Repère Cardmarket carte par carte (guide public) : le carnet le plus
  // profond du marché, absent de nos cotations. Jamais fusionné — c'est un
  // contrepoint, toutes conditions et toutes langues confondues.
  let cardmarketByCard = {};
  try {
    const file = JSON.parse(await readFile(join(root, "data", "cardmarket", "singles-prices.json"), "utf8"));
    cardmarketByCard = file.prices ?? {};
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  for (const [cardId, guide] of Object.entries(cardmarketByCard)) {
    if (!markets[cardId]) markets[cardId] = { rawFR: null, ebayFR: null, cardTraderFR: null, history: [], grades: {} };
    markets[cardId].cardmarketGuide = guide;
  }

  const artifact = {
    generatedAt: index.generatedAt ?? radar.generatedAt,
    modelVersion: CARD_TRACKER_MODEL_VERSION,
    definitions: {
      identityGrain: "set + numéro de collection + langue + variante ; le nom français/anglais est un alias de recherche",
      rawPrice: "offres actives EX+ dans la langue du set (français, ou japonais si la série n'existe qu'en japonais) ; médiane et p10 avec une voix par vendeur et par source",
      history: "instantanés quotidiens du ledger uniquement ; une sortie d'annonce n'est jamais assimilée à une vente",
      cardmarketGuide: "repère produit Cardmarket (guide public) : « le moins cher » toutes conditions et toutes langues, tendance des ventes — jamais fusionné avec nos cotations EX+ par langue",
      grades: "prix et populations PSA séparés par grade ; aucune estimation n'est publiée sans source carte-niveau autorisée",
    },
    sets: Object.fromEntries(SETS.map((set) => [set.id, {
      nameFR: set.name,
      nameEN: set.nameEN,
      japanese: Boolean(set.jpOnly),
      aliases: setAliases(set),
    }])),
    cards: index.cards.map((card) => {
      const set = setById.get(card.s);
      return {
        id: card.i,
        nameEN: card.n,
        nameFR: card.f ?? null,
        number: card.num,
        rarity: card.r ?? null,
        setId: card.s,
        image: card.im ?? imageMap.get(card.i) ?? imageMap.get(`${card.s}:${normalizeCollectorNumber(card.num)}`) ?? null,
        reference: {
          source: set?.jpOnly ? "cardtrader_floor" : "cardmarket_guide",
          price: Number(card.p),
          avg30: Number(card.a30) > 0 ? Number(card.a30) : null,
          avg7: Number(card.a7) > 0 ? Number(card.a7) : null,
          avg1: Number(card.a1) > 0 ? Number(card.a1) : null,
          currency: "EUR",
        },
      };
    }),
    markets,
    sources: [
      { id: "ebay", label: "eBay.fr", status: "active", role: "offres actives FR EX+", limit: "Browse ne confirme pas les ventes terminées" },
      { id: "cardmarket", label: "Cardmarket", status: "active", role: "repère européen", limit: "guide agrégé, pas une vente FR EX+ carte par carte" },
      { id: "cardtrader", label: "CardTrader", status: "active", role: "offres actives FR EX+", limit: "marché français parfois très mince" },
      { id: "tcgplayer", label: "TCGplayer", status: "blocked", role: "repère US/EN", limit: "accès API existant requis" },
      { id: "leboncoin", label: "Leboncoin", status: "blocked", role: "offres actives FR", limit: "pas de collecte automatisée sans autorisation" },
      { id: "psa", label: "PSA", status: "partial", role: "prix et population par grade", limit: "source carte-niveau autorisée à connecter" },
    ],
  };
  // Découpage pour le client : un index de recherche léger (ni image, ni
  // référence détaillée, ni preuves — ~5× plus petit que le monolithe) et un
  // fichier de détail PAR SET chargé à la sélection. Le monolithe de 2,9 Mo
  // pénalisait chaque visite pour servir 13 % de cartes cotées.
  const indexArtifact = {
    generatedAt: artifact.generatedAt,
    modelVersion: artifact.modelVersion,
    definitions: artifact.definitions,
    sources: artifact.sources,
    sets: artifact.sets,
    cards: artifact.cards.map((card) => ({
      id: card.id,
      nameEN: card.nameEN,
      nameFR: card.nameFR,
      number: card.number,
      rarity: card.rarity,
      setId: card.setId,
      price: card.reference.price,
      followed: Boolean(artifact.markets[card.id]?.rawFR),
    })),
  };
  await writeFile(join(root, "public", "card-tracker-index.json"), `${JSON.stringify(indexArtifact)}\n`);

  await mkdir(join(root, "public", "card-tracker"), { recursive: true });
  for (const set of SETS) {
    const detail = { generatedAt: artifact.generatedAt, cards: {}, markets: {} };
    for (const card of artifact.cards) {
      if (card.setId !== set.id) continue;
      detail.cards[card.id] = { image: card.image, reference: card.reference };
      if (artifact.markets[card.id]) detail.markets[card.id] = artifact.markets[card.id];
    }
    await writeFile(join(root, "public", "card-tracker", `${set.id}.json`), `${JSON.stringify(detail)}\n`);
  }
  return artifact;
}
