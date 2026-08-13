// Source eBay Browse API : annonces actives sur eBay.fr.
//
// C'est la pièce qui manquait à CardTrader : le marché FRANÇAIS. On y lit des
// prix demandés — comme partout ailleurs — mais dans la bonne langue et avec
// la profondeur d'offre du premier marché généraliste.
//
// Rien n'est supprimé : chaque annonce observée est CLASSIFIÉE (matching
// produit, puis intégrité) et versée au ledger. Les métriques se calculent
// sur la population RETENUE (trusted + review) ; high_risk est exclue mais
// tracée. Les classifieurs sont des fonctions pures exportées : les fixtures
// de scripts/tests/integrity.test.mjs les tiennent sur les faux positifs
// réellement observés (booster gradé CA 9, mini-tin, tripack d'un set voisin).
//
// Authentification : OAuth « client credentials ». Pas d'utilisateur, pas de
// consentement — l'application échange son couple App ID / Cert ID contre un
// jeton d'application valable 2 h, portée basique `api_scope`, suffisante
// pour Browse. Le jeton est mis en cache et renouvelé avant expiration.

import { assessIntegrity, preliminaryReference } from "./integrity.mjs";
import { normalizeCollectorNumber } from "./identifiers.mjs";

const AUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const BROWSE_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";

let cachedToken = null; // { value, expiresAt }

function credentials() {
  const id = process.env.EBAY_CLIENT_ID;
  const secret = process.env.EBAY_CLIENT_SECRET;
  if (!id || !secret) throw new Error("EBAY_CLIENT_ID / EBAY_CLIENT_SECRET manquants");
  return Buffer.from(`${id}:${secret}`).toString("base64");
}

