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

export const CARD_TRACKER_MODEL_VERSION = "card-tracker-beta.8";

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

// Toutes les journées de crawl COMPLET par (set, sujet, source) : la fenêtre
// dans laquelle une disparition est interprétable.
export function completeCrawlDays(manifest) {
  const result = new Map();
  for (const line of manifest.split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (row.type !== "crawl" || !row.subject?.startsWith("card:")) continue;
    if (row.status !== "ok" || row.complete !== true) continue;
    const key = `${row.set}:${row.subject}:${row.source}`;
    if (!result.has(key)) result.set(key, new Set());
    result.get(key).add(row.date);
  }
  return result;
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

// Doctrine de langue, mot pour mot : la carte en FRANÇAIS ; en JAPONAIS si et
// seulement si elle n'existe pas en français — et l'existence parallèle de
// versions coréennes ou chinoises n'y change rien. Ces marchés ne sont pas le
// nôtre : leurs annonces sont collectées et conservées (savoir qu'elles
// existent a de la valeur), mais leur prix ne cote jamais.
//
// Exiger « fr » sur une impression japonaise jetait tout son marché légitime
// (vécu : Gengar 071 de Shiny Star V — 16 annonces jp Near Mint écartées, la
// cotation retombait sur 3 annonces eBay dont deux d'autres cartes).
export function isQuotable(row, source, language) {
  return row.source === source &&
    row.matching === "exact" &&
    row.integrity !== "high_risk" &&
    !row.graded &&
    !row.on_vacation &&
    Number(row.price_last) > 0 &&
    (source === "ebay" || (row.language === language && FRESH_PULL_CONDITIONS.has(row.condition)));
}

// Les annonces gradées sont capturées par nos requêtes puis écartées des prix
// bruts (autre marché). Elles restent dans le ledger : elles constituent, sans
// un appel de plus, un carnet de DEMANDES par grade. Ce ne sont pas des ventes
// conclues — la nuance est portée jusqu'à l'écran.
const GRADE_PATTERNS = [
  /\b(psa|pca|cgc|bgs|sgc|ace|cga|collectaura)\s*\.?\s*(10|9[.,]5|9|8[.,]5|8|7)\b/i,
  /\b(psa|pca|cgc|bgs|sgc)\s*gem\s*(?:mint|mt)\s*(10)\b/i,
];

export function parseGradeFromTitle(title) {
  const raw = String(title ?? "");
  for (const pattern of GRADE_PATTERNS) {
    const match = raw.match(pattern);
    if (match) {
      const company = match[1].toUpperCase() === "COLLECTAURA" ? "CollectAura" : match[1].toUpperCase();
      return { company, grade: Number(match[2].replace(",", ".")) };
    }
  }
  return null;
}

/**
 * Demandes gradées d'une carte, à partir des annonces déjà au ledger.
 * On ne retient que celles dont le SEUL défaut d'appariement est le grading :
 * une annonce qui rate aussi le numéro décrit une autre carte.
 */
function gradedAsksOf(rows, windowDate) {
  const byGrade = new Map();
  for (const row of rows) {
    if (row.source !== "ebay" || row.integrity === "high_risk") continue;
    const reasons = row.matching_reasons ?? [];
    if (reasons.length !== 1 || reasons[0] !== "produit_grade") continue;
    if (windowDate && row.last_seen !== windowDate) continue;
    const parsed = parseGradeFromTitle(row.title);
    if (!parsed || !(Number(row.price_last) > 0)) continue;
    const key = `${parsed.company}:${parsed.grade}`;
    if (!byGrade.has(key)) byGrade.set(key, { ...parsed, rows: new Map() });
    // Une voix par vendeur, son offre la moins chère.
    const bucket = byGrade.get(key).rows;
    const sellerKey = row.seller_id ? `s:${row.seller_id}` : `l:${row.url ?? row.title}`;
    const current = bucket.get(sellerKey);
    if (!current || Number(row.price_last) < Number(current.price_last)) bucket.set(sellerKey, row);
  }
  const result = {};
  for (const [key, bucket] of byGrade) {
    const sellerRows = [...bucket.rows.values()].sort((a, b) => Number(a.price_last) - Number(b.price_last));
    const prices = sellerRows.map((row) => Number(row.price_last));
    result[key] = {
      company: bucket.company,
      grade: bucket.grade,
      priceType: "active_ask",
      bestAsk: round2(prices[0]),
      median: round2(quantile(prices, 0.5)),
      offers: sellerRows.length,
      sellers: sellerRows.length,
      confidence: confidenceOf(sellerRows.length, sellerRows.length),
      evidence: sellerRows.slice(0, 3).map((row) => ({
        title: row.title ?? null,
        url: row.url ?? null,
        price: round2(Number(row.price_last)),
        condition: null,
        trust: row.integrity === "trusted" ? "trusted" : "review",
      })),
    };
  }
  return result;
}

// Rotation du carnet — notre réponse au manque de ventes conclues.
//
// L'API eBay publique n'expose que des annonces actives ; les ventes passent
// par Marketplace Insights, en accès restreint. Mais nous suivons chaque
// annonce par son identifiant : quand elle disparaît d'un crawl COMPLET, on
// connaît son dernier prix et son temps de présence. Une sortie n'est PAS une
// vente (retrait, expiration, remise en ligne) — d'où la déduction des
// remises en ligne probables, repérées par signature vendeur+titre, et le
// vocabulaire « sortie », jamais « vente ».
function flowOf(rows, completeDates) {
  const days = [...new Set(completeDates)].sort();
  if (days.length < 2) return null;
  const last = days.at(-1);
  const dayCount = (from, to) =>
    Math.max(1, Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1);

  const active = rows.filter((row) => row.last_seen === last);
  const exited = rows.filter((row) => row.last_seen < last);
  // Une annonce ressortie sous un nouvel identifiant chez le même vendeur,
  // avec le même titre : remise en ligne, pas sortie de marché.
  const activeSignatures = new Set(active.map((row) => row.relist_signature).filter(Boolean));
  const likelyRelists = exited.filter((row) => row.relist_signature && activeSignatures.has(row.relist_signature));
  const adjusted = exited.filter((row) => !likelyRelists.includes(row));
  const exitPrices = adjusted.map((row) => Number(row.price_last)).filter((value) => value > 0);
  const listedDays = adjusted.map((row) => dayCount(row.first_seen, row.last_seen));

  return {
    observedSince: days[0],
    observedDays: days.length,
    // Un carnet qui passe de N annonces à zéro relève presque toujours de la
    // variance de recherche eBay, pas d'un marché qui se vide : la rotation
    // n'est pas publiable ce jour-là.
    suspectEmptyCrawl: active.length === 0 && exited.length > 0,
    active: active.length,
    exits: exited.length,
    likelyRelists: likelyRelists.length,
    adjustedExits: adjusted.length,
    exitPriceMedian: exitPrices.length ? round2(quantile(exitPrices, 0.5)) : null,
    exitPriceRange: exitPrices.length ? [round2(Math.min(...exitPrices)), round2(Math.max(...exitPrices))] : null,
    medianDaysListed: listedDays.length ? Math.round(quantile(listedDays, 0.5)) : null,
  };
}

function summarize(rows, source, crawl, { language = "fr", evidenceLimit = 6 } = {}) {
  const sourceRows = rows.filter((row) => row.source === source);
  if (!sourceRows.length) return null;
  const fallbackDate = sourceRows.map((row) => row.last_seen).filter(Boolean).sort().at(-1) ?? null;
  const windowDate = crawl?.date ?? fallbackDate;
  if (!windowDate) return null;
  if (crawl && (crawl.status !== "ok" || crawl.complete !== true)) return null;

  const observed = sourceRows.filter((row) => row.last_seen === windowDate);
  const retained = observed.filter((row) => isQuotable(row, source, language));
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
  // L'offre la moins chère peut venir de loin : le port et le pays décident
  // si « 20,11 € » est vraiment moins cher que « 30 € expédié de France ».
  const cheapestRow = sellerRows.reduce((best, row) =>
    Number(row.price_last) < Number(best.price_last) ? row : best,
  );
  const excluded = observed.filter((row) => !isQuotable(row, source, language)).length;
  return {
    source,
    priceType: "active_ask",
    language,
    conditionScope: "EX+",
    median: round2(median),
    floor10: round2(floor10),
    bestAsk: round2(bestAsk),
    bestAskShipping: cheapestRow.shipping != null ? round2(Number(cheapestRow.shipping)) : null,
    bestAskCountry: cheapestRow.country ?? null,
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
        shipping: row.shipping != null ? round2(Number(row.shipping)) : null,
        country: row.country ?? null,
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
    bestAskShipping: (available.find((row) => row.bestAsk === Math.min(...available.map((entry) => entry.bestAsk))) ?? {}).bestAskShipping ?? null,
    bestAskCountry: (available.find((row) => row.bestAsk === Math.min(...available.map((entry) => entry.bestAsk))) ?? {}).bestAskCountry ?? null,
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
  const completeDays = completeCrawlDays(manifest);
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
          flow: flowOf(
            rows,
            [
              ...(completeDays.get(`${set.id}:${subject}:ebay`) ?? []),
              ...(completeDays.get(`${set.id}:${subject}:cardtrader`) ?? []),
            ],
          ),
          gradedAsks: gradedAsksOf(rows, crawls.get(`${set.id}:${subject}:ebay`)?.date ?? null),
          grades: gradesByCard.get(card.i) ?? {},
        };
      }
    }
  }

  // Une carte peut avoir une observation PSA avant que son marché raw ne soit
  // suivi dans le ledger : elle mérite tout de même une entrée marché.
  for (const [cardId, grades] of gradesByCard) {
    if (!markets[cardId]) markets[cardId] = { rawFR: null, ebayFR: null, cardTraderFR: null, history: [], gradedAsks: {}, grades };
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
    if (!markets[cardId]) markets[cardId] = { rawFR: null, ebayFR: null, cardTraderFR: null, history: [], gradedAsks: {}, grades: {} };
    markets[cardId].cardmarketGuide = guide;
  }

  const artifact = {
    generatedAt: index.generatedAt ?? radar.generatedAt,
    modelVersion: CARD_TRACKER_MODEL_VERSION,
    definitions: {
      identityGrain: "set + numéro de collection + langue + variante ; le nom français/anglais est un alias de recherche",
      rawPrice: "offres actives EX+ chez un vendeur de la zone d'achat (FR, BE, IT, ES, GB), dans la langue de la carte : français, ou japonais si et seulement si la carte n'existe pas en français. Le coréen et le chinois sont collectés mais ne cotent jamais — ce n'est pas notre marché. Médiane et p10 avec une voix par vendeur et par source.",
      history: "instantanés quotidiens du ledger uniquement ; une sortie d'annonce n'est jamais assimilée à une vente",
      cardmarketGuide: "repère produit Cardmarket (guide public) : « le moins cher » toutes conditions et toutes langues, tendance des ventes — jamais fusionné avec nos cotations EX+ par langue",
      flow: "rotation du carnet : annonces entrées et sorties entre deux crawls complets, remises en ligne probables déduites par signature vendeur+titre — une sortie n'est jamais assimilée à une vente",
      gradedAsks: "demandes actives par maison de gradation et par grade, relevées sur eBay.fr — des prix demandés, jamais des ventes conclues, et un marché distinct de la carte brute",
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

  // Résumé du ledger : la page Marché s'en contente. Lui faire parcourir les
  // 174 Mo du journal au moment du build faisait tomber Vercel (2 cœurs,
  // 8 Go, 9 workers en parallèle) — un artefact de 30 lignes remplace ça.
  const summary = { generatedAt: artifact.generatedAt, sets: {} };
  for (const set of SETS) {
    let store = { listings: {} };
    try {
      store = JSON.parse(await readFile(join(root, "data", "ledger", `${set.id}.json`), "utf8"));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      continue;
    }
    const rows = Object.values(store.listings ?? {});
    const reasons = {};
    let highRisk = 0;
    for (const row of rows) {
      if (row.matching === "exact" && row.integrity === "high_risk") {
        highRisk++;
        for (const reason of row.integrity_reasons ?? []) reasons[reason] = (reasons[reason] ?? 0) + 1;
      }
    }
    summary.sets[set.id] = {
      tracked: rows.length,
      sealed: rows.filter((row) => String(row.subject ?? "").startsWith("sealed")).length,
      cards: rows.filter((row) => String(row.subject ?? "").startsWith("card:")).length,
      highRisk,
      since: rows.reduce((min, row) => (min == null || row.first_seen < min ? row.first_seen : min), null),
      reasons,
    };
  }
  await writeFile(join(root, "public", "ledger-summary.json"), `${JSON.stringify(summary)}\n`);

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
