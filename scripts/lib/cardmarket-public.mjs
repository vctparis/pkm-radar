import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export const CARDMARKET_GAME_ID = 6;
export const CARDMARKET_PRICE_GUIDE_URL =
  `https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_${CARDMARKET_GAME_ID}.json`;
export const CARDMARKET_PRODUCT_CATALOG_URL =
  `https://downloads.s3.cardmarket.com/productCatalog/productList/products_nonsingles_${CARDMARKET_GAME_ID}.json`;

const round2 = (value) => {
  if (value == null || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(Number(value).toFixed(2)) : null;
};

function parseCardmarketDate(value) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function validateProductMap(mapping, expectedSetIds = null) {
  if (mapping?.schemaVersion !== 1 || mapping?.gameId !== CARDMARKET_GAME_ID || !Array.isArray(mapping?.products)) {
    throw new Error("mapping Cardmarket invalide");
  }
  const setIds = new Set();
  const productIds = new Set();
  for (const product of mapping.products) {
    if (!product.setId || !Number.isInteger(product.idProduct) || !product.name) {
      throw new Error("produit Cardmarket incomplet dans le mapping");
    }
    if (setIds.has(product.setId)) throw new Error(`set Cardmarket dupliqué: ${product.setId}`);
    if (productIds.has(product.idProduct)) throw new Error(`idProduct Cardmarket dupliqué: ${product.idProduct}`);
    setIds.add(product.setId);
    productIds.add(product.idProduct);
  }
  if (expectedSetIds) {
    const missing = [...expectedSetIds].filter((setId) => !setIds.has(setId));
    const unknown = [...setIds].filter((setId) => !expectedSetIds.has(setId));
    if (missing.length || unknown.length) {
      throw new Error(`mapping Cardmarket non aligné — absents: ${missing.join(", ") || "aucun"}; inconnus: ${unknown.join(", ") || "aucun"}`);
    }
  }
  return mapping;
}

export function normalizePriceGuide(payload, mapping, { rawSha256, etag = null, fetchedAt = new Date().toISOString() } = {}) {
  if (payload?.version !== 1 || !Array.isArray(payload?.priceGuides)) {
    throw new Error("schéma du guide Cardmarket inconnu");
  }
  const sourceCreatedAt = parseCardmarketDate(payload.createdAt);
  if (!sourceCreatedAt) throw new Error("createdAt Cardmarket invalide");
  const snapshotDate = sourceCreatedAt.slice(0, 10);
  const byProduct = new Map(payload.priceGuides.map((row) => [Number(row.idProduct), row]));
  const observations = [];
  const missing = [];
  for (const product of mapping.products) {
    const row = byProduct.get(product.idProduct);
    if (!row) {
      missing.push(product.idProduct);
      continue;
    }
    const observation = {
      date: snapshotDate,
      sourceCreatedAt,
      fetchedAt,
      setId: product.setId,
      idProduct: product.idProduct,
      productName: product.name,
      category: product.category,
      avg: round2(row.avg),
      low: round2(row.low),
      trend: round2(row.trend),
      avg1: round2(row.avg1),
      avg7: round2(row.avg7),
      avg30: round2(row.avg30),
      currency: "EUR",
      rawSha256: rawSha256 ?? null,
      etag,
    };
    if (![observation.avg, observation.low, observation.trend].some((value) => value != null && value > 0)) {
      throw new Error(`aucun prix exploitable pour ${product.setId} (${product.idProduct})`);
    }
    observations.push(observation);
  }
  if (missing.length) throw new Error(`produits absents du guide Cardmarket: ${missing.join(", ")}`);
  return { sourceCreatedAt, snapshotDate, observations };
}

export function validateProductCatalog(payload, mapping) {
  if (payload?.version !== 1 || !Array.isArray(payload?.products)) {
    throw new Error("schéma du catalogue Cardmarket inconnu");
  }
  const sourceCreatedAt = parseCardmarketDate(payload.createdAt);
  if (!sourceCreatedAt) throw new Error("createdAt du catalogue Cardmarket invalide");
  const byProduct = new Map(payload.products.map((product) => [Number(product.idProduct), product]));
  const nameChanges = [];
  for (const mapped of mapping.products) {
    const product = byProduct.get(mapped.idProduct);
    if (!product) throw new Error(`produit mappé absent du catalogue Cardmarket: ${mapped.idProduct}`);
    if (product.categoryName !== "Pokémon Booster") {
      throw new Error(`catégorie Cardmarket inattendue pour ${mapped.setId}: ${product.categoryName}`);
    }
    if (product.name !== mapped.name) nameChanges.push({ setId: mapped.setId, expected: mapped.name, actual: product.name });
  }
  return { sourceCreatedAt, matched: mapping.products.length, nameChanges };
}

async function fetchPublicJson(url, minimumBytes) {
  const response = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!response.ok) throw new Error(`téléchargement Cardmarket HTTP ${response.status}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < minimumBytes) throw new Error(`fichier Cardmarket anormalement petit: ${bytes.length} octets`);
  let payload;
  try {
    payload = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("fichier Cardmarket JSON illisible");
  }
  return {
    payload,
    bytes,
    rawSha256: createHash("sha256").update(bytes).digest("hex"),
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
  };
}

export function appendSnapshot(history, snapshot) {
  const next = history?.schemaVersion === 1
    ? structuredClone(history)
    : { schemaVersion: 1, source: "cardmarket_public_price_guide", observations: [] };
  const byKey = new Map(next.observations.map((row) => [`${row.date}:${row.idProduct}`, row]));
  let inserted = 0;
  let unchanged = 0;
  for (const observation of snapshot.observations) {
    const key = `${observation.date}:${observation.idProduct}`;
    const previous = byKey.get(key);
    if (previous) {
      const comparable = ["avg", "low", "trend", "avg1", "avg7", "avg30", "rawSha256"];
      if (comparable.some((field) => previous[field] !== observation[field])) {
        throw new Error(`réécriture historique refusée pour ${key}`);
      }
      unchanged++;
      continue;
    }
    next.observations.push(observation);
    byKey.set(key, observation);
    inserted++;
  }
  next.observations.sort((a, b) => a.date.localeCompare(b.date) || a.idProduct - b.idProduct);
  next.updatedAt = snapshot.sourceCreatedAt;
  return { history: next, inserted, unchanged };
}

export async function fetchCardmarketPriceGuide({ etag = null } = {}) {
  const response = await fetch(CARDMARKET_PRICE_GUIDE_URL, {
    headers: etag ? { "If-None-Match": etag } : undefined,
    signal: AbortSignal.timeout(90_000),
  });
  if (response.status === 304) return { unchanged: true, etag };
  if (!response.ok) throw new Error(`guide Cardmarket HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1_000_000) throw new Error(`guide Cardmarket anormalement petit: ${bytes.length} octets`);
  const rawSha256 = createHash("sha256").update(bytes).digest("hex");
  let payload;
  try {
    payload = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("guide Cardmarket JSON illisible");
  }
  return {
    unchanged: false,
    payload,
    bytes,
    rawSha256,
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
    contentLength: bytes.length,
  };
}

