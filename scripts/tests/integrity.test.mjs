// Fixtures de la couche d'intégrité — chaque cas est un faux positif ou un
// faux négatif RÉELLEMENT observé dans le ledger avant d'être corrigé.
// Lancer : node scripts/tests/integrity.test.mjs
//
// Ces invariants sont méthodologiques, pas cosmétiques : une régression ici
// contamine la référence de prix, donc toutes les métriques aval.

import { classifySealedTitle, classifySingleTitle, normalizeTitle, summarize } from "../lib/ebay.mjs";
import { assessIntegrity, preliminaryReference } from "../lib/integrity.mjs";

let failures = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.error(`✗ ${label}\n    attendu ${JSON.stringify(expected)}\n    obtenu  ${JSON.stringify(actual)}`);
  } else {
    console.log(`✓ ${label}`);
  }
};
const has = (label, reasons, reason) => check(label, reasons.includes(reason), true);
const clean = (label, reasons) => check(label, reasons, []);

// ---------------------------------------------------------------------------
// Matching scellé — observés le 12/08/2026 dans data/ledger/s151.json
// ---------------------------------------------------------------------------
const ctx151 = { phrase: normalizeTitle("151") };

has("booster gradé CA 9 → produit_grade",
  classifySealedTitle("Booster Gradé Pokémon Écarlate et Violet EV3.5 - 151 - Mew - CA 9- FR", ctx151),
  "produit_grade");
has("booster gradé CA 10 → produit_grade",
  classifySealedTitle("Booster Pokémon Gradé Écarlate et Violet EV3.5 - 151 - Mew - CA 10 - FR", ctx151),
  "produit_grade");
has("Super Premium Collection → hors_produit",
  classifySealedTitle("SPC - Super Premium Collection - EV8.5 Évolutions Prismatiques - NEUF FR", { phrase: normalizeTitle("Évolutions Prismatiques") }),
  "hors_produit");
has("Boîte Surprise → hors_produit",
  classifySealedTitle("Boîte Surprise - EV08.5 Évolutions Prismatiques (NEUF) FR", { phrase: normalizeTitle("Évolutions Prismatiques") }),
  "hors_produit");
has("booster bundle (boîte de 6) → hors_produit",
  classifySealedTitle("Pokémon Évolutions Prismatiques Booster Bundle 6 boosters FR", { phrase: normalizeTitle("Évolutions Prismatiques") }),
  "hors_produit");
has("mini-tin → hors_produit",
  classifySealedTitle("Mini tin série 151 Pokemon Edition Fr neuves scellé d'origine N°3", ctx151),
  "hors_produit");
clean("vrai booster 151 → exact",
  classifySealedTitle("Booster Pokemon EV3.5 151 - NEUF - VF - Scellé", ctx151));
clean("vrai booster 151, accents/graphies → exact",
  classifySealedTitle("Nintendo Pokémon JCC: Pokémon Écarlate et Violet 151 Française", ctx151));

// L'ère qui fuit : « Soleil & Lune » apparaît dans les titres de tous ses
// voisins. La phrase seule ne suffit pas — l'ebayNot du set rejette.
const ctxSM = {
  phrase: normalizeTitle("Soleil & Lune"),
  excludePattern: new RegExp(
    "prisme|gardien|invasion|carmin|tonnerre|choc|alli|harmonie|[ée]clipse|c[ée]leste|majest|brillant|occulte|perdu|ardente",
    "i",
  ),
};
has("Ultra-Prisme cité « Soleil et Lune » → set_voisin",
  classifySealedTitle("Booster Pokémon SL05 Ultra-Prisme Soleil et Lune FR", ctxSM),
  "set_voisin");
has("Duo de Choc → set_voisin",
  classifySealedTitle("Booster Soleil et Lune Duo de Choc SL9 français", ctxSM),
  "set_voisin");
has("tripack → hors_produit",
  classifySealedTitle("Tripack Pokémon Soleil et Lune 3 boosters", ctxSM),
  "hors_produit");
