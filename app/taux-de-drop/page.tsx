import Link from "next/link";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Metadata } from "next";
import DropRates from "@/components/DropRates";
import type { RadarData } from "@/lib/types";

export const metadata: Metadata = {
  title: "Taux de drop",
  description:
    "Probabilités de tirage par rareté, set par set — et leur traduction en euros : ce qu'un booster contient vraiment.",
};

export default async function TauxDeDropPage() {
  const raw = await readFile(join(process.cwd(), "public", "radar-data.json"), "utf8");
  const data = JSON.parse(raw) as RadarData;

  return (
    <div className="relative z-10">
      <header className="border-b border-ink-700/70">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <Link href="/" className="display text-[1.15rem] tracking-tight text-mist-050">
            PKM Radar
          </Link>
          <nav aria-label="Sections">
            <ul className="m-0 flex list-none flex-wrap items-center gap-1 p-0">
              <li>
                <Link href="/" className="rounded-lg px-3 py-1.5 text-[0.85rem] text-mist-300 transition-colors duration-200 hover:bg-ink-800 hover:text-mist-050">
                  Radar
                </Link>
              </li>
              <li>
                <span aria-current="page" className="rounded-lg bg-ink-800 px-3 py-1.5 text-[0.85rem] text-mist-050">
                  Taux de drop
                </span>
              </li>
              <li>
                <Link href="/portefeuille" className="rounded-lg px-3 py-1.5 text-[0.85rem] text-mist-300 transition-colors duration-200 hover:bg-ink-800 hover:text-mist-050">
                  Portefeuille
                </Link>
              </li>
              <li>
                <Link href="/marche" className="rounded-lg px-3 py-1.5 text-[0.85rem] text-mist-300 transition-colors duration-200 hover:bg-ink-800 hover:text-mist-050">
                  Marché <sup className="text-[0.62rem] text-accent">bêta</sup>
                </Link>
              </li>
              <li>
                <Link href="/dossier" className="rounded-lg px-3 py-1.5 text-[0.85rem] text-mist-300 transition-colors duration-200 hover:bg-ink-800 hover:text-mist-050">
                  Dossier de marché
                </Link>
              </li>
              <li>
                <Link href="/offre" className="rounded-lg px-3 py-1.5 text-[0.85rem] text-mist-300 transition-colors duration-200 hover:bg-ink-800 hover:text-mist-050">
                  Offre &amp; print run
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      <main id="contenu" className="mx-auto max-w-[1180px] px-4 pb-24 sm:px-6">
        <div className="py-12">
          <p className="m-0 text-[0.8rem] uppercase tracking-[0.14em] text-mist-500">Probabilités de tirage</p>
          <h1 className="display mt-3 max-w-[22ch] text-[clamp(1.9rem,4vw,2.7rem)] text-mist-050">Taux de drop</h1>
          <p className="prose-measure mt-4 text-[1.02rem] leading-relaxed text-mist-300">
            Vos chances de tirer chaque rareté, set par set — en « 1 sur N » et en pourcentage, pour n&apos;importe
            quelle carte de la classe ou pour une carte précise. Puis la seule question qui compte : ce que ces taux
            valent en euros face au prix du booster.
          </p>
        </div>

        <DropRates data={data} />

        {/* ---- Sources ---- */}
        <section className="mt-14 rounded-2xl border border-ink-600 p-6">
          <h2 className="display m-0 text-[1.1rem] text-mist-050">D&apos;où viennent ces taux</h2>
          <p className="prose-measure m-0 mt-2 text-[0.88rem] leading-relaxed text-mist-300">
            The Pokémon Company ne publie aucun taux officiel. Tout ce qui existe vient d&apos;ouvertures massives
            comptées par la communauté — les meilleures études dépassent les 2 000 boosters par set. Nos fourchettes
            croisent ces sources, avec un niveau de confiance affiché par ère : solide (Écarlate et Violet), correcte
            (Épée et Bouclier, boîtes japonaises), grossière (Soleil &amp; Lune, XY).
          </p>
          <ul className="m-0 mt-4 grid list-none gap-2 p-0 text-[0.86rem]">
            <li>
              <a href="https://infinite.tcgplayer.com" target="_blank" rel="noreferrer" className="text-accent underline decoration-ink-500 underline-offset-4 hover:decoration-accent">
                TCGplayer Infinite
              </a>
              <span className="text-mist-500"> — études d&apos;ouvertures massives par set (2 000+ boosters), la référence anglophone.</span>
            </li>
            <li>
              <a href="https://www.reddit.com/r/PokemonTCG/" target="_blank" rel="noreferrer" className="text-accent underline decoration-ink-500 underline-offset-4 hover:decoration-accent">
                r/PokemonTCG
              </a>
              <span className="text-mist-500"> — agrégats communautaires d&apos;ouvertures documentées, utiles pour recouper.</span>
            </li>
            <li>
              <a href="https://www.pokebeach.com" target="_blank" rel="noreferrer" className="text-accent underline decoration-ink-500 underline-offset-4 hover:decoration-accent">
                PokéBeach
              </a>
              <span className="text-mist-500"> — structures des produits japonais et garanties par boîte.</span>
            </li>
            <li>
              <a href="https://www.justinbasil.com" target="_blank" rel="noreferrer" className="text-accent underline decoration-ink-500 underline-offset-4 hover:decoration-accent">
                JustInBasil
              </a>
              <span className="text-mist-500"> — référentiel des raretés et de la composition des sets.</span>
            </li>
            <li>
              <a href="https://www.pokeindex.fr/taux-de-drop" target="_blank" rel="noreferrer" className="text-accent underline decoration-ink-500 underline-offset-4 hover:decoration-accent">
                PokeIndex
              </a>
              <span className="text-mist-500"> — taux francophones, utilisés en recoupement.</span>
            </li>
          </ul>
          <p className="prose-measure m-0 mt-4 text-[0.78rem] leading-relaxed text-mist-500">
            Les prix (médianes de classe) viennent de Cardmarket ; les prix de boosters, des annonces françaises
            d&apos;eBay.fr relevées quotidiennement. Les taux exacts variant d&apos;un tirage à l&apos;autre, tout est
            présenté en fourchette.
          </p>
        </section>
      </main>

      <footer className="border-t border-ink-700/70">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3 px-4 py-8 text-[0.8rem] text-mist-500 sm:px-6">
          <Link href="/" className="text-mist-300 transition-colors duration-200 hover:text-mist-050">
            ← Retour au radar
          </Link>
          <span className="flex flex-wrap gap-4">
            <Link href="/dossier" className="text-mist-300 transition-colors duration-200 hover:text-mist-050">
              Dossier de marché →
            </Link>
            <Link href="/offre" className="text-mist-300 transition-colors duration-200 hover:text-mist-050">
              Offre &amp; print run →
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
