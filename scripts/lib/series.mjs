// Mesure de la dynamique de prix à partir des moyennes glissantes Cardmarket.
//
// CE QUE LA DONNÉE PERMET — ET CE QU'ELLE NE PERMET PAS
//
// Chaque carte porte avg30 / avg7 / avg1 / trendPrice rattachés à SA date de
// relevé, et ces dates s'étalent sur ~8 mois d'une carte à l'autre.
//
// On pourrait être tenté d'en tirer un indice de niveau quotidien. C'est une
// impasse : une carte n'apparaît qu'à une seule date de relevé, donc entre deux
// grappes de dates l'échantillon apparié est vide. Un indice chaîné y recolle
// des cartes différentes, et le biais de raccord se compose sur des centaines
// de jours (mesuré : −84 % sur des paniers de communes, ce qui n'a aucun sens).
// Le niveau de prix d'un set au cours du temps n'est PAS identifiable ici.
//
// Ce qui l'est, en revanche : à chaque date de relevé, la trajectoire des 30
// derniers jours des cartes relevées ce jour-là. Chaque carte servant de
// base à elle-même, il n'y a ni biais de composition ni compounding. On en
// tire deux séries interprétables directement :
//
//   • momentum  — variation médiane sur 30 jours du panier relevé ce jour-là
//   • diffusion — part des cartes en hausse (c'est la largeur du mouvement)
//
// La diffusion est le cœur de la thèse : une hausse portée par trois chases
// n'a pas le même sens qu'une hausse où 70 % du set participe.

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

function rollingEnds(observations, stepMonths = 1) {
  const first = new Date(Math.min(...observations.map((o) => o.t)));
  const last = Math.max(...observations.map((o) => o.t));
  const cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 15, 12));
  const ends = [];
  while (cursor.getTime() <= last) {
    ends.push(cursor.getTime());
    cursor.setUTCMonth(cursor.getUTCMonth() + stepMonths);
  }
  // Le dernier relevé est le point le plus utile pour décider. On l'ajoute à
  // la grille régulière sans jamais prolonger artificiellement l'axe au-delà
  // de la donnée réellement disponible.
  if (ends.at(-1) !== last) ends.push(last);
  return ends;
}

// avg7 vs avg30 : deux moyennes de même nature, donc comparables.
// On évite avg1 comme mesure principale — sur une carte peu échangée c'est
// souvent une vente isolée, pas un niveau de marché.
export function cardMomentum(prices) {
  const { avg30, avg7 } = prices;
  if (!(avg30 > 0) || !(avg7 > 0)) return null;
  const ratio = avg7 / avg30;
  // Un x3 ou un /3 en 30 jours sur une commune trahit une anomalie de saisie
  // bien plus souvent qu'un mouvement réel. On écarte plutôt que de laisser
  // la médiane absorber du bruit extrême.
  if (ratio < 0.33 || ratio > 3) return null;
  return ratio - 1;
}

/**
 * Agrège les cartes par date de relevé et calcule momentum + diffusion.
 * @param {Array<{updatedAt:number, prices:object}>} cards
 * @param {{minSample?:number}} options
 * @returns {Array<{date:string, sample:number, momentum:number, diffusion:number}>}
 */
