"use client";

import { useState } from "react";
import type { BoxOpening } from "@/lib/types";

// Boîtes japonaises : des garanties, pas du hasard pur. Ce panneau est un
// moteur conditionnel — cochez ce qui est déjà sorti, dites combien de
// boosters ont été ouverts, et l'espérance des boosters RESTANTS se recalcule.
// Toute la mécanique (bornes de garanties, pools valorisés nets) vient du
// pipeline ; ici il n'y a que de l'arithmétique de slots.

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

export default function BoxOpeningPanel({ opening }: { opening: BoxOpening }) {
  const [packsOpened, setPacksOpened] = useState(0);
  const [pulled, setPulled] = useState<Record<string, number>>({});

  const packsRemaining = Math.max(1, opening.packsPerBox - packsOpened);

  // Espérance du prochain booster de CETTE boîte, en fourchette : pour chaque
  // garantie, (exemplaires restants / boosters restants) × valeur moyenne du
  // pool. Une garantie déjà tirée sort simplement de l'équation.
  const slotViews = opening.slots.map((slot) => {
    const taken = pulled[slot.key] ?? 0;
    const remainingLo = Math.max(0, slot.countLo - taken);
    const remainingHi = Math.max(0, slot.countHi - taken);
    const pLo = Math.min(1, remainingLo / packsRemaining);
    const pHi = Math.min(1, remainingHi / packsRemaining);
    return { slot, taken, remainingHi, pLo, pHi };
  });
  const evLo = slotViews.reduce((sum, view) => sum + view.pLo * view.slot.meanNet, 0);
  const evHi = slotViews.reduce((sum, view) => sum + view.pHi * view.slot.meanNet, 0);

  const price = opening.boosterPrice;
  const verdict =
    price == null
      ? null
      : evLo > price
        ? { text: "Les boosters restants valent plus que leur prix — la boîte est encore chaude.", tone: "text-[color:var(--color-good)]" }
        : evHi < price * 0.5
          ? { text: "Cette boîte a donné ce qu'elle avait à donner.", tone: "text-[color:var(--color-bad)]" }
          : { text: "Boîte dans la moyenne : l'essentiel des garanties reste à sortir.", tone: "text-mist-050" };

  const toggle = (key: string, index: number) => {
    setPulled((prev) => {
      const current = prev[key] ?? 0;
      // Cliquer une pastille au-delà du compte actuel coche jusqu'à elle ;
      // cliquer une pastille déjà cochée décoche à partir d'elle.
      return { ...prev, [key]: index < current ? index : index + 1 };
    });
  };

  return (
    <div className="grid gap-5">
      <section className="rounded-2xl bg-ink-850 p-6 ring-1 ring-ink-700/70 sm:p-8">
        <p className="m-0 text-[0.8rem] uppercase tracking-[0.14em] text-mist-500">À l&apos;ouverture · boîte japonaise</p>
        <p className="display m-0 mt-4 text-[clamp(1.3rem,2.6vw,1.7rem)] leading-snug text-mist-050">
          Une boîte de {opening.packsPerBox} boosters porte des garanties.
        </p>
        <p className="prose-measure m-0 mt-2 text-[0.92rem] leading-relaxed text-mist-300">
          Cochez ce qui est déjà sorti, et l&apos;espérance des boosters restants se recalcule. C&apos;est le bon
          outil face à une boîte entamée — ou pour suivre la vôtre pendant l&apos;ouverture.
        </p>

        {/* État de la boîte */}
        <div className="mt-6 grid gap-4">
          <label className="flex flex-wrap items-center gap-3 text-[0.9rem] text-mist-300">
            Boosters déjà ouverts
            <input
              type="number"
              min={0}
              max={opening.packsPerBox - 1}
              value={packsOpened}
              onChange={(e) => setPacksOpened(Math.max(0, Math.min(opening.packsPerBox - 1, Number(e.target.value) || 0)))}
              className="tabular w-20 rounded-lg border border-ink-600 bg-ink-900 px-3 py-1.5 text-mist-050 outline-none transition-colors duration-200 focus:border-accent"
            />
            <span className="text-[0.8rem] text-mist-500">sur {opening.packsPerBox}</span>
          </label>

          {slotViews.map(({ slot, taken }) => (
            <div key={slot.key} className="flex flex-wrap items-center gap-3">
              <span className="min-w-[11rem] text-[0.9rem] text-mist-100">{slot.label}</span>
              <span className="flex items-center gap-1.5">
                {Array.from({ length: slot.countHi }, (_, i) => {
                  const guaranteed = i < slot.countLo;
                  const checked = i < taken;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggle(slot.key, i)}
                      aria-pressed={checked}
                      aria-label={`${slot.label} — exemplaire ${i + 1}${guaranteed ? "" : " (non garanti)"}${checked ? ", déjà tiré" : ""}`}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg border text-[0.85rem] transition-colors duration-200 ${
                        checked
                          ? "border-accent bg-accent/15 text-accent"
                          : guaranteed
                            ? "border-ink-500 text-mist-300 hover:border-accent"
                            : "border-dashed border-ink-600 text-mist-500 hover:border-accent"
                      }`}
                    >
                      {checked ? "✓" : "?"}
                    </button>
                  );
                })}
              </span>
              <span className="text-[0.76rem] text-mist-500">
                ×{slot.countLo === slot.countHi ? slot.countLo : `${slot.countLo}-${slot.countHi}`} par boîte · pool de{" "}
                {slot.poolSize} cartes · {eur.format(slot.meanNet)} net en moyenne
              </span>
            </div>
          ))}
        </div>

        {/* Le résultat, en une phrase */}
        <div className="mt-7 border-t border-ink-700 pt-5">
          <p className="display m-0 text-[clamp(1.2rem,2.2vw,1.5rem)] text-mist-050">
            Le prochain booster de cette boîte contient {eur.format(evLo)} à {eur.format(evHi)}{" "}
            d&apos;espérance{price != null ? <> — il coûte {eur.format(price)}.</> : "."}
          </p>
          {verdict && <p className={`display m-0 mt-2 text-[1.02rem] ${verdict.tone}`}>{verdict.text}</p>}
        </div>
      </section>

      {/* Ce que chaque garantie peut donner */}
      <div className="grid gap-5 lg:grid-cols-2">
        {slotViews.map(({ slot, pLo, pHi }) => (
          <section key={slot.key} className="rounded-2xl bg-ink-850 p-6 ring-1 ring-ink-700/70">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="display m-0 text-[1.05rem] text-mist-050">{slot.label}</h3>
              <span className="tabular text-[0.85rem] text-mist-300">
                {Math.round(pLo * 100) === Math.round(pHi * 100)
                  ? `${Math.round(pHi * 100)} %`
                  : `${Math.round(pLo * 100)}-${Math.round(pHi * 100)} %`}{" "}
                au prochain booster
              </span>
            </div>
            <ul className="m-0 mt-4 grid list-none gap-2 p-0">
              {slot.top.map((card) => (
                <li key={`${card.number}-${card.name}`} className="flex items-baseline justify-between gap-3 text-[0.9rem]">
                  <span className="text-mist-100">
                    {card.name}
                    <span className="ml-1.5 text-[0.74rem] text-mist-500">{card.number}</span>
                  </span>
                  <span className="tabular whitespace-nowrap text-mist-300">
                    1 sur {slot.poolSize} · <span className="text-mist-050">{card.price != null ? eur.format(card.price) : "—"}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="prose-measure m-0 text-[0.78rem] leading-relaxed text-mist-500">
        Garanties estimées par la communauté ({opening.confidence}) — chaque set a les siennes. {opening.note} Les
        pastilles en pointillé ne sont pas garanties dans toutes les boîtes. Valeurs nettes : frais de revente
        déduits, prix des annonces japonaises en Europe.
      </p>
    </div>
  );
}
