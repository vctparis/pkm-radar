// Layer 0 — Listing Integrity.
//
// Règle gravée de la plateforme : « Collect everything. Trust selectively.
// Delete nothing. Predict nothing until validated. »
//
// Trois populations par produit :
//   Raw      — tout ce que l'API a réellement observé (le ledger, immuable) ;
//   Eligible — les annonces qui décrivent bien le produit (matching) ;
//   Retenues — trusted + review : la population des métriques ;
//   Trusted  — le sous-ensemble sans aucun signal.
//
// Confiance et inclusion sont deux notions DISTINCTES : trusted/review/
// high_risk d'un côté ; incluse/exclue des métriques de l'autre. La règle
// d'inclusion assumée : trusted et review sont incluses, high_risk exclue.
//
// Le moteur produit un RISQUE, jamais un verdict `is_fake` : une annonce
// 45 % sous le marché peut être une liquidation, une erreur de catégorie, un
// produit abîmé… ou un faux. AUCUN signal seul ne condamne — un vendeur à 0
// évaluation est peut-être simplement nouveau. C'est la COMBINAISON (prix
// aberrant + vendeur sans historique) qui fait le risque. Seul le lexique
// contrefaçon explicite suffit à lui seul : l'annonce se décrit elle-même.
//
// Des règles explicites et lisibles, pas de poids « scientifiques » inventés :
// la calibration d'un score viendra quand des mois d'annonces auront été
// revues à la main — pas avant.

// Incrémenter à chaque évolution des règles : le ledger conserve la version
// d'analyse, tout l'historique brut est rejouable avec les règles futures.
// v2 : le gradé (boosters CA/PSA, slabs) exclu du matching — il gonflait la
//      référence et inversait la détection d'anomalies.
// v3 : identité produit stricte (phrase complète, tripacks/duopacks/decks,
//      reverse) ; référence = médiane PAR VENDEUR établi, ≥ 3 vendeurs,
//      sans fallback silencieux (référence insuffisante → pas de règle prix) ;
//      lexique contrefaçon exclu du calcul de la référence.
// v4 : grading compact (PSA10/PCA9,5), numéros préfixés/suffixés, médiane
//      conventionnelle ; signaux vendeur et qualité d'annonce séparés.
// v5 : identité de carte durcie — le total du set ne peut plus passer pour un
//      numéro de carte (le repli « nombre isolé » ne s'applique qu'aux titres
//      sans fraction) ; lexique de gradation élargi (CollectAura, Gem Mint,
//      CGA, SGC, ACE, « mint 10 »). Découvert par le test grandeur nature
//      Gengar 071 de Shiny Star V.
export const ANALYSIS_VERSION = 5;

// Lexique contrefaçon / hors-marché-authentique, multilingue.
export const SUSPICIOUS_KW =
  /proxy|replica|r[ée]plique|reproduction|\brepro\b|custom|fan ?made|m[ée]tal|metal card|non officiel|unofficial|display only|pr[ée]sentation seulement|\bcopie\b|\bfake\b/i;

// En dessous de ce ratio à la référence, le prix mérite examen. Une annonce à
// −5 % ne nous intéresse pas ; à −45 %, si.
const PRICE_OUTLIER_RATIO = 0.6;
// En dessous de ce score, le vendeur n'a pas d'historique exploitable.
const LOW_HISTORY_SCORE = 5;
// Au-dessus de ce score, le vendeur compte dans la référence de prix.
const ESTABLISHED_SCORE = 20;
// Moins de N vendeurs établis distincts : la référence n'existe pas.
const MIN_ESTABLISHED_SELLERS = 3;

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * Référence de prix : la médiane des MÉDIANES PAR VENDEUR établi — un gros
 * vendeur aux 40 annonces ne pèse qu'une voix. Les annonces au lexique
 * contrefaçon n'y participent jamais (un faux ne sert pas de référence aux
 * vrais). Moins de 3 vendeurs établis distincts → { basis: "insufficient" } :
 * PAS de fallback silencieux, la règle d'anomalie de prix ne s'applique pas.
 */
export function preliminaryReference(observations) {
  const bySeller = new Map();
  for (const obs of observations) {
    if (!(obs.price > 0)) continue;
    if (obs.title != null && SUSPICIOUS_KW.test(obs.title)) continue;
    if ((obs.sellerScore ?? 0) < ESTABLISHED_SCORE || !obs.sellerId) continue;
    if (!bySeller.has(obs.sellerId)) bySeller.set(obs.sellerId, []);
    bySeller.get(obs.sellerId).push(obs.price);
  }
  if (bySeller.size < MIN_ESTABLISHED_SELLERS) return { value: null, basis: "insufficient" };
  return { value: median([...bySeller.values()].map(median)), basis: "established" };
}

/**
 * @param reference retour de preliminaryReference — la règle de prix ne
 *                  s'applique que sur base "established".
 * @returns {{ status: "trusted"|"review"|"high_risk", reasons: string[] }}
 */
export function assessIntegrity({ price, sellerScore, title }, reference) {
  const sellerReasons = [];
  const listingReasons = [];
  if (title != null && SUSPICIOUS_KW.test(title)) listingReasons.push("lexique_contrefacon");
  if (sellerScore == null || sellerScore < LOW_HISTORY_SCORE) sellerReasons.push("vendeur_sans_historique");
  if (
    reference?.basis === "established" &&
    reference.value > 0 &&
    price > 0 &&
    price / reference.value < PRICE_OUTLIER_RATIO
  ) {
    listingReasons.push("prix_tres_sous_marche");
  }
  const reasons = [...sellerReasons, ...listingReasons];
  const status = listingReasons.includes("lexique_contrefacon")
    ? "high_risk"
    : listingReasons.includes("prix_tres_sous_marche") && sellerReasons.includes("vendeur_sans_historique")
      ? "high_risk"
      : reasons.length
        ? "review"
        : "trusted";
  return {
    status,
    reasons,
    sellerTrust: sellerReasons.length ? "review" : "trusted",
    sellerReasons,
    listingQuality: listingReasons.length ? "review" : "trusted",
    listingReasons,
  };
}
