import Link from "next/link";
import type { Metadata } from "next";
import Portfolio from "@/components/Portfolio";

export const metadata: Metadata = {
  title: "Portefeuille",
  description: "Vos cartes, suivies comme des positions : valeur, plus-value et évolution — sans compte, tout reste dans votre navigateur.",
};

export default function PortefeuillePage() {
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
                <Link href="/taux-de-drop" className="rounded-lg px-3 py-1.5 text-[0.85rem] text-mist-300 transition-colors duration-200 hover:bg-ink-800 hover:text-mist-050">
                  Taux de drop
                </Link>
              </li>
              <li>
                <Link href="/drop-rate-v2" className="rounded-lg px-3 py-1.5 text-[0.85rem] text-mist-300 transition-colors duration-200 hover:bg-ink-800 hover:text-mist-050">
                  Drop rate v2 <sup className="text-[0.62rem] text-accent">bêta</sup>
                </Link>
              </li>
              <li>
                <span aria-current="page" className="rounded-lg bg-ink-800 px-3 py-1.5 text-[0.85rem] text-mist-050">
                  Portefeuille
                </span>
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
          <p className="m-0 text-[0.8rem] uppercase tracking-[0.14em] text-mist-500">Vos positions</p>
          <h1 className="display mt-3 max-w-[22ch] text-[clamp(1.9rem,4vw,2.7rem)] text-mist-050">Portefeuille</h1>
          <p className="prose-measure mt-4 text-[1.02rem] leading-relaxed text-mist-300">
            Vos cartes, suivies comme des positions : cours du jour, plus-value depuis l&apos;achat, et la courbe qui
            s&apos;épaissit à chaque visite. Tout reste dans ce navigateur — ni compte, ni envoi.
          </p>
        </div>

        <Portfolio />
      </main>

      <footer className="border-t border-ink-700/70">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3 px-4 py-8 text-[0.8rem] text-mist-500 sm:px-6">
          <Link href="/" className="text-mist-300 transition-colors duration-200 hover:text-mist-050">
            ← Retour au radar
          </Link>
          <span className="flex flex-wrap gap-4">
            <Link href="/taux-de-drop" className="text-mist-300 transition-colors duration-200 hover:text-mist-050">
              Taux de drop →
            </Link>
            <Link href="/dossier" className="text-mist-300 transition-colors duration-200 hover:text-mist-050">
              Dossier de marché →
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
