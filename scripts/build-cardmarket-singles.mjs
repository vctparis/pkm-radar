// Repère Cardmarket carte par carte.
//
// Test grandeur nature (Gengar 071 de Shiny Star V) : notre médiane annonçait
// 27,70 € quand le carnet Cardmarket démarrait à 11,99 €. Deux causes — la
// médiane d'un carnet n'est pas un prix d'achat, et Cardmarket (le carnet le
// plus profond, surtout sur le japonais) n'était pas dans nos sources. Ce
// collecteur apporte le second : le guide public expose, par produit, le prix
// le moins cher affiché (`low`, toutes conditions et toutes langues) et la
// tendance des ventes. Ce sont des repères — jamais fusionnés avec nos
// cotations EX+ par langue.
//
// Appariement volontairement prudent : nom normalisé À L'INTÉRIEUR de
// l'extension Cardmarket du set, et UNIQUEMENT s'il est sans ambiguïté. Un
// nom porté par deux produits (variantes V / VMAX / shiny) est laissé de
// côté plutôt que deviné — le catalogue public n'expose pas les numéros de
// collection.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { SETS } from "./lib/sets.mjs";
import {
  CARDMARKET_PRICE_GUIDE_URL,
  CARDMARKET_PRODUCT_CATALOG_URL,
} from "./lib/cardmarket-public.mjs";

const SINGLES_CATALOG_URL = CARDMARKET_PRODUCT_CATALOG_URL.replace("products_nonsingles", "products_singles");
const ROOT = process.cwd();

const clean = (value) =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Nom seul : « Gengar [Life Shaker | Hypnoblast] » → « gengar ». */
const normalizeName = (value) => clean(String(value ?? "").replace(/\[[^\]]*\]|\([^)]*\)/g, " "));

/**
 * Clé d'identité fine : nom + attaques, triées.
 *
 * Cardmarket n'expose aucun numéro de collection dans son catalogue public :
 * il distingue les homonymes d'un même set par les attaques, entre crochets.
 * Or les cartes qui portent l'espérance d'un booster sont justement des
 * homonymes (« Charizard ex » y figure deux fois). Sans cette clé, elles
 * restaient sans repère de ventes européennes.
 */
const attackKey = (name, attacks) => {
  const list = (attacks ?? []).map(clean).filter(Boolean).sort();
  return `${normalizeName(name)}|${list.join("+")}`;
};

/** Attaques déclarées par Cardmarket dans le nom du produit. */
const attacksFromCardmarket = (name) => {
  const match = String(name ?? "").match(/\[([^\]]*)\]/);
  return match ? match[1].split("|").map((part) => part.trim()).filter(Boolean) : [];
};

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(300_000) });
  if (!response.ok) throw new Error(`${url} : HTTP ${response.status}`);
  return response.json();
}

const [nonsingles, singles, guide, index, productMap] = await Promise.all([
  fetchJson(CARDMARKET_PRODUCT_CATALOG_URL),
  fetchJson(SINGLES_CATALOG_URL),
  fetchJson(CARDMARKET_PRICE_GUIDE_URL),
  readFile(join(ROOT, "public", "cards-index.json"), "utf8").then(JSON.parse),
  readFile(join(ROOT, "data", "cardmarket", "product-map.json"), "utf8").then(JSON.parse),
]);

// L'extension Cardmarket d'un set : celle de son booster déjà cartographié.
const expansionBySet = new Map();
const nonsingleById = new Map(nonsingles.products.map((product) => [product.idProduct, product]));
for (const entry of productMap.products) {
  const product = nonsingleById.get(entry.idProduct);
  if (product?.idExpansion) expansionBySet.set(entry.setId, product.idExpansion);
}

const singlesByExpansion = new Map();
for (const product of singles.products) {
  if (!singlesByExpansion.has(product.idExpansion)) singlesByExpansion.set(product.idExpansion, []);
  singlesByExpansion.get(product.idExpansion).push(product);
}

const entries = [];
const skipped = { noExpansion: 0, noMatch: 0, ambiguous: 0 };
for (const set of SETS) {
  const expansion = expansionBySet.get(set.id);
  if (!expansion) {
    skipped.noExpansion += index.cards.filter((card) => card.s === set.id).length;
    continue;
  }
  const byName = new Map();
  const byAttacks = new Map();
  for (const product of singlesByExpansion.get(expansion) ?? []) {
    const nameKey = normalizeName(product.name);
    if (!byName.has(nameKey)) byName.set(nameKey, []);
    byName.get(nameKey).push(product);
    const attacks = attacksFromCardmarket(product.name);
    if (attacks.length) {
      const fine = attackKey(product.name, attacks);
      if (!byAttacks.has(fine)) byAttacks.set(fine, []);
      byAttacks.get(fine).push(product);
    }
  }
  for (const card of index.cards.filter((entry) => entry.s === set.id)) {
    // D'abord l'identité fine (nom + attaques), qui lève les homonymies ;
    // le nom seul ne sert que lorsqu'il ne désigne qu'un produit.
    const fine = card.atk?.length ? byAttacks.get(attackKey(card.n, card.atk)) ?? [] : [];
    const candidates = fine.length === 1 ? fine : byName.get(normalizeName(card.n)) ?? [];
    if (!candidates.length) {
      skipped.noMatch++;
      continue;
    }
    if (candidates.length > 1) {
      skipped.ambiguous++;
      continue;
    }
    entries.push({
      cardId: card.i,
      idProduct: candidates[0].idProduct,
      name: candidates[0].name,
      setId: set.id,
      basis: fine.length === 1 ? "name_and_attacks" : "name_only",
    });
  }
}

const guideByProduct = new Map(guide.priceGuides.map((row) => [row.idProduct, row]));
const prices = {};
let priced = 0;
for (const entry of entries) {
  const row = guideByProduct.get(entry.idProduct);
  if (!row) continue;
  priced++;
  prices[entry.cardId] = {
    idProduct: entry.idProduct,
    // `low` : l'offre la moins chère affichée, toutes conditions et toutes
    // langues confondues — un plancher de carnet, pas un prix EX+.
    low: row.low ?? null,
    trend: row.trend ?? null,
    avg30: row.avg30 ?? null,
    avg7: row.avg7 ?? null,
    avg1: row.avg1 ?? null,
  };
}

await mkdir(join(ROOT, "data", "cardmarket"), { recursive: true });
await writeFile(
  join(ROOT, "data", "cardmarket", "singles-map.json"),
  `${JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), sourceCreatedAt: singles.createdAt, entries }, null, 0)}\n`,
);
await writeFile(
  join(ROOT, "data", "cardmarket", "singles-prices.json"),
  `${JSON.stringify({
    schemaVersion: 1,
    sourceCreatedAt: guide.createdAt,
    scope: "repère produit Cardmarket : low toutes conditions/langues, tendance des ventes — jamais une cotation EX+ par langue",
    prices,
  })}\n`,
);

console.log(
  `Cardmarket singles : ${entries.length} cartes appariées (${priced} cotées) · ` +
    `${skipped.ambiguous} ambiguës écartées · ${skipped.noMatch} sans produit · ${skipped.noExpansion} sans extension`,
);