export function momentumSeries(cards, { minSample = 8, rollingDays = 0 } = {}) {
  const observations = [];
  const byDate = new Map();

  for (const card of cards) {
    const value = cardMomentum(card.prices);
    if (value == null) continue;
    observations.push({ t: card.updatedAt, value });
    const key = iso(card.updatedAt);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(value);
  }

  // Fenêtre glissante rétrospective : le point daté t ne voit que les relevés
  // antérieurs ou égaux à t. Une fenêtre centrée produisait des points futurs
  // et introduisait un biais d'anticipation dans une lecture chronologique.
  // Les points successifs se recouvrent, ce qui lisse la série et doit rester
  // annoncé dans l'interface.
  if (rollingDays > 0 && observations.length) {
    const DAY = 86_400_000;
    const span = rollingDays * DAY;
    const points = [];

    for (const end of rollingEnds(observations)) {
      const start = end - span;
      const values = observations.filter((o) => o.t > start && o.t <= end).map((o) => o.value);
      if (values.length >= minSample) {
        points.push({
          date: iso(end),
          sample: values.length,
          momentum: Number((median(values) * 100).toFixed(2)),
          diffusion: Number(((values.filter((v) => v > 0).length / values.length) * 100).toFixed(1)),
        });
      }
    }
    return points;
  }

  return [...byDate.entries()]
    // Une poignée de cartes ne fait pas une mesure de marché : sous le seuil,
    // le point est écarté plutôt qu'affiché avec un faux air de précision.
    .filter(([, values]) => values.length >= minSample)
    .map(([date, values]) => ({
      date,
      sample: values.length,
      momentum: Number((median(values) * 100).toFixed(2)),
      diffusion: Number(((values.filter((v) => v > 0).length / values.length) * 100).toFixed(1)),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Croissance d'un panier à une date donnée, pondérée par la valeur, avec le
 * détail de ce qui la produit.
 *
 * Une moyenne pondérée sur cinq cartes peut être portée par une seule d'entre
 * elles : sur Ombres Ardentes, Charizard-GX pèse 309 € des 409 € du Top 5 et
 * fabrique à lui seul un +106 %. Plafonner ce mouvement le masquerait ; on
 * l'affiche donc avec sa part de contribution. La concentration du mouvement
 * est précisément l'information recherchée — un panier qui monte grâce à une
 * carte ne dit pas la même chose qu'un panier qui monte grâce à vingt.
 */
export function basketGrowth(cards) {
  const items = cards
    .map((card) => {
      const { avg30, avg7 } = card.prices;
      if (!(avg30 > 0) || !(avg7 > 0)) return null;
      const ratio = avg7 / avg30;
      if (ratio < 0.33 || ratio > 3) return null;
      return { name: card.name, number: card.number, before: avg30, after: avg7, delta: avg7 - avg30 };
    })
    .filter(Boolean);

  if (!items.length) return null;

  const before = items.reduce((sum, i) => sum + i.before, 0);
  const after = items.reduce((sum, i) => sum + i.after, 0);
  const netDelta = after - before;

  // Part du mouvement net imputable à la carte qui bouge le plus, en valeur
  // absolue. Au-delà de ~40 %, le chiffre du panier décrit une carte.
  const dominant = [...items].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
  const share = netDelta !== 0 ? Math.abs(dominant.delta / netDelta) : 0;

  return {
    growth: Number(((after / before - 1) * 100).toFixed(2)),
    cards: items.length,
    basketValue: Number(after.toFixed(2)),
    driver:
      share >= 0.4 && Math.abs(dominant.delta) > 1
        ? {
            name: dominant.name,
            number: dominant.number,
            change: Number(((dominant.after / dominant.before - 1) * 100).toFixed(1)),
            share: Number(Math.min(1, share).toFixed(2)),
          }
        : null,
  };
}

/**
 * Momentum récent d'un panier, pondéré par la valeur.
 *
 * La diffusion répond à « combien de cartes montent ». Cette mesure-ci répond à
 * « de combien le panier monte », ce qui est la question économique. On somme
 * les prix plutôt que de moyenner des pourcentages : Σavg7 / Σavg30 − 1 revient
 * à pondérer chaque carte par son poids réel dans le panier, alors qu'une
 * médiane de variations donnerait le même poids à une commune à 0,30 € qu'à un
 * Dracaufeu à 300 €.
 *
 * Chaque point utilise une fenêtre rétrospective se terminant à sa date : il ne
 * contient donc jamais d'observation future. Réserve de lecture : la composition
 * du panier change d'une fenêtre à l'autre
 * (les cartes n'ont pas toutes la même date de relevé). Chaque point reste
 * valide en interne — c'est bien le même jeu de cartes au numérateur et au
 * dénominateur — mais deux points successifs ne portent pas exactement sur les
 * mêmes cartes.
 */
export function basketGrowthSeries(cards, { minSample = 5, rollingDays = 90, stepMonths = 1 } = {}) {
  const observations = cards
    .map((card) => {
      const { avg30, avg7 } = card.prices;
      if (!(avg30 > 0) || !(avg7 > 0)) return null;
      const ratio = avg7 / avg30;
      if (ratio < 0.33 || ratio > 3) return null;
      return { t: card.updatedAt, before: avg30, after: avg7 };
    })
    .filter(Boolean);

  if (!observations.length) return [];

  const DAY = 86_400_000;
  const span = rollingDays * DAY;
  const points = [];

  for (const end of rollingEnds(observations, stepMonths)) {
    const start = end - span;
    const window = observations.filter((o) => o.t > start && o.t <= end);
    if (window.length >= minSample) {
      const before = window.reduce((sum, o) => sum + o.before, 0);
      const after = window.reduce((sum, o) => sum + o.after, 0);
      points.push({
        date: iso(end),
        sample: window.length,
        growth: Number(((after / before - 1) * 100).toFixed(2)),
        basketValue: Number(after.toFixed(2)),
      });
    }
  }
  return points;
}

// Trajectoire relative médiane : chaque carte est ramenée à base 100 sur son
// propre avg30, ce qui rend les cartes comparables entre elles quel que soit
// leur niveau de prix absolu.
export function normalizedPath(cards) {
  const at = (selector) => {
    const values = cards
      .map((card) => {
        const { avg30 } = card.prices;
        const value = selector(card.prices);
        return avg30 > 0 && value > 0 ? (value / avg30) * 100 : null;
      })
      .filter((v) => v != null && v > 20 && v < 500);
    return values.length ? Number(median(values).toFixed(2)) : null;
  };

  return [
    { label: "J-30", offset: -30, value: 100 },
    { label: "J-7", offset: -7, value: at((p) => p.avg7) },
    { label: "J-1", offset: -1, value: at((p) => p.avg1) },
    { label: "tendance", offset: 0, value: at((p) => p.trendPrice) },
  ].filter((point) => point.value != null);
}
