// Pipeline d'ingestion du radar.
//
//   node scripts/ingest.mjs              relevé complet (CardTrader inclus)
//   node scripts/ingest.mjs --offline    historique Cardmarket seul, sans token
//
// Produit deux fichiers :
//   data/history.json        série accumulée des relevés live, un point par jour
//   public/radar-data.json   artefact consommé par l'interface
//
// Le fichier d'historique est versionné dans git : chaque exécution du cron
// ajoute un commit, ce qui donne gratuitement une piste d'audit des relevés.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { SETS } from "./lib/sets.mjs";
import { fetchSetCards, normalizeSet, resolveCardmarketUrl } from "./lib/ptcg.mjs";
import { momentumSeries, basketGrowth, basketGrowthSeries, normalizedPath, median, cardMomentum } from "./lib/series.mjs";
import {
  fetchExpansions,
  resolveSealedBlueprints,
  fetchBlueprints,
  pickSealedFrom,
  fetchBlueprintMarket,
  fetchExpansionSingles,
} from "./lib/cardtrader.mjs";
import { fetchSealedBoosterFR, fetchCardFR } from "./lib/ebay.mjs";
import { fetchFrenchCatalog } from "./lib/tcgdex.mjs";
import { scoreSet, scoreCard, verdictFor, concentrationOf, medianMomentumOf } from "./lib/scoring.mjs";
import { computeOpening, simulateDistribution } from "./lib/ev.mjs";

// En local le token vit dans .env.local ; en CI il vient des secrets du runner.
try {
  process.loadEnvFile(join(process.cwd(), ".env.local"));
} catch {
  // Pas de fichier local : on s'appuie sur l'environnement.
}

const ROOT = process.cwd();
const HISTORY_PATH = join(ROOT, "data", "history.json");
const OUTPUT_PATH = join(ROOT, "public", "radar-data.json");
const OFFLINE = process.argv.includes("--offline");
const TODAY = new Date().toISOString().slice(0, 10);

const log = (message) => console.log(`  ${message}`);

// Ordre de préférence des langues pour le scellé : le français d'abord puisque
// c'est le marché visé, le japonais ensuite pour les produits qui n'existent
// que sous cette forme, l'anglais en dernier recours.
const LANGUAGE_PREFERENCE = ["fr", "jp", "en"];

// CardTrader écrit "036/149", pokemontcg.io écrit "36" : on ramène les deux
// à un entier pour pouvoir apparier les deux catalogues.
function normalizeNumber(value) {
  if (!value) return null;
  const digits = String(value).split("/")[0].replace(/\D/g, "");
  return digits ? String(Number(digits)) : null;
}

async function loadHistory() {
  if (!existsSync(HISTORY_PATH)) return { snapshots: {} };
  try {
    return JSON.parse(await readFile(HISTORY_PATH, "utf8"));
  } catch {
    console.warn("  historique illisible, réinitialisation");
    return { snapshots: {} };
  }
}

// Structures vides pour un set sans historique Cardmarket : l'interface les
// reconnaît et remplace les blocs analytiques par une note d'explication.
const EMPTY_BUNDLE = { top1: [], r2_5: [], r6_15: [], r16_50: [], fond: [] };

