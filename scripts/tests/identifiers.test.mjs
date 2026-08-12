import { collectorNumberForSearch, normalizeCollectorNumber } from "../lib/identifiers.mjs";

const cases = [
  ["036/149", "36"],
  ["36", "36"],
  ["088a", "88a"],
  ["TG01/TG30", "tg1"],
  ["GG044/GG70", "gg44"],
];
let failures = 0;
for (const [input, expected] of cases) {
  const actual = normalizeCollectorNumber(input);
  if (actual === expected) console.log(`✓ identifiant ${input} → ${expected}`);
  else {
    failures++;
    console.error(`✗ identifiant ${input}: attendu ${expected}, obtenu ${actual}`);
  }
}
if (collectorNumberForSearch("TG01/TG30") !== "TG01") failures++;
if (failures) process.exit(1);
console.log("\nIdentifiants : invariants tenus.");
