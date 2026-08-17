import { buildMarketPressureArtifact } from "./lib/market-pressure.mjs";

const artifact = await buildMarketPressureArtifact(process.cwd());
console.log(
  `${artifact.sets.length} sets écrits dans public/market-pressure.json · ` +
  `${artifact.readiness.completeDaysMax}/${artifact.readiness.minimumDaysForVerdict} journées complètes`,
);
