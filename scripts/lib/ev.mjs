// Moteur d'espérance d'ouverture.
//
// La question posée : « ce booster coûte X ; ce qu'il peut contenir, pondéré
// par les probabilités de tirage, vaut combien ? ». Trois principes tiennent
// tout le moteur :
//
//   1. FOURCHETTES, jamais un point. Les taux de tirage sont des estimations
//      communautaires : chaque classe porte [lo, hi] et tout le calcul est
//      propagé en intervalle.
//   2. VALEUR NETTE, pas affichée. Une carte tirée se revend moins cher que
//      son prix demandé : frais de marketplace déduits (~13 %), et tout ce qui
//      vaut moins que le seuil bulk compte pour ZÉRO — sous les frais d'envoi,
//      une carte n'a pas de valeur réalisable.
//   3. L'ESPÉRANCE N'EST PAS LE RÉSULTAT TYPIQUE. La distribution est
//      violemment asymétrique : on calcule aussi P(rembourser son booster),
//      qui est le chiffre qui dégrise.

const round2 = (v) => Number(v.toFixed(2));

/**
 * @param cards      cartes normalisées du set (prix Cardmarket + rareté)
 * @param eraClasses table {rareté: {lo, hi, premium?}} de l'ère
 * @param options    { boosterPrice, fees, bulkThreshold, boostersPerDisplay }
 */
export function computeOpening(cards, eraClasses, options) {
  const { boosterPrice, fees = 0.13, bulkThreshold = 0.4, boostersPerDisplay = 36, looseModel = "mappable" } = options;
  if (!boosterPrice || boosterPrice <= 0) return null;

  // Valeur réalisable d'une carte tirée.
  const netOf = (price) => (price >= bulkThreshold ? price * (1 - fees) : 0);

  // Regroupement par classe de rareté couverte par la table de l'ère.
  const byClass = new Map();
  for (const card of cards) {
    const spec = eraClasses[card.rarity];
    if (!spec) continue; // communes/peu communes : valeur nette ≈ 0, ignorées
    if (!byClass.has(card.rarity)) byClass.set(card.rarity, []);
    byClass.get(card.rarity).push(card);
  }
  if (!byClass.size) return null;

  // EV par classe : Σ p_i × v_i = taux_classe × moyenne(v) quand le taux se
  // répartit uniformément entre les cartes de la classe.
  let evLo = 0;
  let evHi = 0;
  let looseLo = 0;
  let looseHi = 0;
  // En modèle "independent" (SV), le worst-case « lot trié » n'est pas
  // crédible : aucune décote n'est défendable, le plancher loose EST le
  // nominal — les champs loose* dupliquent net* plutôt que de publier un
  // chiffre que le modèle lui-même désavoue.
  const independent = looseModel === "independent";
  const perCard = []; // { card, pLo, pHi, net }

  for (const [rarity, group] of byClass) {
    const spec = eraClasses[rarity];
    const meanNet = group.reduce((sum, card) => sum + netOf(card.reference), 0) / group.length;
    evLo += spec.lo * meanNet;
    evHi += spec.hi * meanNet;
    if (!spec.premium) {
      looseLo += spec.lo * meanNet;
      looseHi += spec.hi * meanNet;
    }
    for (const card of group) {
      perCard.push({
        card,
        pLo: spec.lo / group.length,
        pHi: spec.hi / group.length,
        premium: Boolean(spec.premium),
        net: netOf(card.reference),
      });
    }
  }

  // P(rembourser son booster) : au moins une carte dont la valeur nette
  // couvre le prix. Indépendance approchée entre cartes — acceptable à ces
  // ordres de grandeur, et l'hypothèse est du côté prudent.
  const recoup = (pick, { excludePremium = false } = {}) => {
    const winners = perCard.filter((entry) => entry.net >= boosterPrice && (!excludePremium || !entry.premium));
    if (!winners.length) return 0;
    return 1 - winners.reduce((acc, entry) => acc * (1 - pick(entry)), 1);
  };

  // Les pioches qui comptent : les plus grosses valeurs nettes.
  const topPulls = [...perCard]
    .sort((a, b) => b.net - a.net)
    .slice(0, 6)
    .map((entry) => ({
      name: entry.card.name,
      number: entry.card.number,
      rarity: entry.card.rarity,
      price: round2(entry.card.reference),
      // « 1 sur N » se lit mieux qu'un pourcentage — N au point médian.
      oneIn: Math.round(2 / (entry.pLo + entry.pHi)),
      // Ce que la carte pèse dans l'espérance d'un booster : valeur nette ×
      // probabilité. C'est LA ligne qui réconcilie « cette carte vaut 20× le
      // booster » et « le contenu moyen vaut 5 € ».
      contribution: round2(((entry.pLo + entry.pHi) / 2) * entry.net),
      premium: entry.premium,
    }));

  // La carte-titre : coût espéré pour la tirer vs l'acheter directement.
  const headline = [...perCard].sort((a, b) => b.card.reference - a.card.reference)[0] ?? null;
  const top1 =
    headline && headline.pHi > 0
      ? {
          name: headline.card.name,
          number: headline.card.number,
          buyPrice: round2(headline.card.reference),
          oneInLo: Math.round(1 / headline.pHi),
          oneInHi: Math.round(1 / headline.pLo),
          expectedCostLo: Math.round(boosterPrice / headline.pHi),
          expectedCostHi: Math.round(boosterPrice / headline.pLo),
          perDisplay: boostersPerDisplay
            ? round2(1 - Math.pow(1 - (headline.pLo + headline.pHi) / 2, boostersPerDisplay))
            : null,
        }
      : null;

  return {
    boosterPrice: round2(boosterPrice),
    netLo: round2(evLo),
    netHi: round2(evHi),
    // Ratio contenu/prix : au-dessus de 1, ouvrir bat le prix — situation
    // rare, et signal d'arbitrage pour le scellé.
    ratioLo: round2(evLo / boosterPrice),
    ratioHi: round2(evHi / boosterPrice),
    looseLo: round2(independent ? evLo : looseLo),
    looseHi: round2(independent ? evHi : looseHi),
    recoupLo: round2(recoup((entry) => entry.pLo)),
    recoupHi: round2(recoup((entry) => entry.pHi)),
    recoupLooseLo: round2(recoup((entry) => entry.pLo, { excludePremium: !independent })),
    recoupLooseHi: round2(recoup((entry) => entry.pHi, { excludePremium: !independent })),
    topPulls,
    top1,
    boostersPerDisplay,
    // "mappable" : le worst-case « lot trié » (looseLo/Hi) est crédible sur
    // cette ère. "independent" : aucun quota par produit documenté — les taux
    // restent valides en loose (loose* = net*), le risque de sélection est
    // non quantifié.
    looseModel,
  };
}

