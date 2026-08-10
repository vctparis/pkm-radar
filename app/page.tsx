import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Radar from "@/components/Radar";
import type { RadarData } from "@/lib/types";

// Le fichier est régénéré par le cron d'ingestion puis commité : le lire au
// rendu plutôt que de l'importer garde la page alignée sur le dernier relevé
// sans dépendre du moment du build.
async function loadRadar(): Promise<RadarData> {
  const raw = await readFile(join(process.cwd(), "public", "radar-data.json"), "utf8");
  return JSON.parse(raw) as RadarData;
}

export default async function Page() {
  const data = await loadRadar();
  return <Radar data={data} />;
}
