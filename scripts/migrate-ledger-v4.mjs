// Migration unique du relevé initial vers le contrat ledger v4.
// - récupère les observations eBay accidentellement publiées dans radar-data ;
// - les reclasse avec les règles v4 et les verse au ledger ;
// - retire tout brut de l'artefact public ;
// - marque les observations historiques compactées comme non exhaustives.

import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { SETS } from "./lib/sets.mjs";
import { classifySealedTitle, classifySingleTitle, normalizeTitle } from "./lib/ebay.mjs";
import { ANALYSIS_VERSION, assessIntegrity, preliminaryReference } from "./lib/integrity.mjs";
import { createRunContext, recordObservations, recordCrawl, recordRun, relistSignature } from "./lib/ledger.mjs";
import { normalizeCollectorNumber } from "./lib/identifiers.mjs";

const ROOT = process.cwd();
const LEDGER_DIR = join(ROOT, "data", "ledger");
const PUBLIC_PATH = join(ROOT, "public", "radar-data.json");
const bySet = new Map(SETS.map((set) => [set.id, set]));
const generated = JSON.parse(await readFile(PUBLIC_PATH, "utf8")).generatedAt;
const context = createRunContext(new Date(generated));
context.runId = `migration-v4-${context.date}`;

async function runAlreadyCompleted(runId) {
  try {
    const lines = (await readFile(join(LEDGER_DIR, "_manifest.jsonl"), "utf8")).trim().split("\n");
    return lines.some((line) => {
      const entry = JSON.parse(line);
      return entry.type === "run" && entry.run_id === runId && /completed$/.test(entry.status);
    });
  } catch {
    return false;
  }
}

function classifyRows(rows, reasonsOf) {
  const staged = rows.map((row) => ({ row, reasons: reasonsOf(row.title) }));
  const eligible = staged.filter((entry) => entry.reasons.length === 0);
  const reference = preliminaryReference(eligible.map((entry) => entry.row));
  return staged.map(({ row, reasons }) => {
    if (reasons.length) {
      return {
        ...row,
        matching: "wrong",
        matchingReasons: reasons,
        integrity: "unassessed",
        integrityReasons: [],
        sellerTrust: "unassessed",
        sellerReasons: [],
        listingQuality: "unassessed",
        listingReasons: [],
      };
    }
    const verdict = assessIntegrity(row, reference);
    return {
      ...row,
      matching: "exact",
      matchingReasons: [],
      integrity: verdict.status,
      integrityReasons: verdict.reasons,
      sellerTrust: verdict.sellerTrust,
      sellerReasons: verdict.sellerReasons,
      listingQuality: verdict.listingQuality,
      listingReasons: verdict.listingReasons,
    };
  });
}

function legacyEvent(row) {
  return {
    d: row.first_seen,
    run_id: `legacy-${row.first_seen}`,
    p: row.price_first,
    legacy_compacted: true,
  };
}

function currentObservation(row) {
  return {
    price: row.price_last,
    title: row.title,
    sellerId: row.seller_id,
    sellerScore: row.seller_feedback_score,
    sellerPct: row.seller_feedback_pct,
  };
}

async function migrateExistingStores() {
  const files = (await readdir(LEDGER_DIR)).filter((file) => file.endsWith(".json"));
  for (const file of files) {
    const setId = file.replace(/\.json$/, "");
    const set = bySet.get(setId);
    const path = join(LEDGER_DIR, file);
    const store = JSON.parse(await readFile(path, "utf8"));
    store.schema_version = 4;

    const groups = new Map();
    for (const row of Object.values(store.listings ?? {})) {
      if (row.subject?.startsWith("card:")) {
        const canonical = normalizeCollectorNumber(row.subject.slice(5));
        if (canonical) row.subject = `card:${canonical}`;
      }
      if (!Array.isArray(row.history) || !row.history.length) row.history = [legacyEvent(row)];
      else row.history = row.history.map((event) => event.legacy_compacted
        ? { d: event.d, run_id: event.run_id, p: event.p, legacy_compacted: true }
        : event.run_id
          ? {
              ...event,
              subject: event.subject?.startsWith("card:")
                ? `card:${normalizeCollectorNumber(event.subject.slice(5))}`
                : event.subject,
              title: event.title ?? row.title ?? null,
              url: event.url ?? row.url ?? null,
              seller_id: event.seller_id ?? row.seller_id ?? null,
              source_confidence: event.source_confidence ?? (row.source === "ebay"
                ? "marketplace_metadata"
                : "catalogue_exact_integrity_unassessed"),
              relist_signature: relistSignature({
                source: row.source,
                subject: event.subject?.startsWith("card:")
                  ? `card:${normalizeCollectorNumber(event.subject.slice(5))}`
                  : event.subject ?? row.subject,
                sellerId: row.seller_id,
                title: row.title,
              }),
            }
          : { ...legacyEvent(row), d: event.d, p: event.p });
      row.times_seen = row.history.length;
      row.relist_signature = relistSignature({
        source: row.source,
        subject: row.subject,
        sellerId: row.seller_id,
        title: row.title,
      });
      row.source_confidence = row.source === "ebay"
        ? "marketplace_metadata"
        : "catalogue_exact_integrity_unassessed";
      if (row.source !== "ebay") {
        row.integrity = "unassessed";
        row.integrity_reasons = [];
        row.seller_trust = "unassessed";
        row.listing_quality = "unassessed";
        row.analysis_version = ANALYSIS_VERSION;
        continue;
      }
      if (!groups.has(row.subject)) groups.set(row.subject, []);
      groups.get(row.subject).push(row);
    }

    for (const [subject, rows] of groups) {
      const reasonsOf = subject === "sealed"
        ? (title) => classifySealedTitle(title, {
            phrase: normalizeTitle(set?.jpOnly ? set.nameEN : set?.name),
            excludePattern: set?.ebayNot ? new RegExp(set.ebayNot, "i") : null,
            japanese: Boolean(set?.jpOnly),
          })
        : (title) => classifySingleTitle(title, { collectorNumber: subject.replace(/^card:/, "") });
      const classified = classifyRows(rows.map(currentObservation), reasonsOf);
      rows.forEach((row, index) => {
        const value = classified[index];
        row.matching = value.matching;
        row.matching_reasons = value.matchingReasons;
        row.integrity = value.integrity;
        row.integrity_reasons = value.integrityReasons;
        row.seller_trust = value.sellerTrust;
        row.seller_reasons = value.sellerReasons;
        row.listing_quality = value.listingQuality;
        row.listing_reasons = value.listingReasons;
        row.analysis_version = ANALYSIS_VERSION;
      });
    }
    await writeFile(path, `${JSON.stringify(store)}\n`);
  }
}

