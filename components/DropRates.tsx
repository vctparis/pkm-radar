"use client";

import { useState } from "react";
import type { RadarData, SetEntry } from "@/lib/types";

// Page « Taux de drop » : la table de probabilités du moteur d'ouverture,
// exposée telle quelle. Navigation à la PokeIndex — ères, puis vignettes de
// sets — et pour chaque set : les taux par rareté (« n'importe laquelle » vs
// « une carte précise »), puis leur traduction en euros.

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const pctFmt = (rate: number) =>
  `${(rate * 100).toLocaleString("fr-FR", { maximumFractionDigits: rate < 0.02 ? 1 : 0 })} %`;

// Regroupement d'ères pour la navigation — les sets japonais forment leur
// propre famille quelle que soit leur ère d'origine.
function eraOf(set: SetEntry) {
  return set.jpOnly ? "Japonais" : set.era;
}
const ERA_ORDER = ["Écarlate et Violet", "Épée et Bouclier", "Soleil & Lune", "XY", "Japonais"];

export default function DropRates({ data }: { data: RadarData }) {
  const eras = ERA_ORDER.filter((era) => data.sets.some((set) => eraOf(set) === era));
  const [era, setEra] = useState(eras[0]);
  const setsOfEra = data.sets.filter((set) => eraOf(set) === era);
  const [activeId, setActiveId] = useState(setsOfEra[0]?.id);
  const active = setsOfEra.find((set) => set.id === activeId) ?? setsOfEra[0];

  const pickEra = (next: string) => {
    setEra(next);
    const first = data.sets.find((set) => eraOf(set) === next);
    if (first) setActiveId(first.id);
  };

  if (!active) return null;

  const boosterPrice = active.boosterFR?.floor10 ?? active.live?.booster?.price ?? null;
  const opening = active.opening && active.opening.mode !== "box" ? active.opening : null;
  const box = active.opening && active.opening.mode === "box" ? active.opening : null;
  const netMid = opening ? (opening.netLo + opening.netHi) / 2 : null;
  const lossPct = opening && boosterPrice && netMid != null ? Math.round((1 - netMid / boosterPrice) * 100) : null;

  return (
    <div>
      {/* ---- Navigation : ères puis vignettes de sets ---- */}
      <div className="flex flex-wrap gap-2">
        {eras.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => pickEra(option)}
            aria-pressed={era === option}
            className={`rounded-xl border px-3 py-1.5 text-[0.88rem] transition-colors duration-200 ${
              era === option ? "border-accent bg-accent/10 text-mist-050" : "border-ink-600 text-mist-300 hover:text-mist-050"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2.5" role="tablist" aria-label="Sets">
        {setsOfEra.map((set) => {
          const selected = set.id === active.id;
          return (
            <button
              key={set.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActiveId(set.id)}
              className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 transition-all duration-200 ${
                selected ? "border-accent bg-ink-850 shadow-[0_10px_28px_-16px_rgba(4,8,20,0.9)]" : "border-ink-700 hover:border-ink-500"
              }`}
            >
              {set.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={set.logo} alt="" loading="lazy" className="h-7 w-auto max-w-[84px] object-contain" />
              ) : (
                <span className={`text-[0.86rem] font-medium ${selected ? "text-mist-050" : "text-mist-300"}`}>{set.name}</span>
              )}
              {set.logo && <span className="sr-only">{set.name}</span>}
            </button>
          );
        })}
      </div>

      {/* ---- Le set choisi ---- */}
      <section className="mt-8" aria-live="polite">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="display m-0 text-[1.5rem] text-mist-050">{active.name}</h2>
          <p className="m-0 text-[0.82rem] text-mist-500">
            {active.nameEN && active.nameEN !== active.name ? active.nameEN : ""}
          </p>
        </div>

        {active.dropRates ? (
          <>
            <p className="prose-measure m-0 mt-2 text-[0.86rem] leading-relaxed text-mist-300">
              Ces taux sont <strong className="font-semibold text-mist-050">indépendants de la langue</strong> :
              échantillonnés sur des ouvertures massives — surtout anglophones — ils valent pour vos boosters
              français, car toutes les langues occidentales d&apos;un set partagent la même structure
              d&apos;impression. Les prix n&apos;interviennent qu&apos;à l&apos;étape suivante.
            </p>
            <div className="mt-5 overflow-x-auto rounded-2xl ring-1 ring-ink-700/70">
              <table className="w-full min-w-[640px] border-collapse text-[0.88rem]">
                <caption className="sr-only">Taux de drop par rareté pour {active.name}</caption>
                <thead className="bg-ink-800 text-left">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium text-mist-100">Rareté</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium text-mist-100">
                      Cartes
                      <span className="mt-0.5 block text-[0.7rem] font-normal text-mist-500">dans ce set</span>
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium text-mist-100">
                      N&apos;importe laquelle
                      <span className="mt-0.5 block text-[0.7rem] font-normal text-mist-500">par booster</span>
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium text-mist-100">
                      Une carte précise
                      <span className="mt-0.5 block text-[0.7rem] font-normal text-mist-500">par booster</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {active.dropRates.classes.map((row) => {
                    const rateMid = (row.rateLo + row.rateHi) / 2;
                    return (
                      <tr key={row.rarity} className="border-t border-ink-700/70">
                        <th scope="row" className="px-4 py-3 text-left font-medium text-mist-050">
                          {row.rarity}
                          {row.premium && (
                            <span className="ml-2 rounded bg-ink-700 px-1.5 py-0.5 text-[0.68rem] font-normal uppercase tracking-wide text-[color:var(--color-warn)]">
                              chase
                            </span>
                          )}
                        </th>
                        <td className="tabular px-4 py-3 text-right text-mist-300">{row.count}</td>
                        <td className="tabular px-4 py-3 text-right text-mist-050">
                          1/{row.oneInAny} · {pctFmt(rateMid)}
                          <span className="mt-0.5 block text-[0.7rem] text-mist-500">
                            fourchette {pctFmt(row.rateLo)} – {pctFmt(row.rateHi)}
                          </span>
                        </td>
                        <td className="tabular px-4 py-3 text-right text-mist-300">1/{row.oneInSpecific}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ---- La traduction en euros ---- */}
            <section className="mt-6 rounded-2xl bg-ink-850 p-6 ring-1 ring-ink-700/70">
              <p className="m-0 text-[0.74rem] uppercase tracking-[0.14em] text-mist-500">Étape 2 — appliquer les prix</p>
              <h3 className="display m-0 mt-2 text-[1.1rem] text-mist-050">Ces taux de drop se traduisent en euros</h3>
              <p className="prose-measure m-0 mt-1 text-[0.82rem] leading-relaxed text-mist-500">
                Taux universels × prix observés : médiane Cardmarket de chaque classe, et booster français
                {boosterPrice != null ? ` à ${eur.format(boosterPrice)} (p10 eBay.fr)` : ""}. Médiane × taux =
                contribution par booster ; la valeur nette déduit les frais de revente et compte le bulk à zéro.
              </p>
              <ul className="m-0 mt-4 grid list-none gap-2 p-0">
                {active.dropRates.classes.map((row) => (
                  <li key={row.rarity} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-[0.88rem]">
                    <span className="text-mist-300">{row.rarity}</span>
                    <span className="tabular text-right text-mist-100">
                      méd. {eur.format(row.median)} × 1/{row.oneInAny} ={" "}
                      <strong className="text-mist-050">{eur.format(row.contribution)}</strong>
                      <span className="text-mist-500"> / booster</span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 grid gap-3 border-t border-ink-700 pt-4 sm:grid-cols-3">
                <div>
                  <p className="m-0 text-[0.74rem] uppercase tracking-wider text-mist-500">Valeur brute / booster</p>
                  <p className="tabular m-0 mt-1 text-[1.5rem] font-semibold leading-none text-mist-050">
                    {eur.format(active.dropRates.grossPerBooster)}
                  </p>
                </div>
                {opening && (
                  <div>
                    <p className="m-0 text-[0.74rem] uppercase tracking-wider text-mist-500">Nette une fois revendu</p>
                    <p className="tabular m-0 mt-1 text-[1.5rem] font-semibold leading-none text-mist-050">
                      {eur.format(opening.netLo)} – {eur.format(opening.netHi)}
                    </p>
                  </div>
                )}
                {lossPct != null && boosterPrice != null && (
                  <div>
                    <p className="m-0 text-[0.74rem] uppercase tracking-wider text-mist-500">
                      vs booster à {eur.format(boosterPrice)}
                    </p>
                    <p
                      className={`tabular m-0 mt-1 text-[1.5rem] font-semibold leading-none ${
                        lossPct > 0 ? "text-[color:var(--color-bad)]" : "text-[color:var(--color-good)]"
                      }`}
                    >
                      {lossPct > 0 ? "−" : "+"}
                      {Math.abs(lossPct)} %
                    </p>
                  </div>
                )}
              </div>
            </section>

            <p className="prose-measure m-0 mt-4 text-[0.78rem] leading-relaxed text-mist-500">
              Estimations communautaires ({active.dropRates.confidence}) — fourchettes, pas des promesses.
              {active.dropRates.partialNote ? ` ${active.dropRates.partialNote}` : ""}
            </p>
          </>
        ) : box ? (
          <>
            {/* Sets japonais : des garanties par boîte, pas des probabilités par booster. */}
            <div className="mt-5 overflow-x-auto rounded-2xl ring-1 ring-ink-700/70">
              <table className="w-full min-w-[560px] border-collapse text-[0.88rem]">
                <caption className="sr-only">Garanties par boîte pour {active.name}</caption>
                <thead className="bg-ink-800 text-left">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium text-mist-100">Garantie</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium text-mist-100">
                      Par boîte
                      <span className="mt-0.5 block text-[0.7rem] font-normal text-mist-500">de {box.packsPerBox} boosters</span>
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium text-mist-100">Pool</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium text-mist-100">
                      Valeur nette moyenne
                      <span className="mt-0.5 block text-[0.7rem] font-normal text-mist-500">du hit</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {box.slots.map((slot) => (
                    <tr key={slot.key} className="border-t border-ink-700/70">
                      <th scope="row" className="px-4 py-3 text-left font-medium text-mist-050">{slot.label}</th>
                      <td className="tabular px-4 py-3 text-right text-mist-050">
                        ×{slot.countLo === slot.countHi ? slot.countLo : `${slot.countLo}-${slot.countHi}`}
                      </td>
                      <td className="tabular px-4 py-3 text-right text-mist-300">{slot.poolSize} cartes</td>
                      <td className="tabular px-4 py-3 text-right text-mist-050">{eur.format(slot.meanNet)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <section className="mt-6 rounded-2xl bg-ink-850 p-6 ring-1 ring-ink-700/70">
              <h3 className="display m-0 text-[1.1rem] text-mist-050">Ces garanties se traduisent en euros</h3>
              <ul className="m-0 mt-4 grid list-none gap-2 p-0">
                {box.slots.map((slot) => {
                  const mid = (slot.countLo + slot.countHi) / 2;
                  return (
                    <li key={slot.key} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-[0.88rem]">
                      <span className="text-mist-300">{slot.label}</span>
                      <span className="tabular text-right text-mist-100">
                        {eur.format(slot.meanNet)} × {mid.toLocaleString("fr-FR")} ={" "}
                        <strong className="text-mist-050">{eur.format(slot.meanNet * mid)}</strong>
                        <span className="text-mist-500"> / boîte</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-5 border-t border-ink-700 pt-4">
                <p className="m-0 text-[0.74rem] uppercase tracking-wider text-mist-500">Espérance nette par boîte</p>
                <p className="tabular m-0 mt-1 text-[1.5rem] font-semibold leading-none text-mist-050">
                  {eur.format(box.slots.reduce((sum, slot) => sum + slot.meanNet * ((slot.countLo + slot.countHi) / 2), 0))}
                  {box.boosterPrice != null && (
                    <span className="ml-2 text-[0.85rem] font-normal text-mist-500">
                      pour ~{eur.format(box.boosterPrice * box.packsPerBox)} de boîte
                    </span>
                  )}
                </p>
              </div>
            </section>
            <p className="prose-measure m-0 mt-4 text-[0.78rem] leading-relaxed text-mist-500">
              Garanties estimées par la communauté ({box.confidence}). {box.note}
            </p>
          </>
        ) : (
          <p className="mt-6 rounded-xl border border-dashed border-ink-600 px-5 py-8 text-[0.88rem] text-mist-500">
            Pas encore de taux documentés pour ce set.
          </p>
        )}
      </section>
    </div>
  );
}
