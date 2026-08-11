"use client";

import { useState } from "react";
import type { RadarData, SetEntry } from "@/lib/types";

// Page « Taux de drop » — deux étages étanches : les probabilités (universelles,
// indépendantes de la langue) puis leur traduction en euros (prix français).
// La couleur suit le PALIER de rareté, identique d'un set à l'autre : l'œil
// apprend une fois, lit partout. Le libellé porte toujours l'information —
// la couleur est un renfort, jamais le seul canal.

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const pctFmt = (rate: number) =>
  `${(rate * 100).toLocaleString("fr-FR", { maximumFractionDigits: rate < 0.02 ? 1 : 0 })} %`;

// Paliers de rareté → couleurs fixes (palette catégorielle validée, mode
// sombre). Le mapping couvre toutes les ères : la chaîne de rareté est
// normalisée vers un palier.
function tierOf(rarity: string): { color: string; tier: number } {
  const r = rarity.toLowerCase();
  if (/(hyper|rainbow|secret)/.test(r)) return { color: "#d55181", tier: 6 };
  if (/(special illustration|shiny ultra)/.test(r)) return { color: "#c98500", tier: 5 };
  if (/(^ultra|rare ultra|illustration|shiny rare|radiant)/.test(r)) return { color: "#199e70", tier: 4 };
  if (/(vmax|vstar|double|gx|ex\b|holo v$)/.test(r)) return { color: "#9085e9", tier: 3 };
  if (/(holo)/.test(r)) return { color: "#3987e5", tier: 2 };
  return { color: "#6b7488", tier: 1 };
}

function eraOf(set: SetEntry) {
  return set.jpOnly ? "Japonais" : set.era;
}
const ERA_ORDER = ["Écarlate et Violet", "Épée et Bouclier", "Soleil & Lune", "XY", "Japonais"];

function Dot({ color }: { color: string }) {
  return <span aria-hidden className="mr-2 inline-block h-2.5 w-2.5 rounded-[4px] align-[-1px]" style={{ background: color }} />;
}

