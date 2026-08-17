import type { Metadata } from "next";
import Link from "next/link";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import MarketPressure from "@/components/MarketPressure";
import type { MarketPressureData } from "@/lib/market-pressure-types";

export const metadata: Metadata = {
  title: "Pression du carnet — bêta",
  description: "Stock visible, prix demandés et flux d'annonces de boosters, séparés entre eBay.fr et CardTrader.",
};

export default async function MarketPressurePage() {
  const raw = await readFile(join(process.cwd(), "public", "market-pressure.json"), "utf8");
  const data = JSON.parse(raw) as MarketPressureData;
  return (
    <div className="relative z-10 min-h-screen">
      <header className="border-b border-ink-700/70">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <Link href="/" className="display text-[1.15rem] tracking-tight text-mist-050">PKM Radar</Link>
          <nav aria-label="Sections" className="overflow-x-auto">
            <ul className="m-0 flex w-max list-none items-center gap-1 p-0 text-[0.82rem]">
              <li><Link href="/" className="rounded-lg px-3 py-1.5 text-mist-300 hover:bg-ink-800 hover:text-mist-050">Radar</Link></li>
              <li><Link href="/drop-rate-v2" className="rounded-lg px-3 py-1.5 text-mist-300 hover:bg-ink-800 hover:text-mist-050">Drop rate v2</Link></li>
              <li><Link href="/cartes" className="rounded-lg px-3 py-1.5 text-mist-300 hover:bg-ink-800 hover:text-mist-050">Cartes</Link></li>
              <li><span aria-current="page" className="rounded-lg bg-ink-800 px-3 py-1.5 text-mist-050">Marché <sup className="text-[0.6rem] text-accent">bêta</sup></span></li>
            </ul>
          </nav>
        </div>
      </header>

      <main id="contenu" className="mx-auto max-w-[1180px] px-4 pb-24 sm:px-6">
        <nav aria-label="Vues du marché" className="mt-5 flex w-fit rounded-xl border border-ink-700 bg-ink-850 p-1 text-[0.78rem]">
          <Link href="/marche" className="rounded-lg px-3 py-2 text-mist-300 hover:text-mist-050">Qualité des données</Link>
          <span aria-current="page" className="rounded-lg bg-ink-700 px-3 py-2 text-mist-050">Pression du carnet</span>
        </nav>
        <MarketPressure data={data} />
      </main>
    </div>
  );
}
