// Source CardTrader : l'état du marché maintenant (prix demandés, profondeur
// de l'offre). Aucun historique n'est disponible côté API — cette couche
// produit un point par jour, que le pipeline accumule.

const BASE = "https://api.cardtrader.com/api/v2";

// Catégories Pokémon renvoyées par /categories?game_id=5
const CATEGORY = { booster: 66, boosterBox: 67, singles: 73 };

// On ne retient que le neuf : mélanger du Played dans un plancher de prix
// fabrique une fausse baisse quand un vendeur brade une carte abîmée.
const MINT_CONDITIONS = new Set(["Mint", "Near Mint"]);

function authHeaders() {
  const token = process.env.CARDTRADER_API_TOKEN;
  if (!token) throw new Error("CARDTRADER_API_TOKEN manquant");
  return { Accept: "application/json", Authorization: `Bearer ${token}` };
}

async function get(path, tries = 4) {
  let lastError;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const response = await fetch(`${BASE}${path}`, {
        headers: authHeaders(),
        signal: AbortSignal.timeout(120_000),
      });
      if (response.ok) return response.json();
      // 429 = quota ; attendre plus longtemps a une chance d'aboutir,
      // réessayer immédiatement n'en a aucune.
      lastError = new Error(`HTTP ${response.status}`);
      if (response.status === 429) await new Promise((r) => setTimeout(r, 5000 * attempt));
    } catch (error) {
      lastError = error;
    }
    if (attempt < tries) await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  throw new Error(`CardTrader ${path} : ${lastError?.message}`);
}

export async function fetchExpansions() {
  const all = await get("/expansions");
  return all.filter((expansion) => expansion.game_id === 5);
}

// Catalogue complet des blueprints d'une expansion. Chaque blueprint porte
// un image_url (couverture mesurée : 100 %) — c'est la source d'illustrations
// des sets japonais, absents de TCGdex.
export async function fetchBlueprints(expansionId) {
  return get(`/blueprints/export?expansion_id=${expansionId}`);
}

// Repère le booster à l'unité et le display d'un set.
// Plusieurs blueprints peuvent porter le même nom (doublons de catalogue) :
// on garde le plus ancien identifiant, qui est celui réellement approvisionné.
export function pickSealedFrom(blueprints) {
  const pick = (categoryId) =>
    blueprints
      .filter((blueprint) => blueprint.category_id === categoryId)
      .sort((a, b) => a.id - b.id)[0] ?? null;

  return {
    booster: pick(CATEGORY.booster),
    boosterBox: pick(CATEGORY.boosterBox),
  };
}

export async function resolveSealedBlueprints(expansionId) {
  return pickSealedFrom(await fetchBlueprints(expansionId));
}

// `sealed` : un produit scellé n'a pas de condition (son properties_hash ne
// contient que la langue). Appliquer le filtre Near Mint le ferait disparaître.
function summarizeOffers(products, { sealed = false } = {}) {
  const clean = products.filter(
    (product) =>
      !product.graded &&
      !product.on_vacation &&
      product.price_cents > 0 &&
      (sealed || MINT_CONDITIONS.has(product.properties_hash?.condition)),
  );
  if (!clean.length) return { price: null, offers: 0, quantity: 0, sellers: 0 };

  const prices = clean.map((product) => product.price_cents / 100).sort((a, b) => a - b);
  return {
    // Le plancher brut est manipulable par une annonce isolée ; le 10e centile
    // décrit mieux le prix auquel on peut réellement acheter.
    price: prices[0],
    floor10: prices[Math.floor(prices.length * 0.1)],
    offers: clean.length,
    quantity: clean.reduce((sum, product) => sum + (product.quantity ?? 1), 0),
    sellers: new Set(clean.map((product) => product.user?.id)).size,
  };
}

