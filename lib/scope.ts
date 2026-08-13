// Le périmètre des prix, énoncé une seule fois pour tout le site.
//
// La page Marché le développe ; les autres pages en portent une ligne qui y
// renvoie. Deux endroits qui disent la même chose avec des mots différents
// finissent toujours par diverger.

/** Doit rester aligné sur SELLER_ZONE de scripts/lib/ebay.mjs (test dédié). */
export const SELLER_ZONE_CODES = ["FR", "BE", "LU", "DE", "NL", "IT", "ES", "AD", "MC"];

export const SELLER_ZONE_LABEL =
  "France, Belgique, Luxembourg, Allemagne, Pays-Bas, Italie, Espagne";

export const LANGUAGE_RULE =
  "la carte en français ; en japonais seulement quand elle n'existe pas en français";

/** La ligne courte affichée sous les tableaux de prix. */
export const SCOPE_LINE =
  `Périmètre des prix : ${LANGUAGE_RULE} — chez des vendeurs de l'Union européenne proche (${SELLER_ZONE_LABEL}).`;
