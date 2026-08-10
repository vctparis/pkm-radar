import Link from "next/link";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Metadata } from "next";
import Calculators from "@/components/Calculators";

export const metadata: Metadata = {
  title: "Dossier de marché",
  description:
    "Cadre analytique du marché Pokémon TCG : rareté, grading, cascades de FOMO et mécanisme d'inflation, du chase aux communes.",
};

// Le dossier était servi dans une iframe pointant vers un HTML statique : pas
// d'indexation, pas de responsive maîtrisé, deux barres de défilement et aucun
// partage de design avec le reste du site. Le contenu éditorial est désormais
// rendu par Next, encadré par les calculateurs reconstruits en React.
async function part(name: string) {
  return readFile(join(process.cwd(), "content", name), "utf8");
}

export default async function DossierPage() {
  const [before, after] = await Promise.all([part("dossier-part1.html"), part("dossier-part2.html")]);

  return (
    <div className="relative z-10">
      <header className="border-b border-ink-700/70">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4 px-6 py-5">
          <Link href="/" className="display text-[1.15rem] tracking-tight text-mist-050">
            PKM Radar
          </Link>
          <nav aria-label="Sections">
            <ul className="m-0 flex list-none items-center gap-1 p-0">
              <li>
                <Link
                  href="/"
                  className="rounded-lg px-3 py-1.5 text-[0.85rem] text-mist-300 transition-colors duration-200 hover:bg-ink-800 hover:text-mist-050"
                >
                  Radar
                </Link>
              </li>
              <li>
                <span aria-current="page" className="rounded-lg bg-ink-800 px-3 py-1.5 text-[0.85rem] text-mist-050">
                  Dossier de marché
                </span>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      <main id="contenu" className="mx-auto max-w-[1180px] px-6 pb-24">
        <div className="border-b border-ink-700/70 py-14">
          <p className="m-0 text-[0.8rem] uppercase tracking-[0.14em] text-mist-500">Dossier de recherche</p>
          <h1 className="display mt-3 max-w-[22ch] text-[clamp(2rem,4.2vw,2.9rem)] text-mist-050">
            Rareté, flux spéculatifs et mécanisme d&apos;inflation des cartes
          </h1>
          <p className="prose-measure mt-5 text-[1.02rem] leading-relaxed text-mist-300">
            Cadre analytique pour distinguer valeur de collection durable, rareté réellement verrouillée, effet du
            grading et cascades de FOMO — du chase aux cartes secondaires, puis parfois aux communes et au scellé.
          </p>
          <ul className="mt-6 flex list-none flex-wrap gap-2 p-0 text-[0.78rem] text-mist-300">
            {["France / Europe", "Raw + PSA + scellé", "Quantitatif", "Sources primaires"].map((tag) => (
              <li key={tag} className="rounded-lg bg-ink-800 px-2.5 py-1">
                {tag}
              </li>
            ))}
          </ul>
        </div>

        <article className="dossier">
          <div dangerouslySetInnerHTML={{ __html: before }} />
          <Calculators />
          <div dangerouslySetInnerHTML={{ __html: after }} />
        </article>

        <p className="prose-measure mt-12 rounded-2xl border border-ink-600 p-5 text-[0.84rem] leading-relaxed text-mist-500">
          Dossier de recherche v1.0 — outil d&apos;analyse personnel. Ni conseil financier, ni fiscal, ni juridique.
        </p>
      </main>

      <footer className="border-t border-ink-700/70">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-3 px-6 py-8 text-[0.8rem] text-mist-500">
          <Link href="/" className="text-mist-300 transition-colors duration-200 hover:text-mist-050">
            ← Retour au radar
          </Link>
        </div>
      </footer>
    </div>
  );
}
