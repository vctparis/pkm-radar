import assert from "node:assert/strict";
import { basketGrowthSeries, momentumSeries } from "../lib/series.mjs";

const at = (date) => Date.parse(`${date}T12:00:00Z`);
const cards = [
  { updatedAt: at("2026-01-10"), prices: { avg30: 100, avg7: 110 } },
  { updatedAt: at("2026-02-10"), prices: { avg30: 200, avg7: 180 } },
  { updatedAt: at("2026-04-10"), prices: { avg30: 50, avg7: 100 } },
];

const basket = basketGrowthSeries(cards, { minSample: 1, rollingDays: 90, stepMonths: 1 });
assert.equal(basket.at(-1)?.date, "2026-04-10", "le dernier point doit être le dernier relevé réel");
assert.ok(basket.every((point) => point.date <= "2026-04-10"), "aucun point ne doit être daté dans le futur");
assert.equal(
  basket.find((point) => point.date === "2026-03-15")?.growth,
  -3.33,
  "un point ne doit pas utiliser un relevé postérieur à sa date",
);

const momentum = momentumSeries(cards, { minSample: 1, rollingDays: 90 });
assert.equal(momentum.at(-1)?.date, "2026-04-10");
assert.ok(momentum.every((point) => point.date <= "2026-04-10"));

console.log("series.test.mjs: ok");
