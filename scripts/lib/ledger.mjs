// Ledger des annonces observées + manifeste d'exécution.
//
// Le fichier par set est un index cumulatif pratique pour l'interface. La
// matière recomputable vit dans `history` : une observation normalisée par
// (run_id, sujet, annonce), avec les dimensions qui déterminent le périmètre
// et la confiance. Une ancienne ligne compacte est conservée mais marquée
// `legacy_compacted` : on ne prétend pas posséder des champs jamais collectés.

import { readFile, writeFile, mkdir, rename, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { ANALYSIS_VERSION } from "./integrity.mjs";

const DIR = join(process.cwd(), "data", "ledger");
const MANIFEST = join(DIR, "_manifest.jsonl");
const SAFE_SET_ID = /^[a-z0-9][a-z0-9-]*$/;

export function createRunContext(now = new Date()) {
  const observedAt = now.toISOString();
  return {
    runId: `${observedAt.replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`,
    observedAt,
    date: observedAt.slice(0, 10),
  };
}

function assertSetId(setId) {
  if (!SAFE_SET_ID.test(setId)) throw new Error(`setId ledger invalide: ${setId}`);
}

export function relistSignature(entry) {
  const normalizedTitle = String(entry.title ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\W+/g, " ")
    .trim();
  if (!entry.sellerId || !normalizedTitle || !entry.subject) return null;
  return createHash("sha256")
    .update(`${entry.source}|${entry.subject}|${entry.sellerId}|${normalizedTitle}`)
    .digest("hex")
    .slice(0, 20);
}

function legacyEvent(row) {
  return {
    d: row.first_seen,
    run_id: `legacy-${row.first_seen}`,
    p: row.price_first,
    legacy_compacted: true,
  };
}

/** Compaction d'un journal existant — même transformation qu'à la lecture. */
export function compactStore(store) {
  return normalizeStore(store);
}

function normalizeStore(store) {
  if (!store || typeof store !== "object" || !store.listings || typeof store.listings !== "object") {
    throw new Error("schéma ledger invalide");
  }
  // Compaction v5 : un événement ne garde que ce qui varie (jour, relevé,
  // prix, quantité). Les descriptifs et la classification vivent au niveau de
  // la fiche, à jour — les recopier chaque jour avait porté le journal à
  // 173 Mo en deux jours.
  store.schema_version = 5;
  for (const row of Object.values(store.listings)) {
    if (!Array.isArray(row.history) || !row.history.length) row.history = [legacyEvent(row)];
    else row.history = row.history.map((event, index) => {
      const slim = {
        d: event.d ?? row.first_seen,
        run_id: event.run_id ?? `legacy-${event.d ?? row.first_seen}`,
        p: event.p ?? row.price_first,
      };
      if (event.q != null) slim.q = event.q;
      if (event.legacy_compacted) slim.legacy_compacted = true;
      // Le premier événement est l'instantané d'identité : il garde tout ce
      // qu'il portait. Les suivants ne gardent que les changements réels.
      for (const [key, , ofRow] of EVENT_DESCRIPTORS) {
        if (!(key in event)) continue;
        if (index === 0 || event[key] !== ofRow(row)) slim[key] = event[key];
      }
      return slim;
    });
    if (row.matching === "wrong") {
      row.integrity = "unassessed";
      row.integrity_reasons = [];
    }
  }
  return store;
}

async function loadStore(path) {
  if (!existsSync(path)) return { schema_version: 4, listings: {} };
  return normalizeStore(JSON.parse(await readFile(path, "utf8")));
}

async function writeAtomic(path, data, runId) {
  const tmp = `${path}.${process.pid}.${runId}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, path);
}

// Journal en instantané + écarts. Le PREMIER événement d'une annonce porte
// son identité complète ; les suivants ne portent que ce qui a bougé — prix,
// quantité, et tout descriptif réellement modifié par le vendeur. Rien n'est
// perdu : un changement reste enregistré le jour où il survient. Recopier
// 27 champs identiques chaque jour avait porté le journal à 173 Mo en deux
// jours et faisait tomber le build de Vercel.
const EVENT_DESCRIPTORS = [
  ["subject", (entry) => entry.subject ?? null, (row) => row.subject ?? null],
  ["title", (entry) => entry.title ?? null, (row) => row.title ?? null],
  ["url", (entry) => entry.url ?? null, (row) => row.url ?? null],
  ["shipping", (entry) => entry.shipping ?? null, (row) => row.shipping ?? null],
  ["country", (entry) => entry.country ?? null, (row) => row.country ?? null],
  ["language", (entry) => entry.language ?? null, (row) => row.language ?? null],
  ["condition", (entry) => entry.condition ?? null, (row) => row.condition ?? null],
  ["seller_id", (entry) => entry.sellerId ?? null, (row) => row.seller_id ?? null],
  ["seller_feedback_score", (entry) => entry.sellerScore ?? null, (row) => row.seller_feedback_score ?? null],
  ["matching", (entry) => entry.matching ?? null, (row) => row.matching ?? null],
  ["integrity", (entry) => (entry.matching === "wrong" ? "unassessed" : entry.integrity ?? null), (row) => row.integrity ?? null],
];

export const EVENT_DESCRIPTOR_KEYS = EVENT_DESCRIPTORS.map(([key]) => key);

function eventOf(entry, { date, runId }, previous = null) {
  const event = { d: date, run_id: runId, p: Number(entry.price) };
  if (entry.quantity != null) event.q = entry.quantity;
  for (const [key, ofEntry, ofRow] of EVENT_DESCRIPTORS) {
    const value = ofEntry(entry);
    if (previous ? value !== ofRow(previous) : value != null) event[key] = value;
  }
  return event;
}

/** Enregistre une observation par exécution et par sujet, de façon idempotente. */
export async function recordObservations(setId, entries, context) {
  if (!entries?.length) return { added: 0, updated: 0, events: 0 };
  assertSetId(setId);
  const { date, observedAt, runId } = context;
  if (!date || !observedAt || !runId) throw new Error("contexte ledger incomplet");
  await mkdir(DIR, { recursive: true });
  const path = join(DIR, `${setId}.json`);
  const store = await loadStore(path);

  let added = 0;
  let updated = 0;
  let events = 0;
  for (const entry of entries) {
    if (!entry.id || !(entry.price > 0) || !entry.source || !entry.subject) continue;
    const key = `${entry.source}:${entry.id}`;
    const price = Number(entry.price);
    const existing = store.listings[key];
    if (existing) {
      // Même relevé = retry idempotent, pas une nouvelle observation.
      const index = existing.history.findIndex((h) => h.run_id === runId);
      // Rejouer le PREMIER relevé doit réécrire un instantané complet, pas un
      // écart : sinon un simple retry effacerait l'identité de l'annonce.
      const event = eventOf(entry, context, index === 0 ? null : existing);
      if (index >= 0) existing.history[index] = event;
      else {
        existing.history.push(event);
        events++;
      }
      existing.subject = entry.subject;
      existing.last_seen = date;
      existing.last_observed_at = observedAt;
      existing.times_seen = existing.history.length;
      existing.price_last = price;
      existing.price_min = Math.min(existing.price_min ?? price, price);
      existing.price_max = Math.max(existing.price_max ?? price, price);
      existing.quantity = entry.quantity ?? null;
      existing.shipping = entry.shipping ?? null;
      existing.country = entry.country ?? null;
      existing.title = entry.title ?? existing.title ?? null;
      existing.url = entry.url ?? existing.url ?? null;
      existing.currency = entry.currency ?? existing.currency ?? "EUR";
      existing.language = entry.language ?? null;
      existing.condition = entry.condition ?? null;
      existing.graded = entry.graded ?? null;
      existing.on_vacation = entry.onVacation ?? null;
      existing.seller_id = entry.sellerId ?? existing.seller_id ?? null;
      existing.seller_feedback_score = entry.sellerScore ?? null;
      existing.seller_feedback_pct = entry.sellerPct ?? null;
      existing.matching = entry.matching;
      existing.matching_reasons = entry.matchingReasons ?? [];
      existing.integrity = entry.matching === "wrong" ? "unassessed" : entry.integrity;
      existing.integrity_reasons = entry.integrityReasons ?? [];
      existing.seller_trust = entry.sellerTrust ?? "unassessed";
      existing.seller_reasons = entry.sellerReasons ?? [];
      existing.listing_quality = entry.listingQuality ?? "unassessed";
      existing.listing_reasons = entry.listingReasons ?? [];
      existing.source_confidence = entry.sourceConfidence ?? "unassessed";
      existing.relist_signature = relistSignature(entry);
      existing.analysis_version = ANALYSIS_VERSION;
      updated++;
    } else {
      const event = eventOf(entry, context, null);
      store.listings[key] = {
        subject: entry.subject,
        source: entry.source,
        title: entry.title ?? null,
        url: entry.url ?? null,
        currency: entry.currency ?? "EUR",
        language: entry.language ?? null,
        condition: entry.condition ?? null,
        graded: entry.graded ?? null,
        on_vacation: entry.onVacation ?? null,
        quantity: entry.quantity ?? null,
        shipping: entry.shipping ?? null,
        country: entry.country ?? null,
        seller_id: entry.sellerId ?? null,
        seller_feedback_score: entry.sellerScore ?? null,
        seller_feedback_pct: entry.sellerPct ?? null,
        price_first: price,
        price_last: price,
        price_min: price,
        price_max: price,
        first_seen: date,
        last_seen: date,
        first_observed_at: observedAt,
        last_observed_at: observedAt,
        times_seen: 1,
        history: [event],
        matching: entry.matching,
        matching_reasons: entry.matchingReasons ?? [],
        integrity: entry.matching === "wrong" ? "unassessed" : entry.integrity,
        integrity_reasons: entry.integrityReasons ?? [],
        seller_trust: entry.sellerTrust ?? "unassessed",
        seller_reasons: entry.sellerReasons ?? [],
        listing_quality: entry.listingQuality ?? "unassessed",
        listing_reasons: entry.listingReasons ?? [],
        source_confidence: entry.sourceConfidence ?? "unassessed",
        relist_signature: relistSignature(entry),
        review_status: null,
        analysis_version: ANALYSIS_VERSION,
      };
      added++;
      events++;
    }
  }
  await writeAtomic(path, `${JSON.stringify(store)}\n`, runId);
  return { added, updated, events };
}

async function appendManifest(entry) {
  await mkdir(DIR, { recursive: true });
  await appendFile(MANIFEST, `${JSON.stringify(entry)}\n`);
}

export async function recordRun(context, { status, error = null } = {}) {
  await appendManifest({
    type: "run",
    run_id: context.runId,
    date: context.date,
    observed_at: new Date().toISOString(),
    status,
    error: error ? String(error).slice(0, 500) : null,
    analysis_version: ANALYSIS_VERSION,
  });
}

/** Une ligne par tentative de crawl, y compris zéro résultat et erreur. */
export async function recordCrawl(setId, crawl, context) {
  assertSetId(setId);
  await appendManifest({
    type: "crawl",
    run_id: context.runId,
    date: context.date,
    observed_at: context.observedAt,
    set: setId,
    source: crawl.source,
    subject: crawl.subject,
    status: crawl.status ?? "ok",
    captured: crawl.captured ?? 0,
    stored: crawl.stored ?? null,
    total_available: crawl.totalAvailable ?? null,
    pages: crawl.pages ?? null,
    complete: crawl.status === "error" ? false : crawl.complete === true,
    scope: crawl.scope ?? null,
    error: crawl.error ? String(crawl.error).slice(0, 500) : null,
    analysis_version: ANALYSIS_VERSION,
  });
}
