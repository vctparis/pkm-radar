import Link from "next/link";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Print run, offre réelle et prix",
  description:
    "Pourquoi le volume d'impression brut explique moins bien le prix d'une carte Pokémon que le rapport entre son offre réellement disponible et sa demande.",
};

// Deuxième article du site, même gabarit que le dossier de marché : contenu
// éditorial en HTML statique stylé par les classes .dossier, encadré par la
// navigation commune.
export default async function OffrePage() {
  const body = await readFile(join(process.cwd(), "content", "offre.html"), "utf8");

  return (
    <div className="relative z-10">
      <header className="border-b border-ink-700/70">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
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
                <Link
                  href="/taux-de-drop"
                  className="rounded-lg px-3 py-1.5 text-[0.85rem] text-mist-300 transition-colors duration-200 hover:bg-ink-800 hover:text-mist-050"
                >
                  Taux de drop
                </Link>
              </li>
              <li>
                <Link
                  href="/portefeuille"
                  className="rounded-lg px-3 py-1.5 text-[0.85rem] text-mist-300 transition-colors duration-200 hover:bg-ink-800 hover:text-mist-050"
                >
                  Portefeuille
                </Link>
              </li>
              <li>
                <Link
                  href="/dossier"
                  className="rounded-lg px-3 py-1.5 text-[0.85rem] text-mist-300 transition-colors duration-200 hover:bg-ink-800 hover:text-mist-050"
                >
                  Dossier de marché
                </Link>
              </li>
              <li>
                <span aria-current="page" className="rounded-lg bg-ink-800 px-3 py-1.5 text-[0.85rem] text-mist-050">
                  Offre & print run
                </span>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      <main id="contenu" className="mx-auto max-w-[1180px] px-4 pb-24 sm:px-6">
        <div className="border-b border-ink-700/70 py-14">
          <p className="m-0 text-[0.8rem] uppercase tracking-[0.14em] text-mist-500">Dossier de recherche</p>
          <h1 className="display mt-3 max-w-[24ch] text-[clamp(2rem,4.2vw,2.9rem)] text-mist-050">
            Print run, offre réelle et prix : pourquoi « beaucoup imprimé » ne suffit pas
          </h1>
          <p className="prose-measure mt-5 text-[1.15rem] leading-relaxed text-mist-300">
            Le volume d&apos;impression brut explique{" "}
            <strong className="font-semibold text-[color:var(--color-warn)]">
              beaucoup moins bien le prix d&apos;une carte
            </strong>{" "}
            que le rapport entre son{" "}
            <strong className="font-semibold text-mist-050">offre réellement disponible</strong> et sa{" "}
            <strong className="font-semibold text-mist-050">demande</strong> — d&apos;où Moonbreon à 4 300 $ malgré
            21 000 PSA 10, et un Lugia à 48 000 $ dont la rareté est un état, pas un tirage.
          </p>
          <ul className="mt-6 flex list-none flex-wrap gap-2 p-0 text-[0.78rem] text-mist-300">
            {["Print run vs pull rate", "Effective float", "Condition scarcity", "Sources primaires"].map((tag) => (
              <li key={tag} className="rounded-lg bg-ink-800 px-2.5 py-1">
                {tag}
              </li>
            ))}
          </ul>
        </div>

        <article className="dossier" dangerouslySetInnerHTML={{ __html: body }} />

        <p className="prose-measure mt-12 rounded-2xl border border-ink-600 p-5 text-[0.84rem] leading-relaxed text-mist-500">
          Dossier de recherche — outil d&apos;analyse personnel. Ni conseil financier, ni fiscal, ni juridique.
        </p>
      </main>

      <footer className="border-t border-ink-700/70">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3 px-4 py-8 text-[0.8rem] text-mist-500 sm:px-6">
          <Link href="/" className="text-mist-300 transition-colors duration-200 hover:text-mist-050">
            ← Retour au radar
          </Link>
          <Link href="/dossier" className="text-mist-300 transition-colors duration-200 hover:text-mist-050">
            Dossier de marché →
          </Link>
        </div>
      </footer>
    </div>
  );
}
