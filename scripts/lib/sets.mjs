// Sets suivis par le radar.
//
//   ptcg      identifiant pokemontcg.io (catalogue + prix Cardmarket)
//   tcgdex    identifiant TCGdex (noms et images des cartes FRANÇAISES)
//   cardtrader code d'expansion CardTrader (marché live)
//   nameEN    nom anglais — indispensable pour recouper eBay/Cardmarket
//   printEnd  fin d'impression ESTIMÉE (année), "ongoing" (encore imprimé) ou
//             "unknown" (vagues de réimpression imprévisibles — vécu : 151).
//             TPC ne publie JAMAIS de fin d'impression : curation éditoriale
//             d'après les rotations de blocs et les vagues observées.
//
// Le scope linguistique du radar : cartes françaises en priorité, japonaises
// uniquement pour les impressions sans équivalent français. Les autres langues
// (coréen, chinois, anglais, italien, allemand) sont collectées mais ne cotent
// jamais : elles décrivent un autre marché. Les autres langues sont
// exclues des métriques de marché — elles brouillent la mesure.

export const SETS = [
  // ebayNot : « Évolutions » attrape aussi les annonces « Évolutions
  // Prismatiques » (Prismatic Evolutions, 2025) — un booster à 2 € qui se
  // ferait passer pour le plancher d'un set de 2016.
  { id: "evolutions", printEnd: 2017, name: "Évolutions", nameEN: "Evolutions", ptcg: "xy12", tcgdex: "xy12", cardtrader: "EVO", era: "XY", ebayNot: "prismatique|prismatic|paldea|m[ée]ga" },
  // ebayNot : « Soleil & Lune » apparaît dans les titres de TOUS les sets de
  // l'ère (« Booster SL05 Ultra-Prisme Soleil et Lune ») — la phrase complète
  // ne suffit pas, il faut rejeter les voisins nommément.
  { id: "sun-moon", printEnd: 2019, name: "Soleil & Lune", nameEN: "Sun & Moon", ptcg: "sm1", tcgdex: "sm1", cardtrader: "SUM", era: "Soleil & Lune", ebayNot: "prisme|gardien|invasion|carmin|tonnerre|choc|alli|harmonie|[ée]clipse|c[ée]leste|majest|brillant|occulte|perdu|ardente" },
  { id: "burning-shadows", printEnd: 2019, name: "Ombres Ardentes", nameEN: "Burning Shadows", ptcg: "sm3", tcgdex: "sm3", cardtrader: "BUS", era: "Soleil & Lune" },
  { id: "cosmic-eclipse", printEnd: 2020, name: "Éclipse Cosmique", nameEN: "Cosmic Eclipse", ptcg: "sm12", tcgdex: "sm12", cardtrader: "cec", era: "Soleil & Lune" },
  { id: "hidden-fates", printEnd: 2020, name: "Destinées Occultes", nameEN: "Hidden Fates", ptcg: "sm115", tcgdex: "sm115", cardtrader: "HIF", era: "Soleil & Lune" },
  { id: "darkness-ablaze", printEnd: 2021, name: "Ténèbres Embrasées", nameEN: "Darkness Ablaze", ptcg: "swsh3", tcgdex: "swsh3", cardtrader: "DAA", era: "Épée et Bouclier" },
  { id: "vivid-voltage", printEnd: 2021, name: "Voltage Éclatant", nameEN: "Vivid Voltage", ptcg: "swsh4", tcgdex: "swsh4", cardtrader: "VIV", era: "Épée et Bouclier" },
  { id: "shining-fates", printEnd: 2021, name: "Destinées Radieuses", nameEN: "Shining Fates", ptcg: "swsh45", tcgdex: "swsh4.5", cardtrader: "SHF", era: "Épée et Bouclier" },
  { id: "chilling-reign", printEnd: 2022, name: "Règne de Glace", nameEN: "Chilling Reign", ptcg: "swsh6", tcgdex: "swsh6", cardtrader: "cre", era: "Épée et Bouclier" },
  { id: "evolving-skies", printEnd: 2023, name: "Évolution Céleste", nameEN: "Evolving Skies", ptcg: "swsh7", tcgdex: "swsh7", cardtrader: "EVS", era: "Épée et Bouclier" },
  { id: "fusion-strike", printEnd: 2022, name: "Poing de Fusion", nameEN: "Fusion Strike", ptcg: "swsh8", tcgdex: "swsh8", cardtrader: "FST", era: "Épée et Bouclier" },
  { id: "brilliant-stars", printEnd: 2023, name: "Stars Étincelantes", nameEN: "Brilliant Stars", ptcg: "swsh9", tcgdex: "swsh9", cardtrader: "BRS", era: "Épée et Bouclier" },
  { id: "lost-origin", printEnd: 2023, name: "Origine Perdue", nameEN: "Lost Origin", ptcg: "swsh11", tcgdex: "swsh11", cardtrader: "lorg", era: "Épée et Bouclier" },
  { id: "astral-radiance", printEnd: 2023, name: "Astres Radieux", nameEN: "Astral Radiance", ptcg: "swsh10", tcgdex: "swsh10", cardtrader: "astr", era: "Épée et Bouclier" },
  { id: "silver-tempest", printEnd: 2023, name: "Tempête Argentée", nameEN: "Silver Tempest", ptcg: "swsh12", tcgdex: "swsh12", cardtrader: "SIT", era: "Épée et Bouclier" },
  { id: "crown-zenith", printEnd: 2023, name: "Zénith Suprême", nameEN: "Crown Zenith", ptcg: "swsh12pt5", tcgdex: "swsh12.5", cardtrader: "CRZ", era: "Épée et Bouclier" },
  { id: "celebrations", printEnd: 2022, name: "Célébrations", nameEN: "Celebrations", ptcg: "cel25", tcgdex: "cel25", cardtrader: "C25", era: "Épée et Bouclier" },
  { id: "obsidian-flames", printEnd: 2025, name: "Flammes Obsidiennes", nameEN: "Obsidian Flames", ptcg: "sv3", tcgdex: "sv03", cardtrader: "obf", era: "Écarlate et Violet" },
  { id: "paldean-fates", printEnd: 2025, name: "Destinées de Paldea", nameEN: "Paldean Fates", ptcg: "sv4pt5", tcgdex: "sv04.5", cardtrader: "PAF", era: "Écarlate et Violet" },
  { id: "s151", printEnd: "unknown", name: "151", nameEN: "151", ptcg: "sv3pt5", tcgdex: "sv03.5", cardtrader: "MEW", era: "Écarlate et Violet" },
  { id: "surging-sparks", printEnd: "ongoing", name: "Étincelles Déferlantes", nameEN: "Surging Sparks", ptcg: "sv8", tcgdex: "sv08", cardtrader: "ssp", era: "Écarlate et Violet" },
  { id: "prismatic-evolutions", printEnd: "ongoing", name: "Évolutions Prismatiques", nameEN: "Prismatic Evolutions", ptcg: "sv8pt5", tcgdex: "sv08.5", cardtrader: "pre", era: "Écarlate et Violet" },
  { id: "destined-rivals", printEnd: "ongoing", name: "Rivalités Destinées", nameEN: "Destined Rivals", ptcg: "sv10", tcgdex: "sv10", cardtrader: "dri", era: "Écarlate et Violet" },
  // ebayNot des jumeaux Black Bolt / White Flare : les lots mixtes pollueraient
  // les planchers. Le nom FR officiel de Black Bolt est « Foudre Noire ».
  { id: "white-flare", printEnd: "ongoing", name: "Flamme Blanche", nameEN: "White Flare", ptcg: "rsv10pt5", tcgdex: "sv10.5w", cardtrader: "wht", era: "Écarlate et Violet", ebayNot: "foudre noire|black bolt|fulgurant" },
  { id: "black-bolt", printEnd: "ongoing", name: "Foudre Noire", nameEN: "Black Bolt", ptcg: "zsv10pt5", tcgdex: "sv10.5b", cardtrader: "blk", era: "Écarlate et Violet", ebayNot: "flamme blanche|white flare" },

  // Sets japonais sans équivalent occidental — d'où leur intérêt : la rareté
  // n'est pas diluée par un tirage international. Pas de données Cardmarket
  // (catalogue anglais uniquement), donc pas d'historique : mesures live et
  // accumulation quotidienne seulement. releaseDate posée à la main.
  { id: "tag-all-stars", printEnd: 2020, name: "Tag All Stars", nameEN: "Tag Team GX: Tag All Stars", jpOnly: true, releaseDate: "2019-10-04", tcgdex: "sm12a", cardtrader: "sm12a", era: "Soleil & Lune (JP)" },
  { id: "shiny-star-v", printEnd: 2021, name: "Shiny Star V", nameEN: "Shiny Star V", jpOnly: true, releaseDate: "2020-11-20", tcgdex: "s4a", cardtrader: "s4a", era: "Épée et Bouclier (JP)" },
  { id: "vmax-climax", printEnd: 2022, name: "VMAX Climax", nameEN: "VMAX Climax", jpOnly: true, releaseDate: "2021-12-03", tcgdex: "s8b", cardtrader: "s8b", era: "Épée et Bouclier (JP)" },
  { id: "eevee-heroes", printEnd: 2021, name: "Eevee Heroes", nameEN: "Eevee Heroes", jpOnly: true, releaseDate: "2021-05-28", tcgdex: "s6a", cardtrader: "s6a", era: "Épée et Bouclier (JP)" },
  // Le 151 japonais coexiste avec le 151 occidental : ses reverses Master
  // Ball n'existent qu'au Japon, c'est un produit distinct.
  { id: "s151jp", printEnd: "unknown", name: "151 (JP)", nameEN: "Pokémon Card 151 (JP)", jpOnly: true, releaseDate: "2023-06-16", tcgdex: "sv2a", cardtrader: "sv2a", era: "Écarlate et Violet (JP)" },
];

export const bySetId = Object.fromEntries(SETS.map((s) => [s.id, s]));
