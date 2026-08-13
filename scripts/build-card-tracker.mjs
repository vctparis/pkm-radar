import { buildCardTrackerArtifact } from "./lib/card-tracker.mjs";

const artifact = await buildCardTrackerArtifact(process.cwd());
const quoted = artifact.cards.filter((card) => artifact.markets[card.id]?.rawFR).length;
const referenced = Object.values(artifact.markets).filter((market) => market.cardmarketGuide).length;
console.log(
  `${artifact.cards.length} cartes écrites · ${quoted} cotées dans la langue du set · ${referenced} avec repère Cardmarket`,
);
