// Sets suivis par le radar. `ptcg` est l'identifiant pokemontcg.io,
// `cardtrader` sert à résoudre l'expansion côté marketplace (matching par nom/code).
export const SETS = [
  { id: "sun-moon", name: "Soleil & Lune", ptcg: "sm1", cardtrader: "SUM", era: "Sun & Moon" },
  { id: "burning-shadows", name: "Ombres Ardentes", ptcg: "sm3", cardtrader: "BUS", era: "Sun & Moon" },
  { id: "brilliant-stars", name: "Stars Étincelantes", ptcg: "swsh9", cardtrader: "BRS", era: "Sword & Shield" },
  { id: "fusion-strike", name: "Poing de Fusion", ptcg: "swsh8", cardtrader: "FST", era: "Sword & Shield" },
  { id: "lost-origin", name: "Origine Perdue", ptcg: "swsh11", cardtrader: "lorg", era: "Sword & Shield" },
  { id: "silver-tempest", name: "Tempête Argentée", ptcg: "swsh12", cardtrader: "SIT", era: "Sword & Shield" },
];

export const bySetId = Object.fromEntries(SETS.map((s) => [s.id, s]));
