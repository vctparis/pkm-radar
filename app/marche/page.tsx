import Link from "next/link";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Metadata } from "next";
import type { RadarData } from "@/lib/types";

export const metadata: Metadata = {
  title: "Marché · bêta",
  description:
    "La couche qualité des données : prix observé vs périmètre retenu, annonces écartées et pourquoi — avant toute métrique.",
};

// Page « Marché (bêta) » — Layer 0 rendu visible.
//
// Tout ce que les autres pages consomment (médiane, plancher, EV) est calculé
// sur la population retenue (trusted + review). Ici on montre l'envers : ce qui a été observé,
// ce qui a été écarté, et pourquoi. Règle de la plateforme : collect
// everything, trust selectively, delete nothing, predict nothing until
// validated.

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

const REASON_LABELS: Record<string, string> = {
  lexique_contrefacon: "lexique contrefaçon (proxy, replica…)",
  vendeur_sans_historique: "vendeur sans historique",
  prix_tres_sous_marche: "prix très sous le marché",
};

type LedgerStats = {
  tracked: number;
  sealed: number;
  cards: number;
  highRisk: number;
  since: string | null;
  reasons: Map<string, number>;
};

async function loadLedgerStats(): Promise<Map<string, LedgerStats>> {
  const stats = new Map<string, LedgerStats>();
  const dir = join(process.cwd(), "data", "ledger");
  let files: string[] = [];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  } catch {
    return stats;
  }
  for (const file of files) {
    try {
      const store = JSON.parse(await readFile(join(dir, file), "utf8")) as {
        listings: Record<string, { subject: string; first_seen: string; integrity: string; integrity_reasons?: string[]; matching: string }>;
      };
      const rows = Object.values(store.listings ?? {});
      const reasons = new Map<string, number>();
      let highRisk = 0;
      for (const row of rows) {
        if (row.matching === "exact" && row.integrity === "high_risk") {
          highRisk++;
          for (const reason of row.integrity_reasons ?? []) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
        }
      }
      stats.set(file.replace(/\.json$/, ""), {
        tracked: rows.length,
        sealed: rows.filter((row) => row.subject?.startsWith("sealed")).length,
        cards: rows.filter((row) => row.subject?.startsWith("card:")).length,
        highRisk,
        since: rows.reduce<string | null>((min, row) => (min == null || row.first_seen < min ? row.first_seen : min), null),
        reasons,
      });
    } catch {
      // fichier illisible : on n'invente rien
    }
  }
  return stats;
}