async function recoverPublicObservations() {
  const data = JSON.parse(await readFile(PUBLIC_PATH, "utf8"));
  let recovered = 0;
  for (const set of data.sets) {
    const quotes = [];
    if (set.boosterFR?.observations) quotes.push({ quote: set.boosterFR, subject: "sealed", reasonsOf: null });
    for (const pick of set.picks ?? []) {
      if (pick.marketFR?.observations) {
        const number = normalizeCollectorNumber(pick.number);
        quotes.push({ quote: pick.marketFR, subject: `card:${number}`, reasonsOf: (title) => classifySingleTitle(title, { collectorNumber: number }) });
      }
    }
    for (const item of quotes) {
      const rows = item.quote.observations;
      delete item.quote.observations;
      if (!rows.length) continue;
      const reasonsOf = item.reasonsOf ?? ((title) => classifySealedTitle(title, {
        phrase: normalizeTitle(set.jpOnly ? set.nameEN : set.name),
        excludePattern: bySet.get(set.id)?.ebayNot ? new RegExp(bySet.get(set.id).ebayNot, "i") : null,
        japanese: Boolean(set.jpOnly),
      }));
      const classified = classifyRows(rows, reasonsOf).map((row) => ({ ...row, source: "ebay", subject: item.subject }));
      const result = await recordObservations(set.id, classified, context);
      await recordCrawl(set.id, {
        source: "ebay",
        subject: item.subject,
        status: "migrated",
        captured: rows.length,
        stored: result.events,
        totalAvailable: item.quote.totalAvailable ?? null,
        pages: item.quote.pages ?? null,
        complete: item.quote.complete === true,
        scope: item.quote.scope ?? null,
      }, context);
      recovered += result.events;
    }
  }
  await writeFile(PUBLIC_PATH, `${JSON.stringify(data, null, 2)}\n`);
  return recovered;
}

async function repairRecoveredCrawls() {
  const data = JSON.parse(await readFile(PUBLIC_PATH, "utf8"));
  const repairContext = { ...context, runId: `migration-crawls-v4-${context.date}` };
  if (await runAlreadyCompleted(repairContext.runId)) {
    console.log("Manifeste des crawls récupérés déjà réparé ; aucune duplication.");
    return;
  }
  await recordRun(repairContext, { status: "migration-started" });
  let crawls = 0;
  for (const set of data.sets.filter((entry) => !entry.jpOnly)) {
    for (const pick of set.picks ?? []) {
      const quote = pick.marketFR;
      if (!quote) continue;
      const number = normalizeCollectorNumber(pick.number);
      await recordCrawl(set.id, {
        source: "ebay",
        subject: `card:${number}`,
        status: "migrated",
        captured: quote.scanned ?? 0,
        stored: null,
        totalAvailable: quote.totalAvailable ?? null,
        pages: quote.pages ?? null,
        complete: quote.complete === true,
        scope: quote.scope ?? { marketplace: "EBAY_FR", product: "single", collectorNumber: number },
      }, repairContext);
      crawls++;
    }
  }
  await recordRun(repairContext, { status: "migration-completed" });
  console.log(`${crawls} crawls eBay récupérés ont été inscrits au manifeste.`);
}

if (process.argv.includes("--repair-crawls")) {
  await repairRecoveredCrawls();
} else if (process.argv.includes("--compact-only")) {
  await migrateExistingStores();
  console.log("Événements historiques legacy compactés.");
} else {
  if (await runAlreadyCompleted(context.runId)) {
    console.log("Migration ledger v4 déjà terminée ; aucune duplication.");
  } else {
    await recordRun(context, { status: "migration-started" });
    await migrateExistingStores();
    const recovered = await recoverPublicObservations();
    await recordRun(context, { status: "migration-completed" });
    console.log(`Migration ledger v4 terminée : ${recovered} observations publiques récupérées.`);
  }
}
