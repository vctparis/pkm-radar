import { buildCardTrackerArtifact } from "./lib/card-tracker.mjs";

const artifact = await buildCardTrackerArtifact(process.cwd());
console.log(`${artifact.cards.length} cartes écrites dans public/card-tracker.json (${Object.keys(artifact.markets).length} avec marché FR suivi)`);