// ---------------------------------------------------------------------------
// Distribution complète et provenance.
//
// L'EV répond « combien en moyenne » ; la distribution répond « qu'est-ce qui
// va probablement m'arriver ». On simule N ouvertures (Monte-Carlo, taux au
// point médian) et on en tire les quantiles et les probabilités utiles.
//
// La provenance module les chances des classes premium — mais SEULEMENT là où
// le tri est techniquement crédible (looseModel "mappable", pré-SV : tous les
// boosters n'ont pas de hit, les boosters à hit sont repérables et retirés en
// bloc). En ère SV ("independent"), chaque booster a un hit garanti et aucun
// quota par produit n'est documenté : les boosters sont traités comme
// indépendants — un booster ne « sait » pas ce que les autres ont donné — et
// les facteurs restent à 1 ; le risque de sélection est réel mais non
// quantifié, il se gère par le choix du vendeur, pas par un coefficient.
// ---------------------------------------------------------------------------

export const PROVENANCES = [
  { key: "sealedBox", label: "Boîte scellée", factor: 1 },
  { key: "freshBox", label: "Booster d'une boîte fraîche", factor: 1 },
  { key: "trustedLoose", label: "Détaillant de confiance", factor: 0.7 },
  { key: "unknownLoose", label: "À l'unité, origine inconnue", factor: 0 },
];

export function simulateDistribution(cards, eraClasses, options) {
  const { boosterPrice, fees = 0.13, bulkThreshold = 0.4, sims = 20000, looseModel = "mappable" } = options;
  if (!boosterPrice || boosterPrice <= 0) return null;
  const netOf = (price) => (price >= bulkThreshold ? price * (1 - fees) : 0);

  // Pools par classe : valeurs nettes prêtes à échantillonner.
  const pools = [];
  for (const [rarity, spec] of Object.entries(eraClasses)) {
    const values = cards.filter((card) => card.rarity === rarity).map((card) => netOf(card.reference));
    if (values.length) pools.push({ rate: (spec.lo + spec.hi) / 2, premium: Boolean(spec.premium), values });
  }
  if (!pools.length) return null;

  const jackpotNet = Math.max(...pools.flatMap((pool) => pool.values));

  const runFor = (factor) => {
    const outcomes = new Float64Array(sims);
    for (let i = 0; i < sims; i++) {
      let total = 0;
      for (const pool of pools) {
        const rate = pool.premium ? pool.rate * factor : pool.rate;
        if (rate > 0 && Math.random() < rate) {
          total += pool.values[(Math.random() * pool.values.length) | 0];
        }
      }
      outcomes[i] = total;
    }
    outcomes.sort();
    const q = (p) => outcomes[Math.min(sims - 1, Math.floor(p * sims))];
    const share = (test) => {
      let count = 0;
      for (let i = 0; i < sims; i++) if (test(outcomes[i])) count++;
      return count / sims;
    };
    let sum = 0;
    for (let i = 0; i < sims; i++) sum += outcomes[i];
    return {
      evNet: round2(sum / sims),
      p25: round2(q(0.25)),
      median: round2(q(0.5)),
      p75: round2(q(0.75)),
      pRecoup: round2(share((v) => v >= boosterPrice)),
      pLoseHalf: round2(share((v) => v < boosterPrice * 0.5)),
      pDouble: round2(share((v) => v >= boosterPrice * 2)),
    };
  };

  // En "independent", toutes les provenances partagent les mêmes chiffres :
  // une seule simulation, réutilisée — quatre tirages séparés ne divergeraient
  // que par le bruit d'échantillonnage.
  const shared = looseModel === "independent" ? runFor(1) : null;
  return {
    jackpotNet: round2(jackpotNet),
    byProvenance: Object.fromEntries(PROVENANCES.map((p) => [p.key, shared ?? runFor(p.factor)])),
  };
}
