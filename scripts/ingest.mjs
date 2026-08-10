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
import { fetchSetCards, normalizeSet } from "./lib/ptcg.mjs";
import { momentumSeries, basketGrowth, basketGrowthSeries, normalizedPath, median, cardMomentum } from "./lib/series.mjs";
import {
  fetchExpansions,
  resolveSealedBlueprints,
  fetchBlueprintMarket,
  fetchExpansionSingles,
} from "./lib/cardtrader.mjs";
import { scoreSet, scoreCard, verdictFor, concentrationOf, medianMomentumOf } from "./lib/scoring.mjs";

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

async function main() {
  console.log(`\nRelevé du ${TODAY}${OFFLINE ? " (mode hors-ligne)" : ""}\n`);

  const history = await loadHistory();
  const psaManual = JSON.parse(await readFile(join(ROOT, "data", "manual-psa.json"), "utf8"));

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
    const strata = [
      { key: "top5", label: "Top 5", cards: sorted.slice(0, 5) },
      { key: "top12", label: "Top 12", cards: sorted.slice(0, 12) },
      { key: "top30", label: "Top 30", cards: sorted.slice(0, 30) },
      { key: "mid", label: "Intermédiaires", cards: groups.mid },
      { key: "commons", label: "Communes", cards: groups.commons },
    ].map(({ key, label, cards: subset }) => ({ key, label, ...(basketGrowth(subset) ?? { growth: null, cards: 0 }) }));

    // Séries temporelles réservées aux strates assez étalées dans le temps.
    const growthSeries = {
      mid: basketGrowthSeries(groups.mid, { minSample: 5 }),
      commons: basketGrowthSeries(groups.commons, { minSample: 5 }),
    };

    // Valeur du contenu : croissance de l'ensemble des cartes du set, pondérée
    // par leur prix. C'est la meilleure approximation disponible de la tendance
    // économique derrière un booster — CardTrader n'expose aucun historique de
    // prix scellé, donc la vraie courbe du booster ne peut que s'accumuler à
    // partir d'aujourd'hui.
    const contentValue = basketGrowthSeries(cards, { minSample: 10 });

    // ---- Couche live CardTrader -------------------------------------------
    let live = null;
    let singlesMarket = new Map();
    const expansion = expansionsByCode.get(set.cardtrader.toLowerCase());

    if (expansion) {
      try {
        const sealed = await resolveSealedBlueprints(expansion.id);
        const [booster, boosterBox] = await Promise.all([
          sealed.booster ? fetchBlueprintMarket(sealed.booster.id, { sealed: true }) : null,
          sealed.boosterBox ? fetchBlueprintMarket(sealed.boosterBox.id, { sealed: true }) : null,
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

    // Accumulation : un point par jour et par set, jamais écrasé rétroactivement.
    if (live?.booster?.price != null) {
      const bucket = (history.snapshots[set.id] ??= []);
      const existing = bucket.find((point) => point.date === TODAY);
      const point = {
        date: TODAY,
        boosterPrice: live.booster.price,
        boosterOffers: live.booster.offers,
        boxPrice: live.boosterBox?.price ?? null,
        singlesOffers: live.singles.offers,
      };
      if (existing) Object.assign(existing, point);
      else bucket.push(point);
      bucket.sort((a, b) => a.date.localeCompare(b.date));
    }

    // ---- Sélection des cartes ---------------------------------------------
    const byNumber = new Map();
    for (const entry of singlesMarket.values()) {
      const key = normalizeNumber(entry.collectorNumber);
      if (key && !byNumber.has(key)) byNumber.set(key, entry);
    }

    const context = { medianMomentum };
    const picks = cards
      .map((card) => scoreCard(card, byNumber.get(normalizeNumber(card.number)) ?? null, context))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

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
      strata,
      growthSeries,
      contentValue,
      live,
      liveHistory: history.snapshots[set.id] ?? [],
      psa: psa ? { gemRate: psa.gemRate, growth30: psaGrowth30, history: psaHistory } : null,
      picks: picks.slice(0, 8),
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
        note: "Aucun historique côté API : la série se construit un relevé par jour.",
      },
      {
        id: "psa",
        label: "PSA (relevé manuel)",
        role: "Population gradée",
        note: "Pas d'API publique. Les points sont saisis à la main dans data/manual-psa.json.",
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
