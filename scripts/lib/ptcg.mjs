// Source pokemontcg.io : catalogue complet des cartes + prix Cardmarket.
// L'API renvoie des 500 intermittents (mesuré : ~1 requête sur 3), d'où les
// tentatives multiples. Un cache disque évite de la solliciter à chaque run.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const BASE = "https://api.pokemontcg.io/v2";
const CACHE_DIR = join(process.cwd(), "data", "raw");
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

async function fetchWithRetry(url, tries = 6) {
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
    if (attempt < tries) await new Promise((r) => setTimeout(r, 2000 * attempt));
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

  return {
    id: card.id,
    name: card.name,
    number: card.number,
    rarity: card.rarity ?? "Inconnue",
    isCommon: COMMON_RARITIES.has(card.rarity),
    image: card.images?.small ?? null,
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