export async function fetchCardmarketProductCatalog() {
  return fetchPublicJson(CARDMARKET_PRODUCT_CATALOG_URL, 100_000);
}

export async function ingestCardmarket(root, { archiveDir = process.env.CARDMARKET_ARCHIVE_DIR ?? null } = {}) {
  const mappingPath = join(root, "data", "cardmarket", "product-map.json");
  const historyPath = join(root, "data", "cardmarket", "history.json");
  const manifestPath = join(root, "data", "cardmarket", "_manifest.jsonl");
  const mapping = validateProductMap(JSON.parse(await readFile(mappingPath, "utf8")));
  const history = existsSync(historyPath)
    ? JSON.parse(await readFile(historyPath, "utf8"))
    : { schemaVersion: 1, source: "cardmarket_public_price_guide", observations: [] };
  const latestRun = existsSync(manifestPath)
    ? (await readFile(manifestPath, "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)).at(-1)
    : null;
  const fetchedAt = new Date().toISOString();
  const fetched = await fetchCardmarketPriceGuide({ etag: latestRun?.etag ?? null });
  if (fetched.unchanged) {
    const catalogFile = await fetchCardmarketProductCatalog();
    const catalog = validateProductCatalog(catalogFile.payload, mapping);
    await appendFile(manifestPath, `${JSON.stringify({
      type: "run",
      status: "unchanged",
      fetchedAt,
      etag: fetched.etag,
      mapped: mapping.products.length,
      catalogCreatedAt: catalog.sourceCreatedAt,
      catalogSha256: catalogFile.rawSha256,
      catalogNameChanges: catalog.nameChanges,
    })}\n`);
    return { status: "unchanged", inserted: 0, mapped: mapping.products.length };
  }
  const catalogFile = await fetchCardmarketProductCatalog();
  const catalog = validateProductCatalog(catalogFile.payload, mapping);
  const snapshot = normalizePriceGuide(fetched.payload, mapping, {
    rawSha256: fetched.rawSha256,
    etag: fetched.etag,
    fetchedAt,
  });
  const { history: next, inserted, unchanged } = appendSnapshot(history, snapshot);
  await mkdir(dirname(historyPath), { recursive: true });
  await writeFile(historyPath, `${JSON.stringify(next, null, 2)}\n`);
  if (archiveDir) {
    await mkdir(archiveDir, { recursive: true });
    await writeFile(join(archiveDir, `price_guide_6_${snapshot.snapshotDate}_${fetched.rawSha256.slice(0, 12)}.json`), fetched.bytes);
  }
  const run = {
    type: "run",
    status: "completed",
    fetchedAt,
    sourceCreatedAt: snapshot.sourceCreatedAt,
    snapshotDate: snapshot.snapshotDate,
    url: CARDMARKET_PRICE_GUIDE_URL,
    etag: fetched.etag,
    lastModified: fetched.lastModified,
    contentLength: fetched.contentLength,
    rawSha256: fetched.rawSha256,
    mapped: snapshot.observations.length,
    catalogCreatedAt: catalog.sourceCreatedAt,
    catalogSha256: catalogFile.rawSha256,
    catalogNameChanges: catalog.nameChanges,
    inserted,
    unchanged,
    rawArchived: Boolean(archiveDir),
  };
  await appendFile(manifestPath, `${JSON.stringify(run)}\n`);
  return run;
}
