import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { buildDropV2Artifact } from "./lib/drop-v2.mjs";

const root = process.cwd();
const radarPayload = JSON.parse(await readFile(join(root, "public", "radar-data.json"), "utf8"));
const artifact = await buildDropV2Artifact(root, radarPayload);

console.log(
  `${artifact.sets.length} sets écrits dans public/drop-rate-v2.json · modèle ${artifact.modelVersion}`,
);
