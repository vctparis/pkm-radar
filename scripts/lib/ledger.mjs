// Ledger des annonces observées (Phase 0A) + manifeste de complétude.
//
// Chaque jour sans ledger est une donnée perdue pour toujours : les comptages
// quotidiens ne permettront jamais de reconstruire les flux entrants/sortants,
// les identifiants d'annonces, si. On enregistre TOUT ce qui a été observé —
// y compris le bruit et le suspect. Jamais de DELETE.
//
// Structure par annonce : le BRUT est append-only — `history` accumule un
// point (date, prix) par jour d'observation, rien n'en est jamais retiré ;
// les champs price_first/first_seen ne bougent plus après création. Seule la
// CLASSIFICATION (matching/integrity/analysis_version) est un état courant,
// remplacé à chaque relevé : elle est intégralement recomputable depuis le
// brut, c'est sa définition.
//
// Le MANIFESTE (_manifest.jsonl, append-only) enregistre chaque crawl : date,
// set, sujet, source, nombre capturé, total annoncé par l'API, et si la
// capture était complète. Sans lui, une panne d'API ou une pagination
// tronquée serait indistinguable d'une vague de sorties d'annonces — les
// futurs flux (new/exit) ne devront compter QUE les jours marqués complets.
//
// Un fichier JSON corrompu ou illisible fait ÉCHOUER le relevé (on n'écrase
// jamais un historique au motif qu'on n'a pas su le lire) ; les écritures
// sont atomiques (fichier temporaire puis rename).

import { readFile, writeFile, mkdir, rename, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ANALYSIS_VERSION } from "./integrity.mjs";

const DIR = join(process.cwd(), "data", "ledger");

async function loadStore(path) {
  if (!existsSync(path)) return { listings: {} };
  // Toute erreur (lecture OU parse) remonte : un ledger illisible est un
  // incident, pas un « premier relevé ».
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeAtomic(path, data) {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, path);
}

/**
 * Enregistre un lot d'observations du jour pour un set.
 * @param setId    identifiant du set (nom de fichier)
 * @param entries  [{ source, subject, id, title?, url?, price, currency?,
 *                    quantity?, sellerId?, sellerScore?, sellerPct?,
 *                    matching, matchingReasons?, integrity, integrityReasons? }]
 * @param date     AAAA-MM-JJ du relevé
 */
export async function recordObservations(setId, entries, { date }) {
  if (!entries?.length) return { added: 0, updated: 0 };
  await mkdir(DIR, { recursive: true });
  const path = join(DIR, `${setId}.json`);
  const store = await loadStore(path);

  let added = 0;
  let updated = 0;
  for (const entry of entries) {
    if (!entry.id || !(entry.price > 0)) continue;
    const key = `${entry.source}:${entry.id}`;
    const price = Number(entry.price);
    const existing = store.listings[key];
    if (existing) {
      existing.last_seen = date;
      existing.times_seen = (existing.times_seen ?? 1) + 1;
      existing.price_last = price;
      existing.price_min = Math.min(existing.price_min ?? price, price);
      existing.price_max = Math.max(existing.price_max ?? price, price);
      // Journal brut : un point par jour d'observation, jamais retiré. Les
      // disparitions/réapparitions se lisent dans les trous de la série.
      existing.history = existing.history ?? [{ d: existing.first_seen, p: existing.price_first }];
      if (existing.history[existing.history.length - 1]?.d !== date) {
        existing.history.push({ d: date, p: price });
      }
      if (entry.quantity != null) existing.quantity = entry.quantity;
      // État courant recomputable — remplacé à chaque relevé, par définition.
      existing.matching = entry.matching;
      existing.matching_reasons = entry.matchingReasons ?? [];
      existing.integrity = entry.integrity;
      existing.integrity_reasons = entry.integrityReasons ?? [];
      existing.analysis_version = ANALYSIS_VERSION;
      updated++;
    } else {
      store.listings[key] = {
        subject: entry.subject,
        source: entry.source,
        title: entry.title ?? null,
        url: entry.url ?? null,
        currency: entry.currency ?? "EUR",
        quantity: entry.quantity ?? null,
        seller_id: entry.sellerId ?? null,
        seller_feedback_score: entry.sellerScore ?? null,
        seller_feedback_pct: entry.sellerPct ?? null,
        price_first: price,
        price_last: price,
        price_min: price,
        price_max: price,
        first_seen: date,
        last_seen: date,
        times_seen: 1,
        history: [{ d: date, p: price }],
        matching: entry.matching,
        matching_reasons: entry.matchingReasons ?? [],
        integrity: entry.integrity,
        integrity_reasons: entry.integrityReasons ?? [],
        review_status: null, // réservé à la revue manuelle future (is_fake ≠ risque)
        analysis_version: ANALYSIS_VERSION,
      };
      added++;
    }
  }
  await writeAtomic(path, JSON.stringify(store));
  return { added, updated };
}

/**
 * Manifeste de crawl, append-only : la preuve de ce qui a été réellement
 * parcouru ce jour-là — et si la capture était complète. Une ligne JSONL
 * par (set, sujet, source).
 */
export async function recordCrawl(setId, { date, source, subject, captured, totalAvailable = null, complete }) {
  await mkdir(DIR, { recursive: true });
  const line = JSON.stringify({
    date,
    set: setId,
    source,
    subject,
    captured,
    total_available: totalAvailable,
    complete: Boolean(complete),
    analysis_version: ANALYSIS_VERSION,
  });
  await appendFile(join(DIR, "_manifest.jsonl"), line + "\n");
}