has("deck → hors_produit",
  classifySealedTitle("Deck de démarrage Pokémon Soleil et Lune", ctxSM),
  "hors_produit");
clean("booster du set de base → exact",
  classifySealedTitle("Booster Pokémon Soleil et Lune de base SM1 FR scellé", ctxSM));
has("titre sans identité du set → identite_set_absente",
  classifySealedTitle("Booster Pokémon FR neuf scellé", ctx151),
  "identite_set_absente");
has("duopack → hors_produit",
  classifySealedTitle("Duopack Évolution Céleste 2 boosters + carte promo", { phrase: normalizeTitle("Évolution Céleste") }),
  "hors_produit");
clean("accents : « Evolution Celeste » sans accents matche la phrase accentuée",
  classifySealedTitle("Booster Pokemon Evolution Celeste EB07 FR", { phrase: normalizeTitle("Évolution Céleste") }));

// ---------------------------------------------------------------------------
// Matching singles — le gradé et le reverse sont d'autres marchés
// ---------------------------------------------------------------------------
const ctxZard = { collectorNumber: "199" };
has("slab PSA 10 → produit_grade",
  classifySingleTitle("Dracaufeu ex 199/165 PSA 10 - 151 EV3.5 FR", ctxZard),
  "produit_grade");
has("gradée PCA → produit_grade",
  classifySingleTitle("Carte Pokémon Dracaufeu ex 199/165 gradée PCA 9", ctxZard),
  "produit_grade");
has("reverse → variante_reverse",
  classifySingleTitle("Salamèche 168/165 reverse holo 151 FR", { collectorNumber: "168" }),
  "variante_reverse");
has("numéro absent → numero_absent",
  classifySingleTitle("Dracaufeu ex 151 francais neuf", ctxZard),
  "numero_absent");
// Vécu sur le test grandeur nature Gengar 071 (Shiny Star V) : le TOTAL du
// set d'une autre carte passait pour le numéro cherché.
has("total de set pris pour un numéro → numero_absent",
  classifySingleTitle("Carte Pokémon : Gengar/Ectoplasma 023/071 Holo - R - s10a - Dark Phantasma", { collectorNumber: "71" }),
  "numero_absent");
has("autre carte du même total → numero_absent",
  classifySingleTitle("Pokémon Gengar ex 047/071 Wild Force JP 2024", { collectorNumber: "71" }),
  "numero_absent");
clean("la vraie carte 071/190 reste exacte",
  classifySingleTitle("Carte Pokémon : Gengar/Ectoplasma 071/190 Holo - R - s4a - Shiny Star V JPN", { collectorNumber: "71" }));
has("gradation CollectAura Gem Mint → produit_grade",
  classifySingleTitle("Pokémon Gengar 071/190 JP – CollectAura Gem Mint 10", { collectorNumber: "71" }),
  "produit_grade");
clean("carte brute avec numéro → exact",
  classifySingleTitle("Dracaufeu ex 199/165 - 151 EV03.5 FR 🇫🇷", ctxZard));
has("annonce « played / état moyen » → etat_sous_ex",
  classifySingleTitle("Dracaufeu ex 199/165 played état moyen", ctxZard),
  "etat_sous_ex");
has("condition eBay 5000 (bon état) → etat_sous_ex",
  classifySingleTitle("Dracaufeu ex 199/165 - 151 FR", { ...ctxZard, conditionId: "5000" }),
  "etat_sous_ex");
clean("condition 4000 (très bon état ≈ EX) → retenue",
  classifySingleTitle("Dracaufeu ex 199/165 - 151 FR", { ...ctxZard, conditionId: "4000" }));
has("PSA10 compact → produit_grade",
  classifySingleTitle("Dracaufeu ex 199/165 PSA10", ctxZard),
  "produit_grade");
has("PCA9,5 compact → produit_grade",
  classifySingleTitle("Dracaufeu ex 199/165 PCA9,5", ctxZard),
  "produit_grade");
