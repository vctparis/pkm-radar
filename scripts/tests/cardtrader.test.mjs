import { observationOfProduct, summarizeOffers } from "../lib/cardtrader.mjs";

let failures = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) console.log(`✓ ${label}`);
  else {
    failures++;
    console.error(`✗ ${label}\n    attendu ${JSON.stringify(expected)}\n    obtenu  ${JSON.stringify(actual)}`);
  }
};

const product = {
  id: 42,
  price_cents: 1234,
  quantity: 3,
  user: { id: 7 },
  name_en: "Card",
  graded: true,
  on_vacation: true,
  properties_hash: { pokemon_language: "fr", condition: "Near Mint" },
};
const raw = observationOfProduct(product);
check("brut CT conserve langue, état, grading et vacances",
  [raw.language, raw.condition, raw.graded, raw.onVacation], ["fr", "Near Mint", true, true]);
check("brut CT conserve quantité et vendeur", [raw.quantity, raw.sellerId], [3, "7"]);
check("métriques CT excluent grading/vacances", summarizeOffers([product]).offers, 0);

if (failures) process.exit(1);
console.log("\nCardTrader : invariants tenus.");
