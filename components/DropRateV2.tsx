"use client";

import { useMemo, useState } from "react";
import type { DropV2Data, DropV2Set } from "@/lib/drop-v2-types";

const eur = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const pctFormatter = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });
const pct = (value: number) => pctFormatter.format(value);

function confidenceCopy(set: DropV2Set) {
  if (set.confidence === "élevée") return "Données suffisamment fraîches et couvrantes pour orienter une décision.";
  if (set.confidence === "moyenne") return "Lecture utile, avec une part de l’EV encore ancrée sur la référence historique.";
  return "Ordre de grandeur seulement : taux anciens, couverture partielle ou source de prix fragile.";
}

function confidenceTone(confidence: DropV2Set["confidence"]) {
  if (confidence === "élevée") return "bg-[#dcebe4] text-[#165846]";
  if (confidence === "moyenne") return "bg-[#eee6cc] text-[#725716]";
  return "bg-[#f0ddd7] text-[#863f2e]";
}

export default function DropRateV2({ data }: { data: DropV2Data }) {
  const [activeId, setActiveId] = useState(data.sets.find((set) => set.id === "s151")?.id ?? data.sets[0]?.id);
  const active = data.sets.find((set) => set.id === activeId) ?? data.sets[0];
  const eras = useMemo(() => [...new Set(data.sets.map((set) => set.era))], [data.sets]);
  if (!active) return null;

  const retainedPct = active.boosterPrice > 0 ? active.netCentralMid / active.boosterPrice : 0;
  const fallback = Math.max(0, 1 - active.coverage);
  const baselineGross = active.classes.reduce((sum, row) => sum + row.baselineContribution, 0);
  const repricing = baselineGross > 0 ? active.grossCentral / baselineGross - 1 : 0;
  const maxContribution = Math.max(...active.classes.map((row) => row.centralContribution), 0.01);
  const dominant = [...active.classes].sort((a, b) => b.centralContribution - a.centralContribution)[0];
  const dominantShare = dominant ? dominant.centralContribution / Math.max(active.grossCentral, 0.01) : 0;

  return (
    <div className="drop-v2-shell min-h-screen bg-[#f2efe7] text-[#1d2521]">
      <main id="contenu" className="mx-auto max-w-[1160px] px-4 pb-24 sm:px-7">
        <section className="grid gap-8 border-b border-[#d3cfc3] py-8 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-end lg:py-10">
          <div>
            <p className="m-0 text-[0.74rem] font-semibold uppercase tracking-[0.16em] text-[#176b5b]">
              Modèle EX+ · bêta
            </p>
            <h1 className="m-0 mt-3 max-w-[22ch] text-[clamp(2.05rem,4.2vw,3.6rem)] font-semibold leading-[0.98] tracking-[-0.05em]">
              La valeur d’un drop, sans les cartes jouées.
            </h1>
            <p className="m-0 mt-5 max-w-[65ch] text-[1rem] leading-7 text-[#59615d]">
              Cotations Near Mint et Slightly Played, une voix par vendeur. La couverture manquante reste visible au
              lieu d’être silencieusement supprimée.
            </p>
          </div>

          <label className="block border-l-2 border-[#176b5b] pl-4">
            <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.13em] text-[#69716d]">
              Set analysé
            </span>
            <select
              value={active.id}
              onChange={(event) => setActiveId(event.target.value)}
              className="mt-2 w-full rounded-none border-0 border-b border-[#8d958f] bg-transparent px-0 py-2 text-[1rem] font-semibold text-[#1d2521] outline-none focus:border-[#176b5b]"
            >
              {eras.map((era) => (
                <optgroup key={era} label={era}>
                  {data.sets
                    .filter((set) => set.era === era)
                    .map((set) => (
                      <option key={set.id} value={set.id}>
                        {set.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
        </section>

        <section className="grid gap-8 py-10 lg:grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.55fr)] lg:gap-14 lg:py-12">
          <div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {active.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={active.logo} alt="" className="max-h-9 max-w-[145px] object-contain object-left" />
              ) : null}
              <p className="m-0 text-[0.8rem] text-[#69716d]">{active.nameEN && active.nameEN !== active.name ? active.nameEN : active.era}</p>
            </div>
            <h2 className="m-0 mt-5 max-w-[24ch] text-[clamp(1.8rem,4vw,3.25rem)] font-semibold leading-[1.02] tracking-[-0.045em]">
              À {eur.format(active.boosterPrice)}, la cotation nette du contenu moyen équivaut à {pct(retainedPct)} du booster.
            </h2>
            <p className="m-0 mt-5 max-w-[66ch] text-[0.96rem] leading-7 text-[#59615d]">
              Le contenu est coté {eur.format(active.grossCentral)} brut. Après 13 % de frais et un seuil bulk à 0,40 €,
              l’espérance se situe entre {eur.format(active.netCentralLo)} et {eur.format(active.netCentralHi)}. Ce n’est
              pas le résultat typique d’un booster : les grosses cartes tirent la moyenne vers le haut.
            </p>

            <div className="mt-9 grid gap-x-7 gap-y-6 border-y border-[#d3cfc3] py-6 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="m-0 text-[0.72rem] uppercase tracking-[0.11em] text-[#69716d]">Booster</p>
                <p className="m-0 mt-1 text-[1.55rem] font-semibold tracking-[-0.035em] [font-variant-numeric:tabular-nums]">{eur.format(active.boosterPrice)}</p>
              </div>
              <div>
                <p className="m-0 text-[0.72rem] uppercase tracking-[0.11em] text-[#69716d]">Cotation brute EX+</p>
                <p className="m-0 mt-1 text-[1.55rem] font-semibold tracking-[-0.035em] [font-variant-numeric:tabular-nums]">{eur.format(active.grossCentral)}</p>
              </div>
              <div>
                <p className="m-0 text-[0.72rem] uppercase tracking-[0.11em] text-[#69716d]">Nette si vendue</p>
                <p className="m-0 mt-1 text-[1.55rem] font-semibold tracking-[-0.035em] text-[#176b5b] [font-variant-numeric:tabular-nums]">{eur.format(active.netCentralMid)}</p>
              </div>
              <div>
                <p className="m-0 text-[0.72rem] uppercase tracking-[0.11em] text-[#69716d]">Scénario vente rapide</p>
                <p className="m-0 mt-1 text-[1.55rem] font-semibold tracking-[-0.035em] text-[#a34632] [font-variant-numeric:tabular-nums]">{eur.format(active.netQuickMid)}</p>
              </div>
            </div>
          </div>

          <aside className="self-start bg-[#e4ebe5] px-5 py-5 lg:mt-2">
            <div className="flex items-center justify-between gap-4">
              <p className="m-0 text-[0.76rem] font-semibold uppercase tracking-[0.12em] text-[#53615b]">Confiance</p>
              <span className={`px-2.5 py-1 text-[0.72rem] font-semibold ${confidenceTone(active.confidence)}`}>{active.confidence}</span>
            </div>
            <p className="m-0 mt-4 text-[0.9rem] leading-6 text-[#405049]">{confidenceCopy(active)}</p>

            <div className="mt-6">
              <div className="flex items-end justify-between gap-4">
                <span className="text-[0.78rem] text-[#53615b]">EV réactualisée en EX+</span>
                <strong className="text-[1.15rem] [font-variant-numeric:tabular-nums]">{pct(active.coverage)}</strong>
              </div>
              <div className="mt-2 h-1.5 bg-[#c7d0ca]">
                <span className="block h-full bg-[#176b5b]" style={{ width: `${active.coverage * 100}%` }} />
              </div>
            </div>

            <dl className="m-0 mt-6 grid gap-3 border-t border-[#bdc8c0] pt-5 text-[0.78rem]">
              <div className="flex justify-between gap-4">
                <dt className="text-[#627069]">Dernier marché EX+</dt>
                <dd className="m-0 font-semibold">{active.freshnessDays === 0 ? "aujourd’hui" : `il y a ${active.freshnessDays} j`}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#627069]">Taux de drop</dt>
                <dd className="m-0 font-semibold">{active.rateConfidence}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#627069]">Fallback historique</dt>
                <dd className="m-0 font-semibold">{pct(fallback)}</dd>
              </div>
            </dl>
          </aside>
        </section>

        <section className="grid gap-10 border-t border-[#d3cfc3] py-12 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16">
          <div>
            <p className="m-0 text-[0.74rem] font-semibold uppercase tracking-[0.15em] text-[#176b5b]">D’où vient la valeur</p>
            <h2 className="m-0 mt-2 text-[1.75rem] font-semibold tracking-[-0.04em]">Chaque rareté, sans décor superflu</h2>
            <div className="mt-7 grid gap-4">
              {[...active.classes]
                .sort((a, b) => b.centralContribution - a.centralContribution)
                .map((row) => (
                  <div key={row.rarity} className="grid grid-cols-[minmax(9rem,0.7fr)_minmax(6rem,1fr)_4.5rem] items-center gap-4">
                    <div>
                      <span className="text-[0.86rem] font-medium">{row.rarity}</span>
                      <span className="ml-2 text-[0.7rem] text-[#737b76]">1/{row.oneInAny}</span>
                    </div>
                    <div className="h-2 bg-[#ddd9cf]">
                      <span
                        className="block h-full bg-[#277565]"
                        style={{ width: `${Math.max(1.5, (row.centralContribution / maxContribution) * 100)}%` }}
                      />
                    </div>
                    <span className="text-right text-[0.84rem] font-semibold [font-variant-numeric:tabular-nums]">{eur.format(row.centralContribution)}</span>
                  </div>
                ))}
            </div>
          </div>

          <aside className="border-l-2 border-[#d3cfc3] pl-5">
            <p className="m-0 text-[0.72rem] uppercase tracking-[0.12em] text-[#69716d]">À retenir</p>
            <p className="m-0 mt-3 text-[1.15rem] font-semibold leading-6">
              {dominant?.rarity ?? "La rareté dominante"} porte {pct(dominantShare)} de la cotation brute.
            </p>
            <p className="m-0 mt-4 text-[0.86rem] leading-6 text-[#59615d]">
              La réactualisation EX+ déplace l’estimation de {repricing >= 0 ? "+" : ""}{pct(repricing)} par rapport à
              l’ancre historique. Ce mouvement peut refléter le marché actuel autant que la différence d’état.
            </p>
          </aside>
        </section>

        <section className="border-t border-[#d3cfc3] py-12">
          <div className="max-w-[760px]">
            <p className="m-0 text-[0.74rem] font-semibold uppercase tracking-[0.15em] text-[#176b5b]">Les cartes qui pèsent vraiment</p>
            <h2 className="m-0 mt-2 text-[1.75rem] font-semibold tracking-[-0.04em]">Prix EX+ actuels et chance de les tirer</h2>
            <p className="m-0 mt-3 text-[0.9rem] leading-6 text-[#59615d]">
              La médiane donne la cotation centrale entre vendeurs. Le p10 décrit un scénario de vente rapide ; il ne
              devient une référence solide qu’avec assez de vendeurs.
            </p>
          </div>

          {active.cards.length ? (
            <div className="mt-7 divide-y divide-[#d3cfc3] border-y border-[#d3cfc3]">
              <div className="hidden grid-cols-[minmax(12rem,1fr)_8rem_8rem_7rem_7rem] gap-4 py-2 text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-[#69716d] md:grid">
                <span>Carte</span><span className="text-right">Médiane EX+</span><span className="text-right">Vente rapide</span><span className="text-right">Chance</span><span className="text-right">Marché</span>
              </div>
              {active.cards.map((card) => (
                <div key={`${card.number}-${card.name}`} className="grid gap-3 py-4 md:grid-cols-[minmax(12rem,1fr)_8rem_8rem_7rem_7rem] md:items-center md:gap-4">
                  <div>
                    <strong className="text-[0.92rem] font-semibold">{card.name}</strong>
                    <span className="ml-2 text-[0.72rem] text-[#737b76]">#{card.number} · {card.rarity}</span>
                  </div>
                  <div className="flex justify-between md:block md:text-right">
                    <span className="text-[0.72rem] text-[#737b76] md:hidden">Médiane EX+</span>
                    <strong className="text-[0.86rem] [font-variant-numeric:tabular-nums]">{eur.format(card.median)}</strong>
                  </div>
                  <div className="flex justify-between md:block md:text-right">
                    <span className="text-[0.72rem] text-[#737b76] md:hidden">Vente rapide</span>
                    <span className="text-[0.86rem] [font-variant-numeric:tabular-nums]">{eur.format(card.floor10)}</span>
                  </div>
                  <div className="flex justify-between md:block md:text-right">
                    <span className="text-[0.72rem] text-[#737b76] md:hidden">Chance</span>
                    <span className="text-[0.84rem] [font-variant-numeric:tabular-nums]">1/{card.oneIn}</span>
                  </div>
                  <div className="flex justify-between md:block md:text-right">
                    <span className="text-[0.72rem] text-[#737b76] md:hidden">Marché</span>
                    <span className="text-[0.78rem] text-[#59615d]">{card.sellers} vendeurs</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-7 border-y border-[#d3cfc3] py-5 text-[0.88rem] text-[#59615d]">Aucune carte ne franchit encore le seuil de profondeur EX+.</p>
          )}
        </section>

        {active.partialNote ? (
          <aside className="border-l-2 border-[#a34632] bg-[#efe4dd] px-5 py-4 text-[0.86rem] leading-6 text-[#6c3c30]">
            <strong className="font-semibold">Périmètre incomplet.</strong> {active.partialNote}
          </aside>
        ) : null}

        <section className="border-t border-[#d3cfc3] py-10">
          <details>
            <summary className="cursor-pointer text-[1rem] font-semibold">Voir les taux et la méthode</summary>
            <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-14">
              <div className="divide-y divide-[#d3cfc3] border-y border-[#d3cfc3]">
                {active.classes.map((row) => (
                  <div key={row.rarity} className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 py-3 sm:grid-cols-[1fr_8rem_9rem] sm:items-center">
                    <strong className="text-[0.86rem] font-medium">{row.rarity}</strong>
                    <span className="text-right text-[0.84rem] [font-variant-numeric:tabular-nums]">
                      {pct((row.rateLo + row.rateHi) / 2)}
                      <span className="ml-1 text-[0.7rem] text-[#737b76]">({pct(row.rateLo)}–{pct(row.rateHi)})</span>
                    </span>
                    <span className="col-span-2 text-right text-[0.78rem] text-[#59615d] sm:col-span-1">
                      une précise ≈ 1/{row.oneInSpecific}
                    </span>
                  </div>
                ))}
              </div>
              <div className="text-[0.82rem] leading-6 text-[#59615d]">
                <p className="m-0"><strong className="text-[#1d2521]">Échantillon de taux.</strong> {active.sample ?? "non documenté"}.</p>
                <p className="m-0 mt-3"><strong className="text-[#1d2521]">Prix.</strong> Cotations françaises uniquement — eBay.fr (état sous EX écarté) + CardTrader restreint au FR — Near Mint / Slightly Played, annonces actives, minimum par vendeur puis médiane/p10.</p>
                <p className="m-0 mt-3"><strong className="text-[#1d2521]">Fallback.</strong> Les cartes sans {data.definition.minimumSellers} vendeurs et {data.definition.minimumOffers} offres gardent l’ancre Cardmarket ; leur part est incluse dans la couverture affichée.</p>
                <p className="m-0 mt-3"><strong className="text-[#1d2521]">Version.</strong> {data.modelVersion}, générée le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" }).format(new Date(data.generatedAt))}.</p>
              </div>
            </div>
          </details>
        </section>
      </main>
    </div>
  );
}
