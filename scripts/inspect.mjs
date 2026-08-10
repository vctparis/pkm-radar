// Outil de diagnostic : vérifie que chaque set produit des séries exploitables.
// À relancer après toute modification de la méthode de mesure.
//
//   node scripts/inspect.mjs

import { SETS } from "./lib/sets.mjs";
import { fetchSetCards, normalizeSet } from "./lib/ptcg.mjs";
import { momentumSeries, normalizedPath, median } from "./lib/series.mjs";

const pct = (v) => (v == null ? "  —  " : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`.padStart(7));

for (const set of SETS) {
  const cards = normalizeSet(await fetchSetCards(set.ptcg));
  const chase = [...cards].sort((a, b) => b.reference - a.reference).slice(0, 12);
  const commons = cards.filter((card) => card.isCommon);

  const all = momentumSeries(cards);
  const path = normalizedPath(cards);

  console.log(`\n${set.name}  ·  ${cards.length} cartes`);
  console.log(`  points de mesure  ${all.length}  (${all[0]?.date} → ${all.at(-1)?.date})`);
  console.log(`  momentum médian   ${pct(median(all.map((p) => p.momentum)))}`);
  console.log(`  diffusion médiane ${pct(median(all.map((p) => p.diffusion)))}`);
  console.log(`  trajectoire       ${path.map((p) => `${p.label} ${p.value}`).join("  ")}`);
  console.log(
    `  segments          chase ${pct(median(chase.map((c) => c.change30 * 100).filter(Number.isFinite)))}` +
      `   communes ${pct(median(commons.map((c) => c.change30 * 100).filter(Number.isFinite)))}`,
  );
}