async function applicationToken() {
  // Marge de 5 minutes : un jeton qui expire en vol ferait échouer la requête
  // en cours pour rien.
  if (cachedToken && Date.now() < cachedToken.expiresAt - 300_000) return cachedToken.value;

  const response = await fetch(AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials()}`,
    },
    body: "grant_type=client_credentials&scope=" + encodeURIComponent("https://api.ebay.com/oauth/api_scope"),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`OAuth eBay: HTTP ${response.status} — ${(await response.text()).slice(0, 200)}`);
  }
  const payload = await response.json();
  cachedToken = { value: payload.access_token, expiresAt: Date.now() + payload.expires_in * 1000 };
  return cachedToken.value;
}

async function browse(params, tries = 3) {
  const token = await applicationToken();
  const url = `${BROWSE_URL}?${new URLSearchParams(params)}`;
  let lastError;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          // Le marché cible : prix en EUR, annonces localisées France.
          "X-EBAY-C-MARKETPLACE-ID": "EBAY_FR",
          "Accept-Language": "fr-FR",
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return response.json();
      lastError = new Error(`HTTP ${response.status}`);
      if (response.status === 429) await new Promise((r) => setTimeout(r, 3000 * attempt));
    } catch (error) {
      lastError = error;
    }
    if (attempt < tries) await new Promise((r) => setTimeout(r, 1200 * attempt));
  }
  throw new Error(`Browse eBay: ${lastError?.message}`);
}

// Pagination avec aveu de complétude : les flux du ledger (entrées/sorties
// d'annonces) ne sont interprétables que sur une capture COMPLÈTE — une
// annonce qui glisse hors d'une fenêtre « best match » ressemblerait à une
// sortie de marché. `complete` dit la vérité ; le manifeste de crawl la
// consigne, et les futurs flux ne compteront que les jours complets.
async function browseAll(params, maxPages) {
  const items = [];
  let total = 0;
  let pages = 0;
  for (let page = 0; page < maxPages; page++) {
    const payload = await browse({ ...params, limit: "200", offset: String(page * 200) });
    pages++;
    total = payload.total ?? 0;
    const batch = payload.itemSummaries ?? [];
    items.push(...batch);
    if (items.length >= total || batch.length < 200) break;
  }
  return { items, total, pages, complete: items.length >= total };
}

// Observation brute d'une annonce, prête pour le ledger.
// « Livrable en France » plutôt que « vendeur en France » : sur les cartes
// japonaises, la seconde formulation nous coupait du marché (1 offre à 30 €
// au lieu de 3, dont une à 20,11 € expédiée du Japon). La contrepartie est
// qu'une offre lointaine porte des frais de port et parfois des droits : on
// capture le port et le pays pour que l'écran puisse le dire.
function observationOf(item) {
  const shipping = (item.shippingOptions ?? []).find((option) => option.shippingCost?.value != null);
  return {
    shipping: shipping ? Number(shipping.shippingCost.value) : null,
    country: item.itemLocation?.country ?? null,
    id: item.itemId,
    title: item.title ?? null,
    url: item.itemWebUrl ?? null,
    price: Number(item.price?.value) || 0,
    currency: item.price?.currency ?? "EUR",
    sellerId: item.seller?.username ?? null,
    sellerScore: item.seller?.feedbackScore != null ? Number(item.seller.feedbackScore) : null,
    sellerPct: item.seller?.feedbackPercentage != null ? Number(item.seller.feedbackPercentage) : null,
    condition: item.conditionId ?? item.condition ?? null,
  };
}

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * q;
  const lo = Math.floor(position);
  const hi = Math.ceil(position);
  if (lo === hi) return Number(sorted[lo].price.value);
  const weight = position - lo;
  return Number(sorted[lo].price.value) * (1 - weight) + Number(sorted[hi].price.value) * weight;
}

export function summarize(items) {
  const sorted = items
    .filter((item) => Number(item.price?.value) > 0)
    .sort((a, b) => Number(a.price.value) - Number(b.price.value));
  if (!sorted.length) return { price: null, priceUrl: null, floor10: null, floor10Url: null, median: null, offers: 0, sellers: 0 };
  const p10Value = quantile(sorted, 0.1);
  const p10 = sorted.reduce((best, item) =>
    Math.abs(Number(item.price.value) - p10Value) < Math.abs(Number(best.price.value) - p10Value) ? item : best,
  );
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2
    ? Number(sorted[middle].price.value)
    : (Number(sorted[middle - 1].price.value) + Number(sorted[middle].price.value)) / 2;
  return {
    price: Number(sorted[0].price.value),
    // Lien vers l'annonce réelle : un prix affiché doit être vérifiable en un clic.
    priceUrl: sorted[0].itemWebUrl ?? null,
    // Le 10e centile décrit mieux le prix réellement payable que le plancher
    // brut, manipulable par une annonce fantaisiste.
    floor10: Number(p10Value.toFixed(2)),
    floor10Url: p10.itemWebUrl ?? null,
    median: Number(median.toFixed(2)),
    offers: sorted.length,
    sellers: new Set(sorted.map((item) => item.seller?.username).filter(Boolean)).size,
    sampleSufficient: sorted.length >= 10,
  };
}

// ---------------------------------------------------------------------------
// Identité produit — classifieurs purs.
//
// L'intégrité ne peut pas réparer une population qui compare des produits
// différents : le matching est le rempart n°1. Vécu, dans l'ordre : plancher
// 151 à 1,49 € (un Leveinard holo en catégorie scellée), booster chinois à
// 5,99 €, « Pack Loisir » de 3 cartes, mini-tins à 69 €, boosters gradés
// CA 9/10 à 45-120 €, et tripacks d'Ultra-Prisme comptés dans Soleil & Lune.
// ---------------------------------------------------------------------------

// Diacritiques et esperluettes : « Évolution Céleste » doit matcher
// « evolution celeste » — les vendeurs écrivent les deux.
export const normalizeTitle = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s*&\s*/g, " et ")
    .replace(/[-'’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// « Pack loisir » / « échantillon » : pochettes promotionnelles de 3 cartes.
// Tins, tripacks, duopacks, decks : d'autres produits, d'autres prix.
const NOISE =
  /display|coffret|lot\b|artset|art set|kit|code|avant.premi|ouvert|vide|empty|présentoir|pack loisir|booster loisir|[ée]chantillon|\btins?\b|mini.?tin|tri.?pack|duo.?pack|\bdecks?\b|portfolio|classeur|jumbo|bundle|collection|premium|\bspc\b|surprise|pochette|classeur/i;
// Booster gradé (CA/PSA…) : un objet de collection scellé-noté, pas le
// produit qu'on ouvre — son prix contaminerait la référence et ferait passer
// les vrais boosters pour des anomalies basses.
const GRADED = /grad[ée]|grading|\b(?:psa|pca|bgs|cgc)\s*[\d.,]*|\bca\s?[\d.,]+|slab/i;
// Cartes à l'unité égarées dans la catégorie scellée : « Carte Pokemon X » au
// singulier, ou un numéro de collection XXX/YYY dans le titre.
const SINGLE_IN_SEALED = /(?:^|[^a-zà-ÿ])carte\s|\b\d{1,3}\/\d{2,3}\b/i;
// Le marché des produits japonais vendus en France est pollué par des boosters
// coréens ou chinois visuellement identiques.
const NOT_JAPANESE = /cor[ée]en|korean|chinois|chinese|carte pok|card\b/i;
// « 5 Booster Pokémon… » : une quantité ≥ 2 devant « booster » signale un lot.
const MULTIPACK = /\b([2-9]|\d{2,})\s*x?\s*boosters?\b|\bx\s*([2-9]|\d{2,})\b/i;

/**
 * Matching d'une annonce scellée. Pur : (title, ctx) → motifs de rejet.
 * L'identité exige la PHRASE COMPLÈTE du set (normalisée), pas son premier
 * mot — « soleil » acceptait toute l'ère Soleil & Lune. Les sets dont le nom
 * apparaît dans les titres des sets voisins portent en plus un `exclude`
 * (ebayNot) listant les voisins.
 */
export function classifySealedTitle(title, { phrase, excludePattern = null, japanese = false }) {
  const raw = (title ?? "").toLowerCase();
  const reasons = [];
  if (NOISE.test(raw)) reasons.push("hors_produit");
  if (GRADED.test(raw)) reasons.push("produit_grade");
  if (MULTIPACK.test(raw)) reasons.push("lot_multiple");
  if (SINGLE_IN_SEALED.test(raw)) reasons.push("carte_a_l_unite");
  if (excludePattern && excludePattern.test(raw)) reasons.push("set_voisin");
  if (japanese && NOT_JAPANESE.test(raw)) reasons.push("langue_incoherente");
  if (!normalizeTitle(raw).includes(phrase)) reasons.push("identite_set_absente");
  return reasons;
}

// Lots et « au choix » : mauvais matching produit. Le gradé et le reverse
// sont d'AUTRES marchés que la carte brute (un slab PSA 10 à 1 500 € comme
// référence fait passer la brute à 400 € pour une anomalie). Le lexique
// contrefaçon relève lui de l'INTÉGRITÉ — assessIntegrity le porte, pour que
// ces annonces soient ledgerisées comme suspectes, pas éliminées en silence.
const SINGLES_MISMATCH = /\blots?\b|au[x]? choix|coffret|display|jumbo/i;
// Une carte TIRÉE d'un booster est Near Mint : les annonces qui se déclarent
// sous EX (played, abîmée…) décrivent un autre marché — elles tireraient le
// p10 vers le bas sans correspondre à la valeur d'un drop. eBay : ids de
// condition 5000/6000/7000 = bon/acceptable/pour pièces ; 4000 (très bon
// état ≈ EX) reste retenu — le filtre vise l'explicitement dégradé, pas la
// prudence des vendeurs, pour ne pas assécher l'échantillon.
const SINGLES_LOW_GRADE = /\bplayed\b|\bpl\b|\bhp\b|heavily|abîm|abim|damaged|\bpoor\b|[ée]tat moyen|moyen [ée]tat|tr[èe]s jou[ée]e?/i;
const LOW_GRADE_CONDITION_IDS = new Set(["5000", "6000", "7000"]);
// Vécu : « CollectAura Gem Mint 10 » passait pour une carte brute. Les
// maisons de gradation et leurs formules de note sont toutes des marchés
// distincts de la carte brute.
const SINGLES_GRADED =
  /\b(?:psa|pca|bgs|cgc|cga|sgc|ace)\s*[\d.,]*|collectaura|gem\s*mint|gem\s*mt\b|grad[ée]e?\b|graded|grading|slab|\bmint\s*10\b|note\s*10\b/i;
const SINGLES_VARIANT = /\breverse\b/i;

/** Matching d'une annonce de carte à l'unité. Pur : (title, ctx) → motifs. */
export function classifySingleTitle(title, { collectorNumber, officialCount = null, conditionId = null }) {
  const raw = (title ?? "").toLowerCase();
  const reasons = [];
  if (SINGLES_MISMATCH.test(raw)) reasons.push("lot_ou_choix");
  if (SINGLES_LOW_GRADE.test(raw) || (conditionId != null && LOW_GRADE_CONDITION_IDS.has(String(conditionId)))) {
    reasons.push("etat_sous_ex");
  }
  if (SINGLES_GRADED.test(raw)) reasons.push("produit_grade");
  if (SINGLES_VARIANT.test(raw)) reasons.push("variante_reverse");
  // Le numéro de collection doit apparaître : sans lui, on ne sait pas si
  // l'annonce décrit cette carte ou une autre du même Pokémon.
  const expected = normalizeCollectorNumber(collectorNumber);
  const expectedTotal = normalizeCollectorNumber(officialCount);
  const fractions = [...raw.matchAll(/(?:^|[^0-9a-z])([a-z]*0*\d+[a-z]*)\s*\/\s*([a-z]*0*\d+[a-z]*)(?=[^0-9a-z]|$)/gi)];
  const fractionMatch = fractions.some((match) =>
    normalizeCollectorNumber(match[1]) === expected &&
    (expectedTotal == null || normalizeCollectorNumber(match[2]) === expectedTotal));
  // Un titre qui porte une fraction a DÉJÀ déclaré son numéro : le repli
  // « nombre isolé » n'a alors plus lieu d'être, sinon le TOTAL du set passe
  // pour un numéro de carte (vécu : « Gengar 023/071 Dark Phantasma » compté
  // comme le n°71 de Shiny Star V — deux cartes, deux marchés).
  const standaloneMatch = expectedTotal == null && !fractions.length &&
    [...raw.matchAll(/(?:^|[^0-9a-z])([a-z]*0*\d+[a-z]*)(?=[^0-9a-z]|$)/gi)]
      .some((match) => normalizeCollectorNumber(match[1]) === expected);
  if (!expected || (!fractionMatch && !standaloneMatch)) reasons.push("numero_absent");
  return reasons;
}

// Classification complète d'une capture : matching, puis intégrité mesurée
// contre la référence des vendeurs établis (jamais contre le minimum, qui
// est la valeur que le faux manipule). Population des métriques = retenues
// (trusted + review) ; high_risk exclue mais tracée.
function classifyCapture(scanned, matchReasonsOf) {
  const observations = [];
  for (const item of scanned) {
    const obs = observationOf(item);
    const why = matchReasonsOf(obs.title, obs);
    obs.matching = why.length ? "wrong" : "exact";
    obs.matchingReasons = why;
    observations.push({ obs, item });
  }
  const eligible = observations.filter((o) => o.obs.matching === "exact");
  const reference = preliminaryReference(eligible.map((o) => o.obs));
  for (const o of observations) {
    const verdict =
      o.obs.matching === "exact"
        ? assessIntegrity(o.obs, reference)
        : {
            status: "unassessed",
            reasons: [],
            sellerTrust: "unassessed",
            sellerReasons: [],
            listingQuality: "unassessed",
            listingReasons: [],
          };
    o.obs.integrity = verdict.status;
    o.obs.integrityReasons = verdict.reasons;
    o.obs.sellerTrust = verdict.sellerTrust;
    o.obs.sellerReasons = verdict.sellerReasons;
    o.obs.listingQuality = verdict.listingQuality;
    o.obs.listingReasons = verdict.listingReasons;
  }
  const included = eligible.filter((o) => o.obs.integrity !== "high_risk");
  const observedPrices = eligible.map((o) => o.obs.price).filter((v) => v > 0).sort((a, b) => a - b);
  return {
    observations: observations.map((o) => o.obs),
    includedItems: included.map((o) => o.item),
    counts: {
      trusted: eligible.filter((o) => o.obs.integrity === "trusted").length,
      review: eligible.filter((o) => o.obs.integrity === "review").length,
      quarantined: eligible.filter((o) => o.obs.integrity === "high_risk").length,
      eligible: eligible.length,
    },
    observedFloor: observedPrices[0] ?? null,
    referenceBasis: reference.basis,
  };
}

/**
 * Marché du booster scellé d'un set sur eBay.fr.
 * Catégorie 183456 (« JCC : boosters scellés », l'ID propre à eBay.fr) puis
 * classification de chaque annonce — jamais de suppression silencieuse.
 */
export async function fetchSealedBoosterFR(setName, { japanese = false, exclude = null } = {}) {
  const excludePattern = exclude ? new RegExp(exclude, "i") : null;
  const phrase = normalizeTitle(setName);
  const { items: scanned, total, pages, complete } = await browseAll(
    {
      q: `pokemon booster ${setName}${japanese ? " japonais" : ""}`,
      category_ids: "183456",
      filter: "conditions:{NEW},buyingOptions:{FIXED_PRICE},deliveryCountry:FR",
      // L'aspect de langue est le vrai rempart : sans lui, un booster chinois à
      // 5,99 € devient le « plancher français » du set (vécu sur 151).
      aspect_filter: `categoryId:183456,Langue:{${japanese ? "Japonais" : "Français"}}`,
    },
    6,
  );

  const { observations, includedItems, counts, observedFloor, referenceBasis } = classifyCapture(
    scanned,
    (title) => classifySealedTitle(title, { phrase, excludePattern, japanese }),
  );

  return {
    ...summarize(includedItems),
    // Le plancher OBSERVÉ (toutes annonces éligibles, y compris à risque)
    // reste affiché à côté du fiable : la transparence, pas la censure.
    observedFloor,
    trusted: counts.trusted,
    review: counts.review,
    quarantined: counts.quarantined,
    matched: counts.eligible,
    scanned: scanned.length,
    totalAvailable: total,
    pages,
    complete,
    scope: { marketplace: "EBAY_FR", product: "sealed", language: japanese ? "Japonais" : "Français" },
    referenceBasis,
    observations,
  };
}

const SINGLES_CATEGORY = "183454"; // « JCC : cartes à l'unité » sur eBay.fr

/**
 * Marché français d'UNE carte (brute — le gradé et le reverse sont d'autres
 * marchés). La requête « {nom français} {numéro}/{total} » est très
 * discriminante : le numéro de collection est unique dans le set.
 */
export async function fetchCardFR(cardName, collectorNumber, officialCount, { language = "Français" } = {}) {
  const numberTag = officialCount ? `${collectorNumber}/${officialCount}` : collectorNumber;
  const { items: scanned, total, pages, complete } = await browseAll(
    {
      q: `${cardName} ${numberTag}`,
      category_ids: SINGLES_CATEGORY,
      filter: "buyingOptions:{FIXED_PRICE},deliveryCountry:FR",
      aspect_filter: `categoryId:${SINGLES_CATEGORY},Langue:{${language}}`,
    },
    2,
  );

  const { observations, includedItems, counts, observedFloor, referenceBasis } = classifyCapture(
    scanned,
    (title, obs) => classifySingleTitle(title, { collectorNumber, officialCount, conditionId: obs.condition }),
  );

  return {
    ...summarize(includedItems),
    observedFloor,
    trusted: counts.trusted,
    review: counts.review,
    quarantined: counts.quarantined,
    matched: counts.eligible,
    scanned: scanned.length,
    totalAvailable: total,
    pages,
    complete,
    scope: { marketplace: "EBAY_FR", product: "single", language, collectorNumber, officialCount },
    referenceBasis,
    observations,
  };
}

// Test de bout en bout : jeton + une recherche.
export async function healthcheck() {
  await applicationToken();
  const result = await browse({ q: "pokemon booster", limit: "1" });
  return { ok: true, sampleTotal: result.total ?? 0 };
}
