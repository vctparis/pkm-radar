// Les familles (blocs d'édition) et leur période — des faits d'édition,
// partagés par les pages Sets et Marché. « aujourd'hui » = bloc encore
// imprimé ; la fin d'impression d'un SET précis n'est jamais publiée par
// The Pokémon Company, on ne l'invente pas.
export const FAMILIES: { name: string; years: string }[] = [
  { name: "Écarlate et Violet", years: "2023 – aujourd'hui" },
  { name: "Épée et Bouclier", years: "2020 – 2023" },
  { name: "Soleil & Lune", years: "2017 – 2019" },
  { name: "XY", years: "2014 – 2016" },
  { name: "Japonais", years: "sets sans équivalent occidental" },
];

export const familyOf = (set: { era: string; jpOnly?: boolean }) =>
  set.jpOnly ? "Japonais" : set.era.replace(" (JP)", "");
