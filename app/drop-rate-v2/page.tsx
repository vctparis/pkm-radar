import type { Metadata } from "next";
import Link from "next/link";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import DropRateV2 from "@/components/DropRateV2";
import type { DropV2Data } from "@/lib/drop-v2-types";

export const metadata: Metadata = {
  title: "Drop rate v2 — bêta",
  description: "Valeur d'ouverture recalculée sur les cotations EX+ actuelles, avec couverture, fraîcheur et fallback visibles.",
};

export default async function DropRateV2Page() {
  const raw = await readFile(join(process.cwd(), "public", "drop-rate-v2.json"), "utf8");
  const data = JSON.parse(raw) as DropV2Data;

  return (
    <div className="drop-v2-shell relative z-10 bg-[#f2efe7]">
      <header className="border-b border-[#d3cfc3] text-[#1d2521]">
        <div className="mx-auto flex max-w-[1160px] items-center justify-between gap-5 px-4 py-4 sm:px-7">
          <Link href="/" className="text-[1rem] font-semibold tracking-[-0.025em]">
            PKM Radar
          </Link>
          <nav aria-label="Navigation Drop rate" className="overflow-x-auto">
            <ul className="m-0 flex w-max list-none items-center gap-1 p-0 text-[0.8rem]">
              <li><Link href="/" className="block px-2.5 py-1.5 text-[#59615d] hover:text-[#1d2521]">Radar</Link></li>
              <li><Link href="/taux-de-drop" className="block px-2.5 py-1.5 text-[#59615d] hover:text-[#1d2521]">Taux v1</Link></li>
              <li><span aria-current="page" className="block border-b-2 border-[#176b5b] px-2.5 py-1.5 font-semibold">Drop rate v2 <sup className="text-[0.6rem] text-[#176b5b]">bêta</sup></span></li>
              <li><Link href="/marche" className="block px-2.5 py-1.5 text-[#59615d] hover:text-[#1d2521]">Marché</Link></li>
            </ul>
          </nav>
        </div>
      </header>
      <DropRateV2 data={data} />
    </div>
  );
}
