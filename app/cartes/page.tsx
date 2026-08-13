import type { Metadata } from "next";
import Link from "next/link";
import CardTracker from "@/components/CardTracker";
import ScopeNote from "@/components/ScopeNote";

export const metadata: Metadata = {
  title: "Tracker de cartes — bêta",
  description: "Recherche bilingue et cotations séparées par source, langue, état et grade pour les cartes Pokémon suivies par PKM Radar.",
};

export default function CardsPage() {
  return (
    <div className="relative z-10 min-h-screen">
      <header className="border-b border-ink-700/70">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <Link href="/" className="display text-[1.15rem] tracking-tight text-mist-050">PKM Radar</Link>
          <nav aria-label="Sections" className="overflow-x-auto"><ul className="m-0 flex w-max list-none items-center gap-1 p-0 text-[0.82rem]"><li><Link href="/" className="rounded-lg px-3 py-1.5 text-mist-300 hover:bg-ink-800 hover:text-mist-050">Radar</Link></li><li><span aria-current="page" className="rounded-lg bg-ink-800 px-3 py-1.5 text-mist-050">Cartes <sup className="text-[0.6rem] text-accent">bêta</sup></span></li><li><Link href="/drop-rate-v2" className="rounded-lg px-3 py-1.5 text-mist-300 hover:bg-ink-800 hover:text-mist-050">Drop rate v2</Link></li><li><Link href="/marche" className="rounded-lg px-3 py-1.5 text-mist-300 hover:bg-ink-800 hover:text-mist-050">Marché</Link></li></ul></nav>
        </div>
      </header>
      <main id="contenu" className="mx-auto max-w-[1180px] px-4 pb-24 sm:px-6"><CardTracker /><ScopeNote className="mt-8 border-t border-ink-700 pt-6" /></main>
    </div>
  );
}
