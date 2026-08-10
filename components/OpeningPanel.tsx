"use client";

import { useState } from "react";
import type { Opening } from "@/lib/types";

// Panneau « À l'ouverture » : toute l'ingénierie (fourchettes, frais déduits,
// scénario d'écrémage) reste sous le capot — la surface ne montre que des
// phrases lisibles et des « 1 sur N ». Aucun jargon.

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const eur0 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

function Statement({ children, tone }: { children: React.ReactNode; tone?: "good" | "warn" }) {
  const color =
    tone === "good"
      ? "text-[color:var(--color-good)]"
      : tone === "warn"
        ? "text-[color:var(--color-warn)]"
        : "text-mist-050";
  return <p className={`display m-0 text-[clamp(1.3rem,2.6vw,1.7rem)] leading-snug ${color}`}>{children}</p>;
}

export default function OpeningPanel({ opening, setName }: { opening: Opening; setName: string }) {
  const [scenario, setScenario] = useState<"display" | "loose">("display");

  if (!opening) {
    return (
      <section className="rounded-2xl border border-ink-600 p-8">
        <p className="display m-0 text-[1.2rem] text-mist-050">Bientôt pour les sets japonais.</p>
        <p className="prose-measure m-0 mt-3 text-[0.92rem] leading-relaxed text-mist-300">
          Les boosters japonais ne fonctionnent pas au hasard pur : chaque boîte porte des garanties de tirage.
          C&apos;est une mécanique différente, qui mérite son propre calcul — en préparation.
        </p>
      </section>
    );
  }

  const isLoose = scenario === "loose";
  const lo = isLoose ? opening.looseLo : opening.netLo;
  const hi = isLoose ? opening.looseHi : opening.netHi;
  const ratioMid = (lo + hi) / 2 / opening.boosterPrice;
  const payMultiple = ratioMid > 0 ? 1 / ratioMid : null;
  const recoupMid = isLoose
    ? ((opening.recoupLooseLo ?? 0) + (opening.recoupLooseHi ?? 0)) / 2
    : (opening.recoupLo + opening.recoupHi) / 2;
  const top1 = opening.top1;

  // Verdict en une phrase — le cœur de la lecture.
  const verdict =
    ratioMid >= 0.9
      ? { text: "Le contenu vaut presque le prix du booster — situation rare, à surveiller.", tone: "good" as const }
      : ratioMid >= 0.5
        ? { text: `Vous payez environ ${payMultiple?.toFixed(1).replace(".", ",")}× ce que le booster contient.`, tone: undefined }
        : { text: `Vous payez environ ${payMultiple ? Math.round(payMultiple) : "—"}× ce que le booster contient.`, tone: "warn" as const };

  const top1Verdict =
    top1 &&
    (top1.expectedCostLo > top1.buyPrice * 1.5
      ? "Achetez la carte, pas le booster."
      : top1.expectedCostHi < top1.buyPrice
        ? "Ouvrir se défend face à l'achat direct."
        : "Ouvrir ou acheter : match serré.");

  return (
    <div className="grid gap-5">
      {/* ---- L'essentiel, en trois phrases ---- */}
      <section className="rounded-2xl bg-ink-850 p-6 ring-1 ring-ink-700/70 sm:p-8">
        <p className="m-0 text-[0.8rem] uppercase tracking-[0.14em] text-mist-500">À l&apos;ouverture</p>
        <div className="mt-4 grid gap-2">
          <Statement>Un booster coûte {eur.format(opening.boosterPrice)}.</Statement>
          <Statement>
            Ce qu&apos;il contient vaut {eur.format(lo)} à {eur.format(hi)} une fois revendu.
          </Statement>
          <Statement tone={verdict.tone}>{verdict.text}</Statement>
        </div>
        <p className="m-0 mt-5 text-[0.95rem] text-mist-300">
          {recoupMid > 0.005
            ? `Environ 1 booster sur ${Math.round(1 / recoupMid)} rembourse son prix.`
            : "Quasiment aucun booster ne rembourse son prix."}
        </p>

        {/* Scénario : d'où vient le booster ? */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {(
            [
              { key: "display", label: "Booster d'un display scellé" },
              { key: "loose", label: "Booster acheté à l'unité" },
            ] as const
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setScenario(option.key)}
              aria-pressed={scenario === option.key}
              className={`rounded-xl border px-3 py-1.5 text-[0.85rem] transition-colors duration-200 ${
                scenario === option.key
                  ? "border-accent bg-accent/10 text-mist-050"
                  : "border-ink-600 text-mist-300 hover:text-mist-050"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {isLoose && (
          <p className="prose-measure m-0 mt-3 text-[0.84rem] leading-relaxed text-mist-500">
            À l&apos;unité, partez du principe que les meilleures cartes ont pu être écartées avant la mise en
            vente : le calcul les retire entièrement. C&apos;est le plancher, pas une accusation.
          </p>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ---- La carte-titre : ouvrir ou acheter ? ---- */}
        {top1 && (
          <section className="rounded-2xl bg-ink-850 p-6 ring-1 ring-ink-700/70">
            <h3 className="display m-0 text-[1.1rem] text-mist-050">
              Viser {top1.nameFR ?? top1.name} ?
            </h3>
            <ul className="m-0 mt-4 grid list-none gap-3 p-0 text-[0.95rem] text-mist-300">
              <li className="flex items-baseline justify-between gap-4">
                <span>La tirer</span>
                <span className="tabular text-right text-mist-050">
                  1 booster sur {top1.oneInLo === top1.oneInHi ? top1.oneInLo : `${top1.oneInLo} à ${top1.oneInHi}`}
                </span>
              </li>
              <li className="flex items-baseline justify-between gap-4">
                <span>En ouvrant jusqu&apos;à l&apos;obtenir</span>
                <span className="tabular text-right text-mist-050">
                  {eur0.format(top1.expectedCostLo)} à {eur0.format(top1.expectedCostHi)}
                </span>
              </li>
              <li className="flex items-baseline justify-between gap-4">
                <span>L&apos;acheter directement</span>
                <span className="tabular text-right text-mist-050">{eur.format(top1.buyPrice)}</span>
              </li>
              {top1.perDisplay != null && (
                <li className="flex items-baseline justify-between gap-4">
                  <span>Dans un display entier</span>
                  <span className="tabular text-right text-mist-050">
                    {Math.round(top1.perDisplay * 100)} % de chances
                  </span>
                </li>
              )}
            </ul>
            <p className="display m-0 mt-5 text-[1.05rem] text-accent">{top1Verdict}</p>
            {isLoose && (
              <p className="m-0 mt-2 text-[0.78rem] text-mist-500">
                Ces chances valent pour un booster issu d&apos;un display scellé — à l&apos;unité, n&apos;y comptez pas.
              </p>
            )}
          </section>
        )}

        {/* ---- Les pioches qui comptent ---- */}
        <section className="rounded-2xl bg-ink-850 p-6 ring-1 ring-ink-700/70">
          <h3 className="display m-0 text-[1.1rem] text-mist-050">Ce que vous pouvez y trouver</h3>
          <ul className="m-0 mt-4 grid list-none gap-2.5 p-0">
            {opening.topPulls.map((pull) => (
              <li key={`${pull.number}-${pull.name}`} className="flex items-baseline justify-between gap-3 text-[0.92rem]">
                <span className={isLoose && pull.premium ? "text-mist-500 line-through" : "text-mist-100"}>
                  {pull.nameFR ?? pull.name}
                  <span className="ml-1.5 text-[0.75rem] text-mist-500">{pull.number}</span>
                </span>
                <span className="tabular whitespace-nowrap text-right text-mist-300">
                  1 sur {pull.oneIn} · <span className="text-mist-050">{eur.format(pull.price)}</span>
                </span>
              </li>
            ))}
          </ul>
          {isLoose && (
            <p className="m-0 mt-3 text-[0.78rem] text-mist-500">
              Les cartes barrées sont celles qu&apos;un vendeur qui écrème retire en premier.
            </p>
          )}
        </section>
      </div>

      {/* ---- La méthode, en petit — jamais dans le chemin ---- */}
      <p className="prose-measure m-0 text-[0.78rem] leading-relaxed text-mist-500">
        Estimations communautaires par ère ({opening.confidence}) — des fourchettes, pas des promesses. Frais de
        revente déduits, cartes sous 0,40 € comptées à zéro.
        {opening.partialNote ? ` ${opening.partialNote}` : ""}
        {` Un contenu qui rattrape le prix du booster est aussi un signal pour le scellé de ${setName} : quand ouvrir devient rentable, l'offre scellée fond.`}
      </p>
    </div>
  );
}