export default async function MarchePage() {
  const raw = await readFile(join(process.cwd(), "public", "radar-data.json"), "utf8");
  const data = JSON.parse(raw) as RadarData;
  const ledger = await loadLedgerStats();

  const rows = data.sets
    .filter((set) => set.boosterFR)
    .map((set) => ({ set, quote: set.boosterFR!, stats: ledger.get(set.id) ?? null }))
    .sort((a, b) => (b.quote.quarantined ?? 0) - (a.quote.quarantined ?? 0));

  const totalTracked = [...ledger.values()].reduce((sum, s) => sum + s.tracked, 0);
  const totalHighRisk = [...ledger.values()].reduce((sum, s) => sum + s.highRisk, 0);

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
                <Link href="/sets" className="rounded-lg px-3 py-1.5 text-[0.85rem] text-mist-300 transition-colors duration-200 hover:bg-ink-800 hover:text-mist-050">
                  Sets
                </Link>
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
                <span aria-current="page" className="rounded-lg bg-ink-800 px-3 py-1.5 text-[0.85rem] text-mist-050">
                  Marché <sup className="text-[0.62rem] text-accent">bêta</sup>
                </span>
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
          <p className="m-0 text-[0.8rem] uppercase tracking-[0.14em] text-mist-500">
            Qualité des données · <span className="text-accent">bêta</span>
          </p>
          <h1 className="display mt-3 max-w-[24ch] text-[clamp(1.9rem,4vw,2.7rem)] text-mist-050">
            Ce que le marché montre, ce qu&apos;on croit
          </h1>
          <p className="prose-measure mt-4 text-[1.02rem] leading-relaxed text-mist-300">
            Tous les prix du site sont calculés sur les annonces <strong className="font-semibold text-mist-050">retenues</strong> :
            bon produit, puis absence de combinaison de signaux à haut risque. « Retenue » ne veut pas dire certifiée :
            les annonces à suivre restent visibles et comptées séparément. Cette page montre le plancher <em>observé</em>
            à côté du plancher <em>retenu</em>, les annonces écartées et pourquoi. Une annonce
            45&nbsp;% sous le marché chez un vendeur sans historique n&apos;est pas une bonne affaire&nbsp;: c&apos;est un
            risque d&apos;intégrité. On ne la supprime pas — on la met en quarantaine, on la trace, et elle ne pollue
            aucun calcul.
          </p>
        </div>

        {/* ---- Le ledger en un regard ---- */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-ink-850 p-5 ring-1 ring-ink-700/70">
            <p className="m-0 text-[0.74rem] uppercase tracking-wider text-mist-500">Annonces suivies</p>
            <p className="tabular m-0 mt-1 text-[1.6rem] font-semibold leading-none text-mist-050">{totalTracked.toLocaleString("fr-FR")}</p>
            <p className="m-0 mt-1.5 text-[0.78rem] text-mist-500">identifiant par identifiant, eBay.fr + CardTrader</p>
          </div>
          <div className="rounded-2xl bg-ink-850 p-5 ring-1 ring-ink-700/70">
            <p className="m-0 text-[0.74rem] uppercase tracking-wider text-mist-500">En quarantaine</p>
            <p className="tabular m-0 mt-1 text-[1.6rem] font-semibold leading-none text-[color:var(--color-warn)]">{totalHighRisk.toLocaleString("fr-FR")}</p>
            <p className="m-0 mt-1.5 text-[0.78rem] text-mist-500">risque d&apos;intégrité élevé — exclues des prix, jamais effacées</p>
          </div>
          <div className="rounded-2xl bg-ink-850 p-5 ring-1 ring-ink-700/70">
            <p className="m-0 text-[0.74rem] uppercase tracking-wider text-mist-500">Prochaine étape</p>
            <p className="display m-0 mt-1 text-[1.05rem] leading-tight text-mist-050">Flux d&apos;annonces</p>
            <p className="m-0 mt-1.5 text-[0.78rem] text-mist-500">entrées/sorties à J+30 — le ledger accumule dès aujourd&apos;hui</p>
          </div>
        </div>

        {/* ---- Set par set ---- */}
        <h2 className="display mb-3 mt-10 text-[1.2rem] text-mist-050">Boosters scellés — observé vs retenu</h2>
        <div className="overflow-x-auto rounded-2xl ring-1 ring-ink-700/70">
          <table className="w-full min-w-[860px] border-collapse text-[0.86rem]">
            <caption className="sr-only">Prix observés et retenus des boosters, annonces écartées par set</caption>
            <thead className="bg-ink-800 text-left">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium text-mist-100">Set</th>
                <th scope="col" className="px-4 py-2 text-right font-medium text-mist-100">
                  Médiane retenue
                  <span className="block text-[0.68rem] font-normal text-mist-500">la référence du site</span>
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium text-mist-100">
                  Plancher retenu
                  <span className="block text-[0.68rem] font-normal text-mist-500">p10 des annonces non quarantainées</span>
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium text-mist-100">
                  Plancher observé
                  <span className="block text-[0.68rem] font-normal text-mist-500">toutes annonces éligibles</span>
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium text-mist-100">
                  Annonces
                  <span className="block text-[0.68rem] font-normal text-mist-500">retenues (dont à suivre) · écartées</span>
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium text-mist-100">
                  Ledger
                  <span className="block text-[0.68rem] font-normal text-mist-500">annonces tracées</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ set, quote, stats }) => {
                const gap =
                  quote.observedFloor != null && quote.floor10 != null && quote.observedFloor < quote.floor10;
                return (
                  <tr key={set.id} className="border-t border-ink-700/60">
                    <th scope="row" className="whitespace-nowrap px-4 py-2 text-left font-medium text-mist-050">
                      {set.name}
                      <span className="ml-2 text-[0.72rem] font-normal text-mist-500">{set.jpOnly ? "JP" : "FR"}</span>
                    </th>
                    <td className="tabular whitespace-nowrap px-4 py-2 text-right text-mist-050">
                      {quote.median != null ? eur.format(quote.median) : "—"}
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-2 text-right text-mist-100">
                      {quote.floor10 != null ? eur.format(quote.floor10) : "—"}
                      {quote.sampleSufficient === false && (
                        <span className="ml-1 text-[0.68rem] text-[color:var(--color-warn)]" title="Moins de 10 annonces retenues : quantile indicatif.">
                          indicatif
                        </span>
                      )}
                    </td>
                    <td className={`tabular whitespace-nowrap px-4 py-2 text-right ${gap ? "text-[color:var(--color-warn)]" : "text-mist-300"}`}>
                      {quote.observedFloor != null ? eur.format(quote.observedFloor) : "—"}
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-2 text-right text-mist-300">
                      {/* retenues = sans signal + à suivre : c'est LA population des
                          métriques — pas de double comptage entre colonnes. */}
                      {(quote.offers ?? 0).toLocaleString("fr-FR")}
                      <span className="text-mist-500"> (dont {quote.review ?? 0})</span> ·{" "}
                      <span className={quote.quarantined ? "font-semibold text-[color:var(--color-warn)]" : "text-mist-500"}>
                        {quote.quarantined ?? 0}
                      </span>
                      {quote.complete === false && (
                        <span className="ml-1.5 text-[0.7rem] text-[color:var(--color-warn)]" title="Capture partielle : le résultat eBay dépassait la fenêtre paginée — flux non interprétables ce jour-là.">
                          ◐
                        </span>
                      )}
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-2 text-right text-mist-300">
                      {stats ? stats.sealed.toLocaleString("fr-FR") : "—"}
                      {stats?.since && <span className="ml-1.5 text-[0.72rem] text-mist-500">depuis {stats.since}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ---- Pourquoi des annonces sont écartées ---- */}
        <h2 className="display mb-3 mt-10 text-[1.2rem] text-mist-050">Pourquoi une annonce est écartée</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl bg-ink-850 p-5 ring-1 ring-ink-700/70">
            <p className="prose-measure m-0 text-[0.88rem] leading-relaxed text-mist-300">
              Des règles explicites, pas un score opaque. <strong className="font-semibold text-mist-050">Aucun signal
              seul ne condamne</strong> — un vendeur à 0 évaluation est peut-être simplement nouveau. C&apos;est la
              combinaison qui fait le risque&nbsp;:
            </p>
            <ul className="m-0 mt-3 grid list-none gap-1.5 p-0 text-[0.86rem] text-mist-300">
              <li>• <strong className="font-medium text-mist-100">lexique contrefaçon</strong> (proxy, replica, custom, métal…) → écartée à elle seule ;</li>
              <li>• <strong className="font-medium text-mist-100">prix très sous le marché</strong> (&lt; 60 % de la médiane des vendeurs établis) <em>et</em> <strong className="font-medium text-mist-100">vendeur sans historique</strong> → écartée ;</li>
              <li>• un seul de ces deux signaux → <strong className="font-medium text-mist-100">retenue</strong> dans les prix, mais suivie (« à suivre ») ;</li>
              <li>• la règle de prix ne s&apos;applique que si ≥ 3 vendeurs établis fournissent une référence — sinon elle se tait (pas de fallback silencieux).</li>
            </ul>
            <p className="m-0 mt-3 text-[0.78rem] leading-relaxed text-mist-500">
              « Écartée » signifie risque élevé, jamais « fausse » : une liquidation, une erreur de catégorie ou un
              produit abîmé produisent les mêmes symptômes. Le ledger garde tout — quand les règles s&apos;améliorent,
              tout l&apos;historique est rejoué.
            </p>
          </div>
          <div className="rounded-2xl bg-ink-850 p-5 ring-1 ring-ink-700/70">
            <p className="m-0 text-[0.74rem] uppercase tracking-wider text-mist-500">Motifs relevés (quarantaine)</p>
            <ul className="m-0 mt-3 grid list-none gap-1.5 p-0 text-[0.86rem]">
              {(() => {
                const all = new Map<string, number>();
                for (const stats of ledger.values())
                  for (const [reason, count] of stats.reasons) all.set(reason, (all.get(reason) ?? 0) + count);
                const entries = [...all.entries()].sort((a, b) => b[1] - a[1]);
                if (!entries.length)
                  return <li className="text-mist-500">Rien à signaler sur le dernier relevé.</li>;
                return entries.map(([reason, count]) => (
                  <li key={reason} className="flex items-baseline justify-between gap-4 text-mist-300">
                    <span>{REASON_LABELS[reason] ?? reason}</span>
                    <span className="tabular font-semibold text-mist-050">{count.toLocaleString("fr-FR")}</span>
                  </li>
                ));
              })()}
            </ul>
            <p className="m-0 mt-3 text-[0.78rem] leading-relaxed text-mist-500">
              Comptes cumulés depuis l&apos;ouverture du ledger. Une annonce écartée pour mauvais produit (lot, display,
              carte à l&apos;unité…) n&apos;apparaît pas ici&nbsp;: c&apos;est du mauvais matching, pas un risque.
            </p>
          </div>
        </div>

        {/* ---- La méthode ---- */}
        <section className="mt-10 rounded-2xl border border-ink-600 p-6">
          <h2 className="display m-0 text-[1.1rem] text-mist-050">La règle de la maison</h2>
          <p className="prose-measure m-0 mt-2 text-[0.95rem] leading-relaxed text-mist-300">
            <em>Collect everything. Trust selectively. Delete nothing. Predict nothing until validated.</em>
          </p>
          <p className="prose-measure m-0 mt-3 text-[0.85rem] leading-relaxed text-mist-500">
            Le ledger enregistre chaque annonce observée — identifiant, vendeur, prix, quantité et périmètre — sur le
            scellé et sur les cartes qui portent 80&nbsp;% de l&apos;espérance des boosters occidentaux. Pour les boxes
            japonaises sans EV carte par carte comparable, le périmètre est explicitement le top 12 en valeur.
            À J+30, il débloquera les flux (nouvelles annonces, sorties — jamais appelées « ventes »&nbsp;: une annonce
            disparue peut être retirée ou relistée). Puis la vitesse d&apos;offre, et l&apos;absorption — le prix
            résiste-t-il à l&apos;arrivée de supply&nbsp;? Aucune de ces couches ne produira de prédiction en euros tant
            qu&apos;un backtest sur notre propre historique ne l&apos;aura pas validée.
          </p>
        </section>
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
