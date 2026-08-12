import Link from "next/link";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Metadata } from "next";
import type { RadarData, SetEntry } from "@/lib/types";

export const metadata: Metadata = {
  title: "Sets",
  description: "Tous les sets suivis, famille par famille : année de sortie et prix du booster aujourd'hui.",
};

// Page « Sets » — un index, pas une analyse : trois informations par ligne
// (le set, sa sortie, son booster au prix du jour) et rien d'autre. Un seul
// tableau pour toute la page : les colonnes restent alignées d'une famille à
// l'autre, chaque famille est un groupe de lignes coiffé de ses années.

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

// Années des blocs occidentaux — des faits d'édition, pas des données de
// relevé : le bloc existe même là où le radar ne suit que quelques sets.
const FAMILIES: { name: string; years: string }[] = [
  { name: "Écarlate et Violet", years: "2023 – aujourd'hui" },
  { name: "Épée et Bouclier", years: "2020 – 2023" },
  { name: "Soleil & Lune", years: "2017 – 2019" },
  { name: "XY", years: "2014 – 2016" },
];

const familyOf = (set: SetEntry) => set.era.replace(" (JP)", "");
const yearOf = (set: SetEntry) => (set.releaseDate ? set.releaseDate.slice(0, 4) : "—");

export default async function SetsPage() {
  const raw = await readFile(join(process.cwd(), "public", "radar-data.json"), "utf8");
  const data = JSON.parse(raw) as RadarData;
  const generated = new Date(data.generatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  const families = FAMILIES.map((family) => ({
    ...family,
    sets: data.sets
      .filter((set) => familyOf(set) === family.name)
      .sort((a, b) => (a.releaseDate ?? "").localeCompare(b.releaseDate ?? "")),
  })).filter((family) => family.sets.length);

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
                  Sets
                </span>
              </li>
              <li>
                <Link href="/taux-de-drop" className="rounded-lg px-3 py-1.5 text-[0.85rem] text-mist-300 transition-colors duration-200 hover:bg-ink-800 hover:text-mist-050">
                  Taux de drop
                </Link>
              </li>
              <li>
                <Link href="/portefeuille" className="rounded-lg px-3 py-1.5 text-[0.85rem] text-mist-300 transition-colors duration-200 hover:bg-ink-800 hover:text-mist-050">
                  Portefeuille
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
          <p className="m-0 text-[0.8rem] uppercase tracking-[0.14em] text-mist-500">Index</p>
          <h1 className="display mt-3 max-w-[22ch] text-[clamp(1.9rem,4vw,2.7rem)] text-mist-050">Les sets suivis</h1>
          <p className="prose-measure mt-4 text-[1.02rem] leading-relaxed text-mist-300">
            {data.sets.length} sets, famille par famille : quand chaque set est sorti, et ce que son booster coûte
            aujourd&apos;hui — prix relevés le {generated}.
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl ring-1 ring-ink-700/70">
          <table className="w-full min-w-[560px] border-collapse text-[0.92rem]">
            <caption className="sr-only">Sets suivis par famille : année de sortie et prix du booster</caption>
            <thead className="text-left">
              <tr className="text-[0.7rem] uppercase tracking-wider text-mist-500">
                <th scope="col" className="px-5 py-3 font-medium">Set</th>
                <th scope="col" className="px-5 py-3 text-right font-medium">Sortie</th>
                <th scope="col" className="px-5 py-3 text-right font-medium">Booster aujourd&apos;hui</th>
              </tr>
            </thead>
            {families.map((family) => (
              <tbody key={family.name}>
                <tr className="border-t border-ink-700/60 bg-ink-850">
                  <th scope="colgroup" colSpan={3} className="px-5 py-2.5 text-left">
                    <span className="display text-[1rem] text-mist-050">{family.name}</span>
                    <span className="tabular ml-3 text-[0.8rem] font-normal text-mist-500">{family.years}</span>
                  </th>
                </tr>
                {family.sets.map((set) => {
                  const median = set.boosterFR?.median ?? null;
                  const fallback = set.live?.booster?.price ?? null;
                  return (
                    <tr key={set.id} className="border-t border-ink-700/40">
                      <td className="px-5 py-2.5">
                        <span className="flex items-center gap-3">
                          {set.logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={set.logo} alt="" loading="lazy" className="h-5 w-12 object-contain object-left" />
                          ) : (
                            <span aria-hidden className="w-12" />
                          )}
                          <span className="font-medium text-mist-050">{set.name}</span>
                          {set.jpOnly && (
                            <span className="rounded bg-ink-700 px-1.5 py-0.5 text-[0.66rem] uppercase tracking-wide text-mist-300">
                              JP
                            </span>
                          )}
                          {set.nameEN && set.nameEN !== set.name && (
                            <span className="text-[0.8rem] text-mist-500 max-sm:hidden">{set.nameEN}</span>
                          )}
                        </span>
                      </td>
                      <td className="tabular whitespace-nowrap px-5 py-2.5 text-right text-mist-300">{yearOf(set)}</td>
                      <td className="tabular whitespace-nowrap px-5 py-2.5 text-right">
                        {median != null ? (
                          <strong className="font-semibold text-mist-050">{eur.format(median)}</strong>
                        ) : fallback != null ? (
                          <>
                            <strong className="font-semibold text-mist-050">{eur.format(fallback)}</strong>
                            <span className="ml-1.5 text-[0.72rem] text-mist-500">CardTrader</span>
                          </>
                        ) : (
                          <span className="text-mist-500">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>

        <p className="prose-measure m-0 mt-4 text-[0.8rem] leading-relaxed text-mist-500">
          Prix : médiane des annonces françaises d&apos;eBay.fr — ce qu&apos;on paie réellement, pas le plancher. À
          défaut d&apos;annonces FR (sets japonais), le prix CardTrader est indiqué. Le détail de chaque set vit sur le
          radar et dans les taux de drop.
        </p>
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
            <Link href="/offre" className="text-mist-300 transition-colors duration-200 hover:text-mist-050">
              Offre &amp; print run →
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