/**
 * Marché d'un blueprint, avec préférence de langue.
 *
 * CardTrader est une marketplace italienne : sur Ombres Ardentes on compte 33
 * produits en français pour 19 659 au total, et zéro booster scellé français.
 * Afficher le prix le plus bas toutes langues confondues revient donc à montrer
 * un prix italien ou espagnol à un acheteur qui vise du français. On parcourt
 * les langues par ordre de préférence et on renvoie TOUJOURS celle retenue,
 * pour que l'interface puisse l'afficher plutôt que de laisser croire.
 */
export async function fetchBlueprintMarket(blueprintId, options = {}) {
  const { languages = [], keepRaw = false, ...rest } = options;
  const payload = await get(`/marketplace/products?blueprint_id=${blueprintId}`);
  const products = Object.values(payload).flat();
  // Niveau annonce pour le ledger — à extraire puis RETIRER par l'appelant
  // avant que l'objet ne parte dans radar-data.json.
  const rawRows = keepRaw
    ? products
        .filter((p) => p.price_cents > 0 && !p.on_vacation)
        .map((p) => ({
          id: p.id,
          price: p.price_cents / 100,
          quantity: p.quantity ?? 1,
          sellerId: p.user?.id != null ? String(p.user.id) : null,
          title: p.name_en ?? null,
          language: p.properties_hash?.pokemon_language ?? null,
        }))
    : null;

  for (const language of languages) {
    const subset = products.filter((p) => p.properties_hash?.pokemon_language === language);
    if (subset.length) {
      const summary = summarizeOffers(subset, rest);
      if (summary.offers) return { ...summary, language, ...(rawRows ? { rawRows } : {}) };
    }
  }

  // Aucune langue préférée disponible : on retombe sur le marché entier, en
  // nommant la langue effectivement la moins chère.
  const summary = summarizeOffers(products, rest);
  if (!summary.offers) return { ...summary, language: null, ...(rawRows ? { rawRows } : {}) };
  const cheapest = products
    .filter((p) => p.price_cents > 0 && !p.graded && !p.on_vacation)
    .sort((a, b) => a.price_cents - b.price_cents)[0];
  return { ...summary, language: cheapest?.properties_hash?.pokemon_language ?? null, ...(rawRows ? { rawRows } : {}) };
}

/**
 * Snapshot marché de tous les singles d'une expansion.
 * La réponse pèse ~20 Mo par set : on ne conserve que l'agrégat par blueprint.
 */
export async function fetchExpansionSingles(expansionId) {
  const payload = await get(`/marketplace/products?expansion_id=${expansionId}`);
  const byBlueprint = new Map();
  // Niveau annonce par numéro de collection, pour le ledger (périmètre :
  // les cartes qui portent l'EV — l'appelant filtre). Propriété attachée à
  // la Map pour ne pas casser les usages existants ; elle ne part jamais
  // dans radar-data (la Map n'y est pas sérialisée).
  const rawByNumber = new Map();

  for (const [blueprintId, products] of Object.entries(payload)) {
    const singles = products.filter((product) => product.properties_hash?.condition);
    if (!singles.length) continue;
    const number = singles[0].properties_hash?.collector_number ?? null;
    if (number != null) {
      const key = String(number).replace(/^0+(?=\d)/, "");
      const rows = singles
        .filter((p) => p.price_cents > 0 && !p.on_vacation && !p.graded)
        .map((p) => ({
          id: p.id,
          price: p.price_cents / 100,
          quantity: p.quantity ?? 1,
          sellerId: p.user?.id != null ? String(p.user.id) : null,
          title: p.name_en ?? null,
          language: p.properties_hash?.pokemon_language ?? null,
          condition: p.properties_hash?.condition ?? null,
        }));
      if (rows.length) rawByNumber.set(key, [...(rawByNumber.get(key) ?? []), ...rows]);
    }
    const summary = summarizeOffers(singles);
    if (!summary.offers) continue;
    byBlueprint.set(Number(blueprintId), {
      name: singles[0].name_en,
      collectorNumber: number,
      rarity: singles[0].properties_hash?.pokemon_rarity ?? null,
      ...summary,
    });
  }
  byBlueprint.rawByNumber = rawByNumber;
  return byBlueprint;
}
