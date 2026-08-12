// Modèle de sélection.
//
// Postulat de départ : l'inflation généralisée de TOUTES les cartes n'est pas
// tenable. Le modèle est donc construit pour être sceptique par défaut et ne
// distinguer que les situations où la hausse a une cause structurelle.
//
// Conséquence sur les pondérations : un fort momentum, seul, ne rapporte
// presque rien — c'est le signal le plus facile à fabriquer et le premier à se
// retourner. Ce qui compte, c'est la conjonction rareté d'offre + largeur de la
// participation. Une hausse portée par trois cartes sur deux cents est un pump,
// pas une revalorisation de set.

import { median } from "./series.mjs";

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

// Normalise une valeur dans [0,100] par rapport à un intervalle attendu.
const scale = (value, low, high) => clamp(((value - low) / (high - low)) * 100);

/**
 * Score d'un SET — répond à « quel booster ».
 */
export function scoreSet({ diffusion, units, sellers, concentration, ageYears, psaGrowth30, gemRate }) {
  // Largeur de la participation. Sous 50 %, la majorité du set baisse :
  // la hausse éventuelle est portée par une minorité de cartes.
  const breadth = diffusion == null ? 40 : scale(diffusion, 25, 70);

  // Rareté de l'offre sealed, mesurée en boosters réellement disponibles et non
  // en annonces : un vendeur qui liste 76 unités en une annonce pèse autant sur
  // le marché que 76 vendeurs. Sur le périmètre observé la profondeur va de
  // ~20 à ~530 unités, d'où le plafond à 500.
  const depth = units == null ? null : clamp(100 - (units / 500) * 100);
  // Le nombre de vendeurs distincts complète la mesure : une offre concentrée
  // sur deux mains peut se refermer d'un coup, ou s'effondrer d'un coup.
  const spreadOfSupply = sellers == null ? null : clamp(100 - (sellers / 30) * 100);
  const scarcity =
    depth == null && spreadOfSupply == null
      ? 45
      : depth == null
        ? spreadOfSupply
        : spreadOfSupply == null
          ? depth
          : 0.65 * depth + 0.35 * spreadOfSupply;

  // Diversification : un set dont la valeur tient à une seule carte hérite du
  // risque de cette carte, pas de celui du set.
  const spread = concentration == null ? 50 : clamp(100 - concentration);

  // Maturité : le risque de reprint et l'ouverture de displays s'éteignent
  // avec le temps. Plafonné à 9 ans, au-delà l'âge n'ajoute plus d'information.
  const maturity = clamp((ageYears / 9) * 100);

  // Dilution par le grading : chaque PSA 10 supplémentaire érode la rareté
  // d'état. Croissance mensuelle forte + gem rate élevé = rareté qui s'évapore.
  const psaResistance =
    psaGrowth30 == null || gemRate == null
      ? 50
      : 0.5 * clamp(100 - psaGrowth30 * 30) + 0.5 * clamp(100 - gemRate);

  const score =
    0.3 * breadth + 0.25 * scarcity + 0.2 * psaResistance + 0.15 * spread + 0.1 * maturity;

  return {
    score: Math.round(score),
    components: {
      breadth: Math.round(breadth),
      scarcity: Math.round(scarcity),
      psaResistance: Math.round(psaResistance),
      spread: Math.round(spread),
      maturity: Math.round(maturity),
    },
  };
}

export function verdictFor(score, diffusion) {
  if (diffusion != null && diffusion < 40) return "Hausse non diffusée";
  if (score >= 70) return "Structure large";
  if (score >= 55) return "Diffusion sélective";
  if (score >= 40) return "Sous surveillance";
  return "Concentré et dilué";
}

/**
 * Score d'une CARTE — répond à « quelles cartes dans ce booster ».
 *
 * @param card       carte normalisée (prix Cardmarket)
 * @param market     agrégat CardTrader du même blueprint, ou null
 * @param context    statistiques du set servant de référence relative
 */
export function scoreCard(card, market, context) {
  const { avg30, avg7, avg1, trendPrice } = card.prices;

  // Le bulk n'est pas un objet de spéculation : sous ~40 centimes, les frais
  // d'envoi et de mise en vente dépassent toute plus-value envisageable.
  if (!(trendPrice > 0.4)) return null;

  const momentum = avg30 > 0 && avg7 > 0 ? avg7 / avg30 - 1 : 0;

  // Force relative : ce qui compte n'est pas de monter, c'est de monter quand
  // le reste du set ne monte pas. C'est ce qui sépare une revalorisation
  // propre à la carte d'une simple marée qui soulève tous les bateaux.
  const relative = momentum - (context.medianMomentum ?? 0);

  // Tension de l'offre, mesurée en vendeurs distincts plutôt qu'en annonces :
  // un seul vendeur avec quarante exemplaires n'est pas une offre profonde.
  const sellers = market?.sellers ?? null;
  const tightness = sellers == null ? 45 : clamp(100 - (sellers / 40) * 100);

  // Étendue du marché observé : le nombre de vendeurs est un proxy de largeur,
  // PAS une mesure de liquidité. La liquidité exigera des flux d'annonces, des
  // sorties, un spread et une stabilité de prix sur plusieurs relevés complets.
  const marketBreadth = sellers == null ? 40 : sellers < 3 ? 20 : scale(sellers, 3, 25);

  // Décote court terme : le spot sous la moyenne 7 jours est un point
  // d'entrée, pas un signal de faiblesse, tant que la tendance tient.
  const discount = avg1 > 0 && avg7 > 0 ? clamp((1 - avg1 / avg7) * 400 + 50) : 50;

  const score =
    0.3 * clamp(50 + relative * 250) +
    0.28 * tightness +
    0.17 * marketBreadth +
    0.15 * discount +
    0.1 * clamp(50 + momentum * 200);

  return {
    id: card.id,
    name: card.name,
    number: card.number,
    rarity: card.rarity,
    image: card.image,
    price: Number(trendPrice.toFixed(2)),
    momentum30: Number((momentum * 100).toFixed(1)),
    relativeStrength: Number((relative * 100).toFixed(1)),
    sellers,
    offers: market?.offers ?? null,
    marketFloor: market?.price ?? null,
    score: Math.round(score),
    components: {
      relative: Math.round(clamp(50 + relative * 250)),
      tightness: Math.round(tightness),
      marketBreadth: Math.round(marketBreadth),
      discount: Math.round(discount),
    },
  };
}

// Part de la valeur du set concentrée sur la carte la plus chère.
export function concentrationOf(cards) {
  const values = cards.map((card) => card.reference).filter((v) => v > 0);
  if (values.length < 5) return null;
  const total = values.reduce((sum, v) => sum + v, 0);
  const top = Math.max(...values);
  return Math.round((top / total) * 100);
}

export function medianMomentumOf(cards) {
  const values = cards
    .map((card) => (card.prices.avg30 > 0 && card.prices.avg7 > 0 ? card.prices.avg7 / card.prices.avg30 - 1 : null))
    .filter((v) => v != null);
  return values.length ? median(values) : 0;
}
