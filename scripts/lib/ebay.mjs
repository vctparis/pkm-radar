// Source eBay Browse API : annonces actives sur eBay.fr.
//
// C'est la pièce qui manquait à CardTrader : le marché FRANÇAIS. CardTrader
// (marketplace italienne) n'a aucun booster scellé français ; eBay.fr en
// regorge. On y lit des prix demandés — comme partout ailleurs — mais dans la
// bonne langue et avec la profondeur d'offre du premier marché généraliste.
//
// Authentification : OAuth « client credentials ». Pas d'utilisateur, pas de
// consentement — l'application échange son couple App ID / Cert ID contre un
// jeton d'application valable 2 h, portée basique `api_scope`, suffisante
// pour Browse. Le jeton est mis en cache et renouvelé avant expiration.

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

function summarize(items) {
  const prices = items
    .map((item) => Number(item.price?.value))
    .filter((value) => value > 0)
    .sort((a, b) => a - b);
  if (!prices.length) return { price: null, floor10: null, offers: 0, sellers: 0 };
  return {
    price: prices[0],
    // Comme pour CardTrader : le 10e centile décrit mieux le prix réellement
    // payable que le plancher brut, manipulable par une annonce fantaisiste.
    floor10: prices[Math.floor(prices.length * 0.1)],
    median: prices[Math.floor(prices.length / 2)],
    offers: prices.length,
    sellers: new Set(items.map((item) => item.seller?.username).filter(Boolean)).size,
  };
}

/**
 * Marché du booster scellé d'un set sur eBay.fr.
 *
 * Le bruit est le vrai adversaire : la même recherche remonte des lots de dix,
 * des displays, des artsets, des kits d'avant-première et des cartes à code
 * pour le jeu en ligne. Deux remparts : la catégorie 183456 — « JCC : boosters
 * scellés », l'ID propre à eBay.fr, PAS le 183454 du site américain qui ne
 * matche à peu près rien ici — puis un filtre de titre pour ce qui reste.
 */
const NOISE = /display|coffret|lot\b|artset|art set|kit|code|avant.premi|ouvert|vide|empty|présentoir/i;
// « 5 Booster Pokémon… » : une quantité ≥ 2 devant « booster » signale un lot,
// dont le prix ne se compare pas à l'unité.
const MULTIPACK = /\b([2-9]|\d{2,})\s*boosters?\b/i;

export async function fetchSealedBoosterFR(frenchSetName) {
  const payload = await browse({
    q: `pokemon booster ${frenchSetName}`,
    category_ids: "183456",
    filter: "conditions:{NEW},buyingOptions:{FIXED_PRICE},itemLocationCountry:FR",
    limit: "100",
  });

  const needle = frenchSetName.toLowerCase().split(" ")[0];
  const items = (payload.itemSummaries ?? []).filter((item) => {
    const title = (item.title ?? "").toLowerCase();
    if (NOISE.test(title) || MULTIPACK.test(title)) return false;
    return title.includes(needle);
  });

  return { ...summarize(items), matched: items.length, scanned: payload.total ?? 0 };
}

/**
 * Marché français d'UNE carte sur eBay.fr — les vendeurs réels.
 *
 * La requête « {nom français} {numéro}/{total} » est très discriminante : le
 * numéro de collection est unique dans le set et les vendeurs français
 * l'écrivent systématiquement dans leurs titres. L'aspect Langue:Français
 * fait le tri des versions étrangères, et le filtre de titre écarte les
 * annonces « au choix » des boutiques (leur prix ne décrit pas cette carte)
 * ainsi que les lots.
 */
const SINGLES_CATEGORY = "183454"; // « JCC : cartes à l'unité » sur eBay.fr
const SINGLES_NOISE = /\blots?\b|au[x]? choix|coffret|display|proxy|fake|custom|métal|metal/i;

export async function fetchCardFR(frenchName, collectorNumber, officialCount) {
  const numberTag = officialCount ? `${collectorNumber}/${officialCount}` : collectorNumber;
  const payload = await browse({
    q: `${frenchName} ${numberTag}`,
    category_ids: SINGLES_CATEGORY,
    filter: "buyingOptions:{FIXED_PRICE},itemLocationCountry:FR",
    aspect_filter: `categoryId:${SINGLES_CATEGORY},Langue:{Français}`,
    limit: "50",
  });

  const items = (payload.itemSummaries ?? []).filter((item) => {
    const title = (item.title ?? "") .toLowerCase();
    if (SINGLES_NOISE.test(title)) return false;
    // Le numéro de collection doit apparaître : sans lui, on ne sait pas si
    // l'annonce décrit cette carte ou une autre du même Pokémon.
    return title.includes(String(collectorNumber).toLowerCase());
  });

  return { ...summarize(items), matched: items.length, scanned: payload.total ?? 0 };
}

// Test de bout en bout : jeton + une recherche.
export async function healthcheck() {
  await applicationToken();
  const result = await browse({ q: "pokemon booster", limit: "1" });
  return { ok: true, sampleTotal: result.total ?? 0 };
}
