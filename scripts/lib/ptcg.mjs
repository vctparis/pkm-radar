// Source pokemontcg.io : catalogue complet des cartes + prix Cardmarket.
// L'API renvoie des 500 intermittents (mesuré : ~1 requête sur 3), d'où les
// tentatives multiples. Un cache disque évite de la solliciter à chaque run.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const BASE = "https://api.pokemontcg.io/v2";
const CACHE_DIR = join(process.cwd(), "data", "raw");
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

async function fetchWithRetry(url, tries = 9) {
  let lastError;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const headers = { Accept: "application/json" };
      if (process.env.POKEMONTCG_API_KEY) headers["X-Api-Key"] = process.env.POKEMONTCG_API_KEY;
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(90_000) });
      if (response.ok) return response.json();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    // Backoff linéaire : l'API se rétablit vite, inutile d'attendre longtemps.
    if (attempt < tries) await new Promise((r) => setTimeout(r, 3000 * attempt));
  }
  throw new Error(`pokemontcg.io injoignable après ${tries} tentatives (${url}): ${lastError?.message}`);
}

export async function fetchSetCards(ptcgId, { useCache = true } = {}) {
  const cachePath = join(CACHE_DIR, `${ptcgId}.json`);
  if (useCache && existsSync(cachePath)) {
    const raw = JSON.parse(await readFile(cachePath, "utf8"));
    if (Date.now() - raw.cachedAt < CACHE_TTL_MS) return raw.data;
  }

  const payload = await fetchWithRetry(`${BASE}/cards?q=set.id:${ptcgId}&pageSize=250`);
  const data = payload.data ?? [];
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify({ cachedAt: Date.now(), data }));
  return data;
}

const COMMON_RARITIES = new Set(["Common", "Uncommon"]);
// Classes structurellement bon marché : au-dessus de 25 €, c'est un produit
// mal relié chez Cardmarket, pas une carte chère (vécu : Charmander commun à
// 140 €, Rare non-holo de Foudre Noire à ~370 € dans une classe à 0,07 € de
// médiane — contribution EV gonflée de 25 €/booster). Le « Rare Holo »
// vintage n'y est PAS : ses Dracaufeu à 250 € sont légitimes.
const CHEAP_RARITIES = new Set(["Common", "Uncommon", "Rare"]);

// Normalise une carte brute en un objet exploitable par les indices.
export function normalizeCard(card) {
  const market = card.cardmarket;
  const prices = market?.prices;
  if (!prices || !market?.updatedAt) return null;

  // Format renvoyé : "2026/01/16" — Date le parse en heure locale, on force midi
  // UTC pour éviter qu'un décalage de fuseau ne fasse basculer le jour.
  const updatedAt = Date.parse(`${market.updatedAt.replaceAll("/", "-")}T12:00:00Z`);
  if (Number.isNaN(updatedAt)) return null;

  const reference = prices.trendPrice || prices.avg30 || prices.averageSellPrice || 0;
  if (!reference) return null;

  // Garde-fou contre les mauvais mappages produit côté pokemontcg.io : une
  // commune « à 140 € » (vécu : Charmander n°4 du 151, trend 140 €, plancher
  // 58 €) est un produit Cardmarket mal relié, pas une carte chère. La garder
  // empoisonnerait podium, strates et espérances.
  if (CHEAP_RARITIES.has(card.rarity) && reference > 25) return null;

  return {
    id: card.id,
    name: card.name,
    number: card.number,
    rarity: card.rarity ?? "Inconnue",
    isCommon: COMMON_RARITIES.has(card.rarity),
    image: card.images?.small ?? null,
    cardmarketUrl: market.url ?? null,
    updatedAt,
    prices,
    reference,
    // Variation observée sur ~30 jours autour de la date de relevé de la carte.
    change30: prices.avg30 > 0 && prices.avg1 > 0 ? prices.avg1 / prices.avg30 - 1 : null,
  };
}

export function normalizeSet(cards) {
  return cards.map(normalizeCard).filter(Boolean);
}

/**
 * Résout le lien Cardmarket d'une carte et le bascule en locale française.
 *
 * `cardmarket.url` pointe vers un redirecteur pokemontcg.io, pas vers la fiche.
 * On suit la redirection une fois pour récupérer l'URL réelle, on retire les
 * paramètres de campagne et on remplace /en/ par /fr/. Appelé uniquement sur
 * les cartes affichées — une résolution par carte du catalogue ferait des
 * milliers de requêtes pour rien.
 */
export async function resolveCardmarketUrl(redirectUrl, tries = 3) {
  if (!redirectUrl) return null;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const response = await fetch(redirectUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
      });
      const location = response.headers.get("location");
      if (location) {
        const url = new URL(location);
        url.search = "";
        url.pathname = url.pathname.replace(/^\/en\//, "/fr/");
        return url.toString();
      }
    } catch {
      // Le redirecteur renvoie des erreurs sporadiques ; on retente.
    }
    if (attempt < tries) await new Promise((r) => setTimeout(r, 800 * attempt));
  }
  // Un lien manquant vaut mieux qu'un lien faux : l'interface le masquera.
  return null;
}
