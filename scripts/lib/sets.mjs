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

  // Sets japonais sans équivalent occidental — d'où leur intérêt : la rareté
  // n'est pas diluée par un tirage international. Pas de données Cardmarket
  // (catalogue anglais uniquement), donc pas d'historique : mesures live et
  // accumulation quotidienne seulement. releaseDate posée à la main.
  { id: "tag-all-stars", name: "Tag All Stars", nameEN: "Tag Team GX: Tag All Stars", jpOnly: true, releaseDate: "2019-10-04", tcgdex: "sm12a", cardtrader: "sm12a", era: "Soleil & Lune (JP)" },
  { id: "shiny-star-v", name: "Shiny Star V", nameEN: "Shiny Star V", jpOnly: true, releaseDate: "2020-11-20", tcgdex: "s4a", cardtrader: "s4a", era: "Épée et Bouclier (JP)" },
  { id: "vmax-climax", name: "VMAX Climax", nameEN: "VMAX Climax", jpOnly: true, releaseDate: "2021-12-03", tcgdex: "s8b", cardtrader: "s8b", era: "Épée et Bouclier (JP)" },
  // Le 151 japonais coexiste avec le 151 occidental : ses reverses Master
  // Ball n'existent qu'au Japon, c'est un produit distinct.
  { id: "s151jp", name: "151 (JP)", nameEN: "Pokémon Card 151 (JP)", jpOnly: true, releaseDate: "2023-06-16", tcgdex: "sv2a", cardtrader: "sv2a", era: "Écarlate et Violet (JP)" },
];

export const bySetId = Object.fromEntries(SETS.map((s) => [s.id, s]));