has("numéro 88 ne matche pas 188",
  classifySingleTitle("Carte Pokémon 188/198", { collectorNumber: "88" }),
  "numero_absent");
clean("suffixe 88a conservé",
  classifySingleTitle("Darkrai GX 88a/147", { collectorNumber: "88a", officialCount: "147" }));
clean("préfixe TG et zéro initial conservés",
  classifySingleTitle("Umbreon V TG22/TG30", { collectorNumber: "TG022", officialCount: "TG30" }));

const ebayItem = (price, seller = "s") => ({ price: { value: String(price) }, seller: { username: seller } });
check("médiane paire conventionnelle",
  summarize([ebayItem(10), ebayItem(20), ebayItem(30), ebayItem(40)]).median,
  25);
check("p10 interpolé n'est pas automatiquement le minimum",
  summarize([ebayItem(10), ebayItem(20), ebayItem(30), ebayItem(40)]).floor10,
  13);
check("p10 signalé indicatif sous 10 annonces",
  summarize([ebayItem(10), ebayItem(20)]).sampleSufficient,
  false);

// ---------------------------------------------------------------------------
// Référence de prix — jamais de fallback silencieux, une voix par vendeur
// ---------------------------------------------------------------------------
const obs = (price, sellerId, sellerScore, title = "ok") => ({ price, sellerId, sellerScore, title });

check("moins de 3 vendeurs établis → référence insuffisante",
  preliminaryReference([obs(20, "a", 500), obs(22, "b", 300), obs(5, "c", 0)]).basis,
  "insufficient");

// Le faux positif historique : réf. gonflée par les slabs faisait quarantainer
// les brutes à 400 €. Ici, sans référence, seller neuf + prix bas ≠ high_risk.
check("référence insuffisante → la règle de prix se tait (review, pas high_risk)",
  assessIntegrity(obs(13, "x", 0), { value: null, basis: "insufficient" }).status,
  "review");

// Un gros vendeur (10 annonces à 40 €) ne pèse qu'une voix face à deux
// vendeurs à 20 € : médiane par vendeur = 20, pas 40.
const bigSeller = Array.from({ length: 10 }, () => obs(40, "gros", 900));
check("médiane PAR VENDEUR : le gros vendeur ne surpondère pas",
  preliminaryReference([...bigSeller, obs(20, "a", 100), obs(19, "b", 80)]).value,
  20);

check("le lexique contrefaçon ne participe pas à la référence",
  preliminaryReference([
    obs(2, "p1", 500, "proxy Dracaufeu"), obs(2, "p2", 400, "carte custom métal"),
    obs(30, "a", 100), obs(32, "b", 90), obs(28, "c", 60),
  ]).value,
  30);

// ---------------------------------------------------------------------------
// Intégrité — la combinaison condamne, jamais un signal seul
// ---------------------------------------------------------------------------
const ref = { value: 30, basis: "established" };
check("prix -57 % + vendeur sans historique → high_risk",
  assessIntegrity(obs(13, "x", 0), ref).status, "high_risk");
check("prix -57 % seul (vendeur établi) → review",
  assessIntegrity(obs(13, "x", 800), ref).status, "review");
check("vendeur neuf seul (prix normal) → review",
  assessIntegrity(obs(29, "x", 0), ref).status, "review");
check("lexique contrefaçon seul → high_risk",
  assessIntegrity(obs(29, "x", 900, "proxy display only"), ref).status, "high_risk");
check("aucun signal → trusted",
  assessIntegrity(obs(29, "x", 900), ref).status, "trusted");
check("-5 % n'est pas une anomalie",
  assessIntegrity(obs(28.5, "x", 900), ref).reasons.includes("prix_tres_sous_marche"), false);

if (failures) {
  console.error(`\n${failures} invariant(s) cassé(s).`);
  process.exit(1);
}
console.log("\nTous les invariants tiennent.");