async function buildJapaneseSet(set, expansionsByCode, history, boxStructuresRef) {
  // Le catalogue ja n'a pas les cartes, mais il a le logo du set.
  const jaMeta = await fetchFrenchCatalog(set.tcgdex, { lang: "ja" }).catch(() => null);
  // ---- CardTrader : scellé jp + singles + images --------------------------
  // TCGdex ne référence pas les cartes des sets japonais (coquilles vides) ;
  // les blueprints CardTrader portent une image_url sur 100 % du catalogue,
  // c'est donc lui qui fournit les illustrations.
  let live = null;
  let singles = [];
  let imageByNumber = new Map();
  const expansion = expansionsByCode.get(set.cardtrader.toLowerCase());
  if (expansion) {
    try {
      const blueprints = await fetchBlueprints(expansion.id);
      imageByNumber = new Map(
        blueprints
          .filter((b) => b.category_id === 73 && b.fixed_properties?.collector_number && b.image_url)
          .map((b) => [normalizeNumber(b.fixed_properties.collector_number), b.image_url]),
      );
      const sealed = pickSealedFrom(blueprints);
      const [booster, boosterBox] = await Promise.all([
        sealed.booster ? fetchBlueprintMarket(sealed.booster.id, { sealed: true, languages: ["jp"] }) : null,
        sealed.boosterBox ? fetchBlueprintMarket(sealed.boosterBox.id, { sealed: true, languages: ["jp"] }) : null,
      ]);
      const market = await fetchExpansionSingles(expansion.id);
      singles = [...market.values()].filter((entry) => entry.price != null);
      live = {
        booster,
        boosterBox,
        singles: { tracked: singles.length, offers: singles.reduce((sum, item) => sum + item.offers, 0) },
      };
      log(
        `${set.name.padEnd(20)} booster ${booster?.price ?? "—"} € (${booster?.language ?? "?"})` +
          ` · ${singles.length} singles jp suivis`,
      );
    } catch (error) {
      console.warn(`  ${set.name} : couche live indisponible (${error.message})`);
    }
  }

  // ---- eBay.fr : booster japonais vendu en France -------------------------
  let boosterFR = null;
  if (process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET) {
    try {
      boosterFR = await fetchSealedBoosterFR(set.nameEN, { japanese: true, exclude: set.ebayNot ?? null });
      log(`${set.name.padEnd(20)} eBay.fr (jp) p10 ${boosterFR.floor10 ?? "—"} € · ${boosterFR.offers} offres`);
    } catch (error) {
      console.warn(`  ${set.name} : eBay.fr indisponible (${error.message})`);
    }
  }

  // ---- Pépites : les 12 singles les plus chers, marché FR (annonces jp) ---
  // Classées et affichées au 10e centile, pas au plancher brut : une annonce
  // fantaisiste d'un vendeur unique (vu : 10 000 € sur une carte à ~1 500 €)
  // fausserait tout le haut du classement.
  const top = [...singles]
    .filter((entry) => entry.floor10 != null)
    .sort((a, b) => b.floor10 - a.floor10)
    .slice(0, 12);
  const picks = [];
  for (const entry of top) {
    let marketFR = null;
    if (process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET && entry.collectorNumber) {
      try {
        marketFR = await fetchCardFR(entry.name, entry.collectorNumber, null, { language: "Japonais" });
      } catch {
        // Marché fin : l'absence de résultat est une information, pas une erreur.
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    picks.push({
      id: `${set.id}-${entry.collectorNumber ?? entry.name}`,
      name: entry.name,
      nameFR: null,
      number: entry.collectorNumber ?? "—",
      rarity: entry.rarity ?? "—",
      image: imageByNumber.get(normalizeNumber(entry.collectorNumber)) ?? null,
      price: entry.floor10,
      momentum30: null,
      relativeStrength: null,
      sellers: entry.sellers,
      offers: entry.offers,
      marketFloor: entry.floor10,
      score: null,
      components: null,
      url: null,
      marketFR,
    });
  }

  const headline = picks[0] ?? null;

  // ---- Accumulation quotidienne -------------------------------------------
  if (live?.booster?.price != null || boosterFR?.floor10 != null) {
    const bucket = (history.snapshots[set.id] ??= []);
    const existing = bucket.find((point) => point.date === TODAY);
    const point = {
      date: TODAY,
      boosterPrice: live?.booster?.price ?? null,
      boosterOffers: live?.booster?.offers ?? null,
      boosterLanguage: live?.booster?.language ?? null,
      boxPrice: live?.boosterBox?.price ?? null,
      singlesOffers: live?.singles.offers ?? null,
      top5Value: null,
      top12ex5Value: null,
      boosterFRp10: boosterFR?.floor10 ?? null,
      boosterFRmedian: boosterFR?.median ?? null,
      boosterFRoffers: boosterFR?.offers ?? null,
      boosterFRsellers: boosterFR?.sellers ?? null,
    };
    if (existing) Object.assign(existing, point);
    else bucket.push(point);
    bucket.sort((a, b) => a.date.localeCompare(b.date));
  }

  // Ouverture japonaise : garanties PAR BOÎTE, pas hasard pur. On publie la
  // structure du set (ses slots à lui, avec ses classes à lui — jamais un
  // gabarit générique) et les pools de cartes valorisés ; le recalcul
  // conditionnel (« telle garantie déjà tirée ») se fait dans le navigateur.
  let opening = null;
  {
    const structure = boxStructuresRef[set.cardtrader.toLowerCase()];
    if (structure && singles.length) {
      const netOf = (price) => (price >= 0.4 ? price * 0.87 : 0);
      const slots = structure.slots
        .map((slot) => {
          const pool = singles
            .filter((entry) => slot.rarities.includes(entry.rarity))
            .sort((a, b) => (b.floor10 ?? 0) - (a.floor10 ?? 0));
          if (!pool.length) return null; // la règle ne s'applique pas à ce set
          const meanNet = pool.reduce((sum, entry) => sum + netOf(entry.floor10 ?? 0), 0) / pool.length;
          return {
            key: slot.key,
            label: slot.label,
            countLo: slot.count[0],
            countHi: slot.count[1],
            poolSize: pool.length,
            meanNet: Number(meanNet.toFixed(2)),
            top: pool.slice(0, 6).map((entry) => ({
              name: entry.name,
              number: entry.collectorNumber ?? "—",
              price: entry.floor10,
            })),
          };
        })
        .filter(Boolean);
      if (slots.length) {
        opening = {
          mode: "box",
          packsPerBox: structure.packsPerBox,
          boosterPrice: live?.booster?.price ?? boosterFR?.floor10 ?? null,
          confidence: structure.confidence,
          note: structure.note,
          sample: structure.sample ?? null,
          sampleSource: structure.sampleSource ?? null,
          slots,
        };
      }
    }
  }

  const ageYears = set.releaseDate
    ? (Date.now() - Date.parse(set.releaseDate)) / (365.25 * 24 * 3600 * 1000)
    : null;
  const { score, components } = scoreSet({
    diffusion: null,
    units: live?.booster?.quantity ?? null,
    sellers: live?.booster?.sellers ?? null,
    concentration: null,
    ageYears: ageYears ?? 0,
    psaGrowth30: null,
    gemRate: null,
  });

  return {
    id: set.id,
    name: set.name,
    nameEN: set.nameEN,
    era: set.era,
    jpOnly: true,
    releaseDate: set.releaseDate,
    ageYears: ageYears ? Number(ageYears.toFixed(1)) : null,
    score,
    components,
    verdict: "Japonais · mesure partielle",
    concentration: null,
    cardsTracked: singles.length,
    history: { points: [], window: null, path: [] },
    segments: null,
    bestCard: headline
      ? {
          name: headline.name,
          nameFR: null,
          image: headline.image,
          number: headline.number,
          rarity: headline.rarity,
          price: headline.price,
          change30: null,
          url: null,
        }
      : null,
    boosterFR,
    strata: [],
    growthSeries: { monthly: EMPTY_BUNDLE, quarterly: EMPTY_BUNDLE },
    contentValue: [],
    live,
    liveHistory: history.snapshots[set.id] ?? [],
    psa: null,
    opening,
    dropRates: null,
    logo: jaMeta?.logo ?? null,
    picks,
  };
}

async function main() {
  console.log(`\nRelevé du ${TODAY}${OFFLINE ? " (mode hors-ligne)" : ""}\n`);

  const history = await loadHistory();
  const psaManual = JSON.parse(await readFile(join(ROOT, "data", "manual-psa.json"), "utf8"));
  const pullRates = JSON.parse(await readFile(join(ROOT, "data", "pull-rates.json"), "utf8"));
  const boxStructures = JSON.parse(await readFile(join(ROOT, "data", "jp-box-structures.json"), "utf8"));

  // Résolution des expansions CardTrader une seule fois pour tous les sets.
  let expansionsByCode = new Map();
  if (!OFFLINE) {
    try {
      const expansions = await fetchExpansions();
      expansionsByCode = new Map(expansions.map((e) => [e.code.toLowerCase(), e]));
      log(`CardTrader : ${expansions.length} expansions Pokémon`);
    } catch (error) {
      console.warn(`  CardTrader indisponible (${error.message}) — bascule hors-ligne`);
    }
  }

  const output = [];

  for (const set of SETS) {
    // ---- Sets japonais : pipeline dédié -----------------------------------
    // Pas de catalogue pokemontcg.io (anglais uniquement), donc ni historique
    // Cardmarket, ni strates, ni croissance. Tout vient du live : CardTrader
    // (annonces jp) et eBay.fr (produits japonais vendus en France), plus le
    // catalogue TCGdex en locale ja pour les numéros et illustrations.
    if (set.jpOnly) {
      output.push(await buildJapaneseSet(set, expansionsByCode, history, boxStructures));
      continue;
    }

    const rawCards = await fetchSetCards(set.ptcg);
    const cards = normalizeSet(rawCards);
    if (!cards.length) {
      console.warn(`  ${set.name} : aucune carte exploitable, set ignoré`);
      continue;
    }

    const series = momentumSeries(cards);
    const latest = series.at(-1) ?? null;
    const medianMomentum = medianMomentumOf(cards);

    // Segments : le chase concentre l'attention, les communes disent si la
    // hausse descend réellement dans le set. C'est l'écart entre les deux qui
    // porte l'information, pas leur niveau.
    const sorted = [...cards].sort((a, b) => b.reference - a.reference);
    const segmentOf = (subset) => {
      const moves = subset.map((card) => cardMomentum(card.prices)).filter((v) => v != null);
      // 10 à 25 % des cartes n'ont enregistré aucune vente sur la fenêtre :
      // Cardmarket y recopie la même valeur et leur variation vaut exactement
      // zéro. Ce bloc plat capture la médiane et masque l'amplitude réelle,
      // d'où une seconde mesure restreinte aux cartes qui ont bougé.
      const movers = moves.filter((v) => v !== 0);
      return {
        cards: subset.length,
        change30: moves.length ? Number((median(moves) * 100).toFixed(1)) : null,
        changeMovers: movers.length ? Number((median(movers) * 100).toFixed(1)) : null,
        stale: moves.length ? Number((((moves.length - movers.length) / moves.length) * 100).toFixed(0)) : null,
        diffusion: moves.length
          ? Number(((moves.filter((v) => v > 0).length / moves.length) * 100).toFixed(1))
          : null,
      };
    };
    // Le haut du panier est pris sur 30 cartes et non sur les 12 plus chères :
    // en dessous, les relevés se concentrent sur un ou deux mois et le segment
    // ne produit pas assez de points pour être tracé.
    const TOP_TIER = 30;
    const groups = {
      chase: sorted.slice(0, TOP_TIER),
      mid: sorted.slice(TOP_TIER).filter((card) => !card.isCommon),
      commons: cards.filter((card) => card.isCommon),
    };
    const segments = {
      chase: segmentOf(groups.chase),
      mid: segmentOf(groups.mid),
      commons: segmentOf(groups.commons),
    };

    // Croissance en pourcentage par strate, en coupe.
    //
    // Volontairement une coupe et non une série : les cartes les plus chères
    // sont relevées très rarement par Cardmarket. Sur Stars Étincelantes, les
    // douze premières cartes partagent UN seul mois de relevé — une courbe y
    // répéterait le même point. Comparer les strates entre elles à leur date
    // d'observation reste en revanche parfaitement valide, et c'est bien la
    // question posée : de combien monte le haut par rapport au bas.
    // Strates par rang de valeur, SANS chevauchement : chaque étage joue un
    // rôle spéculatif distinct et l'écart entre deux étages adjacents devient
    // directement interprétable.
    //   Top 1      la carte-titre — marché propre, isolée pour ne pas polluer le reste
    //   2-5        le premier cercle des chases — début de rotation quand ça monte
    //   6-15       les chases secondaires — c'est ici que la diffusion se voit en premier
    //   16-50      la profondeur encore vendable à l'unité
    //   51+        le bulk économique — ne monte qu'en euphorie généralisée
    const tierDefs = [
      { key: "top1", label: "Carte-titre", cards: sorted.slice(0, 1), minSample: 1 },
      { key: "r2_5", label: "Rangs 2-5", cards: sorted.slice(1, 5), minSample: 2 },
      { key: "r6_15", label: "Rangs 6-15", cards: sorted.slice(5, 15), minSample: 4 },
      { key: "r16_50", label: "Rangs 16-50", cards: sorted.slice(15, 50), minSample: 8 },
      { key: "fond", label: "Fond du set (51+)", cards: sorted.slice(50), minSample: 10 },
    ];
    const strata = tierDefs.map(({ key, label, cards: subset }) => ({
      key,
      label,
      ...(basketGrowth(subset) ?? { growth: null, cards: 0, driver: null }),
    }));

    // Catalogue français : noms et images des cartes FR, indexés par numéro
    // de collection. C'est lui qui permet d'interroger eBay.fr sans bruit.
    let frCatalog = null;
    try {
      frCatalog = await fetchFrenchCatalog(set.tcgdex);
    } catch (error) {
      console.warn(`  ${set.name} : catalogue FR indisponible (${error.message})`);
    }
    const frOf = (number) => frCatalog?.byLocalId[normalizeNumber(number)] ?? null;

    // Carte phare : celle qui porte le set, et donc le risque qu'on prend en
    // achetant le set. Son lien Cardmarket est résolu pour pouvoir vérifier le
    // prix chez le marchand plutôt que sur parole.
    const headline = sorted[0];
    const bestCard = headline
      ? {
          name: headline.name,
          nameFR: frOf(headline.number)?.name ?? null,
          image: frOf(headline.number)?.image ?? headline.image,
          number: headline.number,
          rarity: headline.rarity,
          price: Number(headline.reference.toFixed(2)),
          change30: headline.prices.avg30 > 0 && headline.prices.avg7 > 0
            ? Number(((headline.prices.avg7 / headline.prices.avg30 - 1) * 100).toFixed(1))
            : null,
          url: await resolveCardmarketUrl(headline.cardmarketUrl),
        }
      : null;

    // Séries temporelles à deux lissages : mensuel (fenêtre 90 j avancée mois
    // par mois) et trimestriel (fenêtre 180 j avancée trimestre par trimestre).
    // L'historique ne peut pas remonter plus loin que novembre 2025 : c'est la
    // première date de relevé Cardmarket disponible, aucune source accessible
    // ne vend plus profond.
    const bundleAt = (opts) =>
      Object.fromEntries(
        tierDefs.map((tier) => [
          tier.key,
          basketGrowthSeries(tier.cards, { minSample: tier.minSample, ...opts }),
        ]),
      );
    const growthSeries = {
      monthly: bundleAt({ rollingDays: 90, stepMonths: 1 }),
      quarterly: bundleAt({ rollingDays: 180, stepMonths: 3 }),
    };
    const contentValue = basketGrowthSeries(cards, { minSample: 10 });

    // ---- Couche live CardTrader -------------------------------------------
    let live = null;
    let singlesMarket = new Map();
    const expansion = expansionsByCode.get(set.cardtrader.toLowerCase());

    if (expansion) {
      try {
        const sealed = await resolveSealedBlueprints(expansion.id);
        const [booster, boosterBox] = await Promise.all([
          sealed.booster ? fetchBlueprintMarket(sealed.booster.id, { sealed: true, languages: LANGUAGE_PREFERENCE }) : null,
          sealed.boosterBox
            ? fetchBlueprintMarket(sealed.boosterBox.id, { sealed: true, languages: LANGUAGE_PREFERENCE })
            : null,
        ]);
        singlesMarket = await fetchExpansionSingles(expansion.id);

        const singleOffers = [...singlesMarket.values()];
        live = {
          booster,
          boosterBox,
          singles: {
            tracked: singleOffers.length,
            offers: singleOffers.reduce((sum, item) => sum + item.offers, 0),
          },
        };
        log(
          `${set.name.padEnd(20)} booster ${booster?.price ?? "—"} € · ${booster?.offers ?? 0} offres` +
            ` · ${singleOffers.length} singles suivis`,
        );
      } catch (error) {
        console.warn(`  ${set.name} : couche live indisponible (${error.message})`);
      }
    }

    // ---- Couche live eBay.fr ----------------------------------------------
    // Le marché français du scellé, absent de CardTrader (marketplace
    // italienne, zéro booster FR). Le plancher brut y est pollué par des
    // échantillons à 2-3 € : le 10e centile et la médiane sont les mesures.
    let boosterFR = null;
    if (!OFFLINE && process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET) {
      try {
        boosterFR = await fetchSealedBoosterFR(set.name, { exclude: set.ebayNot ?? null });
        log(
          `${set.name.padEnd(20)} eBay.fr p10 ${boosterFR.floor10 ?? "—"} € · médiane ${boosterFR.median ?? "—"} €` +
            ` · ${boosterFR.offers} offres / ${boosterFR.sellers} vendeurs`,
        );
      } catch (error) {
        console.warn(`  ${set.name} : eBay.fr indisponible (${error.message})`);
      }
    }

    // ---- Espérance d'ouverture ---------------------------------------------
    // Prix de référence : le booster français (p10 eBay), à défaut CardTrader.
    // Ère déduite de l'identifiant pokemontcg.io.
    let opening = null;
    {
      const eraKey = set.ptcg.startsWith("sv")
        ? "sv"
        : set.ptcg.startsWith("swsh")
          ? "swsh"
          : set.ptcg.startsWith("xy")
            ? "xy"
            : "sm";
      const era = pullRates.eras[eraKey];
      const override = pullRates.setOverrides?.[set.ptcg] ?? {};
      const referencePrice = boosterFR?.floor10 ?? live?.booster?.price ?? null;
      // Les taux d'une ère sont un défaut, pas une loi : un set peut
      // surcharger classe par classe (boosters atypiques, slots propres).
      const eraClasses = { ...era?.classes, ...(override.classes ?? {}) };
      if (era && referencePrice) {
        opening = computeOpening(cards, eraClasses, {
          boosterPrice: referencePrice,
          fees: pullRates.fees,
          bulkThreshold: pullRates.bulkThreshold,
          boostersPerDisplay: override.boostersPerDisplay !== undefined ? override.boostersPerDisplay : era.boostersPerDisplay,
        });
        if (opening) {
          opening.mode = "booster";
          opening.distribution = simulateDistribution(cards, eraClasses, {
            boosterPrice: referencePrice,
            fees: pullRates.fees,
            bulkThreshold: pullRates.bulkThreshold,
          });
          opening.confidence = override.confidence ?? era.confidence;
          opening.partialNote = pullRates.partialSets?.[set.ptcg] ?? null;
          // Nom français de la carte-titre côté ouverture
          if (opening.top1) opening.top1.nameFR = frOf(opening.top1.number)?.name ?? null;
          for (const pull of opening.topPulls) pull.nameFR = frOf(pull.number)?.name ?? null;
        }
      }
    }

    // ---- Taux de drop par classe de rareté ---------------------------------
    // La même table que le moteur d'ouverture, mais exposée telle quelle :
    // « n'importe quelle carte de la classe » (taux de la classe) et « une
    // carte précise » (taux ÷ effectif de la classe DANS CE SET), plus la
    // médiane de prix de la classe et sa contribution par booster.
    let dropRates = null;
    {
      const eraKey = set.ptcg.startsWith("sv")
        ? "sv"
        : set.ptcg.startsWith("swsh")
          ? "swsh"
          : set.ptcg.startsWith("xy")
            ? "xy"
            : "sm";
      const era = pullRates.eras[eraKey];
      const override = pullRates.setOverrides?.[set.ptcg] ?? {};
      const eraClasses = { ...era?.classes, ...(override.classes ?? {}) };
      const rows = [];
      for (const [rarity, spec] of Object.entries(eraClasses)) {
        const group = cards.filter((card) => card.rarity === rarity);
        if (!group.length) continue;
        const prices = group.map((card) => card.reference).sort((a, b) => a - b);
        const rateMid = (spec.lo + spec.hi) / 2;
        // L'espérance exige la MOYENNE de la classe (Σ p·prix = taux × moyenne) :
        // dans une classe asymétrique — six full arts à 3 € et un Celebi V à
        // 99 € — la médiane décrit le hit typique mais ignore la carte-titre,
        // et la somme des contributions sous-évalue le booster. On garde la
        // médiane pour l'affichage du hit typique, la moyenne pour le calcul.
        const mean = prices.reduce((sum, value) => sum + value, 0) / prices.length;
        rows.push({
          rarity,
          count: group.length,
          rateLo: spec.lo,
          rateHi: spec.hi,
          oneInAny: Math.round(1 / rateMid),
          oneInSpecific: Math.round(group.length / rateMid),
          median: Number(prices[Math.floor(prices.length / 2)].toFixed(2)),
          mean: Number(mean.toFixed(2)),
          contribution: Number((rateMid * mean).toFixed(2)),
          premium: Boolean(spec.premium),
        });
      }
      if (rows.length) {
        rows.sort((a, b) => b.rateHi - a.rateHi);
        dropRates = {
          classes: rows,
          grossPerBooster: Number(rows.reduce((sum, row) => sum + row.contribution, 0).toFixed(2)),
          confidence: override.confidence ?? era.confidence,
          eraLabel: era.label,
          sample: era.sample ?? null,
          sampleSource: era.sampleSource ?? null,
          partialNote: pullRates.partialSets?.[set.ptcg] ?? null,
        };
      }
    }

    // Index des cotations live par numéro de carte, partagé par les paniers
    // fixes et la sélection de pépites.
    const byNumber = new Map();
    for (const entry of singlesMarket.values()) {
      const key = normalizeNumber(entry.collectorNumber);
      if (key && !byNumber.has(key)) byNumber.set(key, entry);
    }

    // Paniers fixes suivis au prix du jour.
    //
    // Aucune source accessible ne vend 3-4 ans d'historique de prix : l'API
    // PriceCharting ne sert que le prix courant, CardTrader n'a aucun
    // historique, et le plus profond du marché plafonne à 12 mois. La seule
    // façon d'obtenir cette profondeur est de commencer à l'enregistrer.
    //
    // La composition des paniers est figée une fois pour toutes par le prix de
    // référence Cardmarket, puis valorisée chaque jour au plancher CardTrader.
    // Panier fixe = un vrai indice de prix : ce qui bouge est le prix, jamais
    // le contenu.
    const liveValueOf = (subset) => {
      const prices = subset
        .map((card) => byNumber.get(normalizeNumber(card.number))?.price)
        .filter((price) => typeof price === "number" && price > 0);
      // Sous la moitié du panier coté, la somme décrirait surtout les absents.
      if (prices.length < Math.ceil(subset.length / 2)) return null;
      return {
        value: Number(prices.reduce((sum, price) => sum + price, 0).toFixed(2)),
        matched: prices.length,
        of: subset.length,
      };
    };
    const top5Live = liveValueOf(sorted.slice(0, 5));
    const top12ex5Live = liveValueOf(sorted.slice(5, 12));

    // Accumulation : un point par jour et par set, jamais écrasé rétroactivement.
    if (live?.booster?.price != null || boosterFR?.floor10 != null) {
      const bucket = (history.snapshots[set.id] ??= []);
      const existing = bucket.find((point) => point.date === TODAY);
      const point = {
        date: TODAY,
        boosterPrice: live?.booster?.price ?? null,
        boosterOffers: live?.booster?.offers ?? null,
        boosterLanguage: live?.booster?.language ?? null,
        boxPrice: live?.boosterBox?.price ?? null,
        singlesOffers: live?.singles.offers ?? null,
        top5Value: top5Live?.value ?? null,
        top12ex5Value: top12ex5Live?.value ?? null,
        // eBay.fr : p10 plutôt que plancher (bruit), médiane en confirmation.
        boosterFRp10: boosterFR?.floor10 ?? null,
        boosterFRmedian: boosterFR?.median ?? null,
        boosterFRoffers: boosterFR?.offers ?? null,
        boosterFRsellers: boosterFR?.sellers ?? null,
      };
      if (existing) Object.assign(existing, point);
      else bucket.push(point);
      bucket.sort((a, b) => a.date.localeCompare(b.date));
    }

    // ---- Sélection des cartes ---------------------------------------------
    const cardsById = new Map(cards.map((card) => [card.id, card]));
    const context = { medianMomentum };
    const picks = cards
      .map((card) => scoreCard(card, byNumber.get(normalizeNumber(card.number)) ?? null, context))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

    // Enrichissement des 12 pépites retenues : nom et image de la carte
    // FRANÇAISE, lien Cardmarket, et surtout le marché français réel relevé
    // sur eBay.fr — vendeurs, plancher, profondeur. Les métriques affichées
    // reposent sur ces annonces françaises ; les listings CardTrader toutes
    // langues ne servent qu'au classement initial, jamais à la lecture.
    const enrichedPicks = [];
    for (const pick of picks.slice(0, 12)) {
      const fr = frOf(pick.number);
      let marketFR = null;
      if (!OFFLINE && fr?.name && process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET) {
        try {
          marketFR = await fetchCardFR(fr.name, normalizeNumber(pick.number), frCatalog?.officialCount);
        } catch (error) {
          console.warn(`  ${set.name} · ${pick.name} : marché FR indisponible (${error.message})`);
        }
        // L'API Browse tient 5 requêtes/s sans broncher ; on reste large.
        await new Promise((r) => setTimeout(r, 250));
      }
      enrichedPicks.push({
        ...pick,
        nameFR: fr?.name ?? null,
        image: fr?.image ?? pick.image,
        url: await resolveCardmarketUrl(cardsById.get(pick.id)?.cardmarketUrl ?? null),
        marketFR,
      });
    }

    // ---- Score du set ------------------------------------------------------
    const psa = psaManual[set.id] ?? null;
    const psaHistory = psa?.history ?? [];
    const psaGrowth30 =
      psaHistory.length >= 2
        ? ((psaHistory.at(-1).total / psaHistory.at(-2).total - 1) * 100)
        : null;

    const releaseDate = rawCards[0]?.set?.releaseDate ?? null;
    const ageYears = releaseDate
      ? (Date.now() - Date.parse(releaseDate.replaceAll("/", "-"))) / (365.25 * 24 * 3600 * 1000)
      : null;

    const concentration = concentrationOf(cards);
    const { score, components } = scoreSet({
      diffusion: latest?.diffusion ?? null,
      units: live?.booster?.quantity ?? null,
      sellers: live?.booster?.sellers ?? null,
      concentration,
      ageYears: ageYears ?? 0,
      psaGrowth30,
      gemRate: psa?.gemRate ?? null,
    });

    output.push({
      id: set.id,
      name: set.name,
      nameEN: set.nameEN,
      era: set.era,
      releaseDate,
      ageYears: ageYears ? Number(ageYears.toFixed(1)) : null,
      score,
      components,
      verdict: verdictFor(score, latest?.diffusion ?? null),
      concentration,
      cardsTracked: cards.length,
      history: {
        points: series,
        window: series.length ? { from: series[0].date, to: series.at(-1).date } : null,
        path: normalizedPath(cards),
      },
      segments,
      bestCard,
      boosterFR,
      opening,
      dropRates,
      logo: frCatalog?.logo ?? null,
      strata,
      growthSeries,
      contentValue,
      live,
      liveHistory: history.snapshots[set.id] ?? [],
      psa: psa ? { gemRate: psa.gemRate, growth30: psaGrowth30, history: psaHistory } : null,
      picks: enrichedPicks,
    });
  }

  await mkdir(join(ROOT, "data"), { recursive: true });
  await writeFile(HISTORY_PATH, `${JSON.stringify(history, null, 2)}\n`);

  const payload = {
    generatedAt: new Date().toISOString(),
    sets: output.sort((a, b) => b.score - a.score),
    sources: [
      {
        id: "cardmarket",
        label: "Cardmarket via pokemontcg.io",
        role: "Historique des prix de cartes",
        note: "Moyennes glissantes avg30 / avg7 / avg1 rattachées à la date de relevé de chaque carte.",
      },
      {
        id: "cardtrader",
        label: "CardTrader",
        role: "Prix demandés et profondeur d'offre en temps réel",
        note: "Aucun historique côté API : la série se construit un relevé par jour. Marketplace italienne — quasiment aucun produit en français.",
      },
      {
        id: "ebay",
        label: "eBay.fr (Browse API)",
        role: "Marché français du scellé",
        note: "Boosters neufs, achat immédiat, vendeurs en France. Le plancher brut étant pollué par des annonces atypiques, les mesures retenues sont le 10e centile et la médiane.",
      },
      {
        id: "tcgdex",
        label: "TCGdex",
        role: "Catalogue français",
        note: "Noms et illustrations des cartes françaises. C'est lui qui rend les requêtes eBay.fr précises (nom FR + numéro de collection).",
      },
      {
        id: "psa",
        label: "PSA (relevé manuel)",
        role: "Population gradée",
        note: "Pas d'API publique. Les points sont saisis à la main dans data/manual-psa.json — couvre les 6 sets d'origine.",
      },
    ],
  };
  await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);

  console.log(`\n${output.length} sets écrits dans public/radar-data.json`);
  console.log(`historique : ${Object.values(history.snapshots).flat().length} relevés cumulés\n`);
}

main().catch((error) => {
  console.error(`\nÉchec de l'ingestion : ${error.message}\n`);
  process.exit(1);
});