// Barre de taux : pleine jusqu'au bas de la fourchette, translucide jusqu'au
// haut — la bande EST l'incertitude, dessinée plutôt que racontée.
function RateBar({ lo, hi, max, color }: { lo: number; hi: number; max: number; color: string }) {
  return (
    <span aria-hidden className="relative block h-2 w-full overflow-hidden rounded-full bg-ink-800">
      <span className="absolute inset-y-0 left-0 rounded-full opacity-35" style={{ width: `${(hi / max) * 100}%`, background: color }} />
      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(lo / max) * 100}%`, background: color }} />
    </span>
  );
}

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
  const maxRate = active.dropRates ? Math.max(...active.dropRates.classes.map((row) => row.rateHi)) : 1;

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

        {/* Carte d'identité du set : prix du booster, carte-titre (aperçu au
            survol, comme sur le radar) et effectifs par rareté — le contexte
            avant les chiffres. */}
        <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-4 rounded-2xl bg-ink-850 px-5 py-4 ring-1 ring-ink-700/70">
          <div>
            <p className="m-0 text-[0.7rem] uppercase tracking-wider text-mist-500">Booster</p>
            <p className="tabular m-0 mt-0.5 text-[1.35rem] font-semibold leading-none text-mist-050">
              {boosterPrice != null ? eur.format(boosterPrice) : "—"}
            </p>
          </div>
          {active.bestCard && (
            <div>
              <p className="m-0 text-[0.7rem] uppercase tracking-wider text-mist-500">Carte-titre</p>
              <p className="m-0 mt-0.5 leading-none">
                <span className="group relative inline-block">
                  {active.bestCard.url ? (
                    <a
                      href={active.bestCard.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[1.05rem] font-semibold text-mist-050 underline decoration-ink-500 underline-offset-4 transition-colors duration-200 hover:decoration-accent"
                    >
                      {active.bestCard.nameFR ?? active.bestCard.name}
                    </a>
                  ) : (
                    <span className="text-[1.05rem] font-semibold text-mist-050">
                      {active.bestCard.nameFR ?? active.bestCard.name}
                    </span>
                  )}
                  {active.bestCard.image && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-[150px] overflow-hidden rounded-lg shadow-[0_18px_40px_-12px_rgba(4,8,20,0.95)] ring-1 ring-ink-600 group-hover:block"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={active.bestCard.image} alt="" loading="lazy" className="block h-auto w-full" />
                    </span>
                  )}
                </span>
                <span className="tabular ml-2 text-[0.82rem] text-mist-500">{eur.format(active.bestCard.price)}</span>
              </p>
            </div>
          )}
          <ul className="m-0 ml-auto flex list-none flex-wrap items-center gap-x-4 gap-y-1.5 p-0 text-[0.82rem]">
            {active.dropRates
              ? active.dropRates.classes.map((row) => (
                  <li key={row.rarity} className="whitespace-nowrap text-mist-300">
                    <Dot color={tierOf(row.rarity).color} />
                    <strong className="tabular font-semibold text-mist-050">{row.count}</strong> {row.rarity}
                  </li>
                ))
              : box
                ? box.slots.map((slot, index) => (
                    <li key={slot.key} className="whitespace-nowrap text-mist-300">
                      <Dot color={["#c98500", "#9085e9", "#d55181"][index % 3]} />
                      <strong className="tabular font-semibold text-mist-050">{slot.poolSize}</strong> {slot.label}
                    </li>
                  ))
                : null}
          </ul>
        </div>

        {active.dropRates ? (
          <>
            {/* ---- La traduction en euros, d'abord ---- */}
            <section className="mt-5 rounded-2xl bg-ink-850 p-6 ring-1 ring-ink-700/70">
              <h3 className="display m-0 text-[1.1rem] text-mist-050">Ces taux de drop se traduisent en euros</h3>
              <p className="prose-measure m-0 mt-1 text-[0.82rem] leading-relaxed text-mist-500">
                Taux universels × prix observés : médiane Cardmarket de chaque classe
                {boosterPrice != null ? `, booster français à ${eur.format(boosterPrice)} (p10 eBay.fr)` : ""}.
              </p>

              {/* D'où vient la valeur d'un booster : chaque classe, sa part. */}
              <div className="mt-5">
                <div className="flex h-4 w-full overflow-hidden rounded-full" role="img"
                  aria-label={`Composition de la valeur brute d'un booster : ${active.dropRates.classes.map((r) => `${r.rarity} ${eur.format(r.contribution)}`).join(", ")}`}>
                  {active.dropRates.classes.map((row) => (
                    <span
                      key={row.rarity}
                      className="h-full border-r-2 border-ink-850 last:border-r-0"
                      style={{ width: `${(row.contribution / active.dropRates!.grossPerBooster) * 100}%`, background: tierOf(row.rarity).color }}
                    />
                  ))}
                </div>
                <ul className="m-0 mt-3 grid list-none gap-1 p-0">
                  {active.dropRates.classes.map((row) => (
                    <li key={row.rarity} className="flex flex-wrap items-baseline justify-between gap-x-4 text-[0.86rem]">
                      <span className="text-mist-300"><Dot color={tierOf(row.rarity).color} />{row.rarity}</span>
                      <span className="tabular text-right text-mist-100">
                        méd. {eur.format(row.median)} × 1/{row.oneInAny} ={" "}
                        <strong className="text-mist-050">{eur.format(row.contribution)}</strong>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

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
                    <p className="tabular m-0 mt-1 text-[1.5rem] font-semibold leading-none text-accent">
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

            {/* Provenance et taille d'échantillon, attachées aux taux. */}
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl bg-ink-850 px-4 py-2.5 text-[0.8rem] ring-1 ring-ink-700/70">
              <span className="text-mist-300">
                <strong className="font-semibold text-mist-050">Échantillon :</strong> {active.dropRates.sample ?? "—"}
              </span>
              <span className="text-mist-500">{active.dropRates.sampleSource}</span>
              <span
                className={`ml-auto rounded-md px-2 py-0.5 text-[0.72rem] font-semibold uppercase tracking-wide ${
                  active.dropRates.confidence === "solide"
                    ? "bg-[#199e70]/15 text-[color:var(--color-good)]"
                    : active.dropRates.confidence === "correcte"
                      ? "bg-accent/15 text-accent"
                      : "bg-[#c98500]/15 text-[color:var(--color-warn)]"
                }`}
              >
                {active.dropRates.confidence}
              </span>
            </div>
            <p className="prose-measure m-0 mt-3 text-[0.84rem] leading-relaxed text-mist-500">
              Taux <strong className="font-semibold text-mist-300">indépendants de la langue</strong>{" "}— la structure
              d&apos;impression est identique pour toutes les langues occidentales : ils valent pour vos boosters
              français. Les prix appliqués plus haut sont une étape séparée.
            </p>

            {/* ---- Les taux par rareté ---- */}
            <h3 className="display m-0 mt-8 text-[1.1rem] text-mist-050">Les taux, rareté par rareté</h3>
            <div className="mt-3 overflow-x-auto rounded-2xl ring-1 ring-ink-700/70">
              <table className="w-full min-w-[680px] border-collapse text-[0.86rem]">
                <caption className="sr-only">Taux de drop par rareté pour {active.name}</caption>
                <thead className="bg-ink-800 text-left">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium text-mist-100">Rareté</th>
                    <th scope="col" className="w-[30%] px-4 py-2 font-medium text-mist-100">
                      <span className="sr-only">Barre de probabilité</span>
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium text-mist-100">
                      N&apos;importe laquelle
                      <span className="block text-[0.68rem] font-normal text-mist-500">par booster · fourchette</span>
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium text-mist-100">
                      Une précise
                      <span className="block text-[0.68rem] font-normal text-mist-500">parmi N cartes</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {active.dropRates.classes.map((row) => {
                    const rateMid = (row.rateLo + row.rateHi) / 2;
                    const { color } = tierOf(row.rarity);
                    return (
                      <tr key={row.rarity} className="border-t border-ink-700/60">
                        <th scope="row" className="whitespace-nowrap px-4 py-1.5 text-left font-medium text-mist-050">
                          <Dot color={color} />
                          {row.rarity}
                          {row.premium && (
                            <span className="ml-2 rounded bg-ink-700 px-1.5 py-0.5 text-[0.66rem] font-normal uppercase tracking-wide text-[color:var(--color-warn)]">
                              chase
                            </span>
                          )}
                        </th>
                        <td className="px-4 py-1.5">
                          <RateBar lo={row.rateLo} hi={row.rateHi} max={maxRate} color={color} />
                        </td>
                        <td className="tabular whitespace-nowrap px-4 py-1.5 text-right text-mist-050">
                          1/{row.oneInAny} · {pctFmt(rateMid)}
                          <span className="ml-1.5 text-[0.72rem] text-mist-500">
                            ({pctFmt(row.rateLo)}–{pctFmt(row.rateHi)})
                          </span>
                        </td>
                        <td className="tabular whitespace-nowrap px-4 py-1.5 text-right text-mist-300">
                          1/{row.oneInSpecific}
                          <span className="ml-1.5 text-[0.72rem] text-mist-500">· {row.count} cartes</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {active.dropRates.partialNote && (
              <p className="prose-measure m-0 mt-4 text-[0.78rem] leading-relaxed text-mist-500">{active.dropRates.partialNote}</p>
            )}
          </>
        ) : box ? (
          <>
            <section className="mt-5 rounded-2xl bg-ink-850 p-6 ring-1 ring-ink-700/70">
              <h3 className="display m-0 text-[1.1rem] text-mist-050">Ces garanties se traduisent en euros</h3>
              <ul className="m-0 mt-4 grid list-none gap-1 p-0">
                {box.slots.map((slot, index) => {
                  const mid = (slot.countLo + slot.countHi) / 2;
                  return (
                    <li key={slot.key} className="flex flex-wrap items-baseline justify-between gap-x-4 text-[0.86rem]">
                      <span className="text-mist-300">
                        <Dot color={["#c98500", "#9085e9", "#d55181"][index % 3]} />
                        {slot.label}
                      </span>
                      <span className="tabular text-right text-mist-100">
                        {eur.format(slot.meanNet)} × {mid.toLocaleString("fr-FR")} ={" "}
                        <strong className="text-mist-050">{eur.format(slot.meanNet * mid)}</strong>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-5 border-t border-ink-700 pt-4">
                <p className="m-0 text-[0.74rem] uppercase tracking-wider text-mist-500">Espérance nette par boîte</p>
                <p className="tabular m-0 mt-1 text-[1.5rem] font-semibold leading-none text-accent">
                  {eur.format(box.slots.reduce((sum, slot) => sum + slot.meanNet * ((slot.countLo + slot.countHi) / 2), 0))}
                  {box.boosterPrice != null && (
                    <span className="ml-2 text-[0.85rem] font-normal text-mist-500">
                      pour ~{eur.format(box.boosterPrice * box.packsPerBox)} de boîte
                    </span>
                  )}
                </p>
              </div>
            </section>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl bg-ink-850 px-4 py-2.5 text-[0.8rem] ring-1 ring-ink-700/70">
              <span className="text-mist-300">
                <strong className="font-semibold text-mist-050">Échantillon :</strong> {box.sample ?? "—"}
              </span>
              <span className="text-mist-500">{box.sampleSource}</span>
              <span className="ml-auto rounded-md bg-accent/15 px-2 py-0.5 text-[0.72rem] font-semibold uppercase tracking-wide text-accent">
                {box.confidence}
              </span>
            </div>
            <h3 className="display m-0 mt-8 text-[1.1rem] text-mist-050">Les garanties, boîte par boîte</h3>
            <div className="mt-3 overflow-x-auto rounded-2xl ring-1 ring-ink-700/70">
              <table className="w-full min-w-[560px] border-collapse text-[0.86rem]">
                <caption className="sr-only">Garanties par boîte pour {active.name}</caption>
                <thead className="bg-ink-800 text-left">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium text-mist-100">Garantie</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium text-mist-100">
                      Par boîte
                      <span className="block text-[0.68rem] font-normal text-mist-500">de {box.packsPerBox} boosters</span>
                    </th>
                    <th scope="col" className="px-4 py-2 text-right font-medium text-mist-100">Pool</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium text-mist-100">
                      Valeur nette moyenne
                      <span className="block text-[0.68rem] font-normal text-mist-500">du hit</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {box.slots.map((slot, index) => (
                    <tr key={slot.key} className="border-t border-ink-700/60">
                      <th scope="row" className="px-4 py-1.5 text-left font-medium text-mist-050">
                        <Dot color={["#c98500", "#9085e9", "#d55181"][index % 3]} />
                        {slot.label}
                      </th>
                      <td className="tabular px-4 py-1.5 text-right text-mist-050">
                        ×{slot.countLo === slot.countHi ? slot.countLo : `${slot.countLo}-${slot.countHi}`}
                      </td>
                      <td className="tabular px-4 py-1.5 text-right text-mist-300">{slot.poolSize} cartes</td>
                      <td className="tabular px-4 py-1.5 text-right text-mist-050">{eur.format(slot.meanNet)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="prose-measure m-0 mt-4 text-[0.78rem] leading-relaxed text-mist-500">{box.note}</p>
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
