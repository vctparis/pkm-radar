// Source TCGdex : le catalogue FRANÇAIS des cartes.
//
// API libre et sans clé (https://tcgdex.dev), mêmes identifiants de sets que
// pokemontcg.io à quelques exceptions près (gérées dans sets.mjs). Elle donne
// ce que ni Cardmarket ni CardTrader n'offrent proprement : le NOM français de
// chaque carte — indispensable pour interroger eBay.fr sans bruit — et
// l'image de la carte française pour l'interface.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const BASE = "https://api.tcgdex.net/v2";
const CACHE_DIR = join(process.cwd(), "data", "raw");
// Le catalogue d'un set clos ne change pas : cache long.
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function fetchFrenchCatalog(tcgdexId, { useCache = true, lang = "fr" } = {}) {
  const cachePath = join(CACHE_DIR, `tcgdex-${lang}-${tcgdexId.replace(/[^a-z0-9.]/gi, "_")}.json`);
  if (useCache && existsSync(cachePath)) {
    const raw = JSON.parse(await readFile(cachePath, "utf8"));
    // "logo" absent = cache d'une version antérieure du schéma : on rafraîchit.
    if (Date.now() - raw.cachedAt < CACHE_TTL_MS && "logo" in raw.data) return raw.data;
  }

  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(`${BASE}/${lang}/sets/${encodeURIComponent(tcgdexId)}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) {
        const payload = await response.json();
        const data = {
          name: payload.name,
          // Les logos TCGdex sont des bases d'URL, extension à la demande.
          logo: payload.logo ? `${payload.logo}.webp` : null,
          officialCount: payload.cardCount?.official ?? null,
          // localId = numéro de collection ("33"), la clé de jonction avec
          // les autres catalogues.
          byLocalId: Object.fromEntries(
            (payload.cards ?? []).map((card) => [
              String(card.localId),
              // Les images TCGdex sont des bases d'URL : la qualité se
              // demande en suffixe (low.webp ≈ 12 Ko, parfait pour un survol).
              { name: card.name, image: card.image ? `${card.image}/low.webp` : null },
            ]),
          ),
        };
        await mkdir(dirname(cachePath), { recursive: true });
        await writeFile(cachePath, JSON.stringify({ cachedAt: Date.now(), data }));
        return data;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < 4) await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  throw new Error(`TCGdex ${tcgdexId} : ${lastError?.message}`);
}
