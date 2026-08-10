// Sets suivis par le radar.
//
//   ptcg      identifiant pokemontcg.io (catalogue + prix Cardmarket)
//   tcgdex    identifiant TCGdex (noms et images des cartes FRANÇAISES)
//   cardtrader code d'expansion CardTrader (marché live)
//   nameEN    nom anglais — indispensable pour recouper eBay/Cardmarket
//
// Le scope linguistique du radar : cartes françaises en priorité, japonaises
// uniquement quand la série n'existe qu'en japonais. Les autres langues sont
// exclues des métriques de marché — elles brouillent la mesure.

export const SETS = [
  { id: "sun-moon", name: "Soleil & Lune", nameEN: "Sun & Moon", ptcg: "sm1", tcgdex: "sm1", cardtrader: "SUM", era: "Soleil & Lune" },
  { id: "burning-shadows", name: "Ombres Ardentes", nameEN: "Burning Shadows", ptcg: "sm3", tcgdex: "sm3", cardtrader: "BUS", era: "Soleil & Lune" },
  { id: "hidden-fates", name: "Destinées Occultes", nameEN: "Hidden Fates", ptcg: "sm115", tcgdex: "sm115", cardtrader: "HIF", era: "Soleil & Lune" },
  { id: "evolving-skies", name: "Évolution Céleste", nameEN: "Evolving Skies", ptcg: "swsh7", tcgdex: "swsh7", cardtrader: "EVS", era: "Épée et Bouclier" },
  { id: "fusion-strike", name: "Poing de Fusion", nameEN: "Fusion Strike", ptcg: "swsh8", tcgdex: "swsh8", cardtrader: "FST", era: "Épée et Bouclier" },
  { id: "brilliant-stars", name: "Stars Étincelantes", nameEN: "Brilliant Stars", ptcg: "swsh9", tcgdex: "swsh9", cardtrader: "BRS", era: "Épée et Bouclier" },
  { id: "lost-origin", name: "Origine Perdue", nameEN: "Lost Origin", ptcg: "swsh11", tcgdex: "swsh11", cardtrader: "lorg", era: "Épée et Bouclier" },
  { id: "silver-tempest", name: "Tempête Argentée", nameEN: "Silver Tempest", ptcg: "swsh12", tcgdex: "swsh12", cardtrader: "SIT", era: "Épée et Bouclier" },
  { id: "crown-zenith", name: "Zénith Suprême", nameEN: "Crown Zenith", ptcg: "swsh12pt5", tcgdex: "swsh12.5", cardtrader: "CRZ", era: "Épée et Bouclier" },
  { id: "celebrations", name: "Célébrations", nameEN: "Celebrations", ptcg: "cel25", tcgdex: "cel25", cardtrader: "C25", era: "Épée et Bouclier" },
  { id: "s151", name: "151", nameEN: "151", ptcg: "sv3pt5", tcgdex: "sv03.5", cardtrader: "MEW", era: "Écarlate et Violet" },
];

export const bySetId = Object.fromEntries(SETS.map((s) => [s.id, s]));
