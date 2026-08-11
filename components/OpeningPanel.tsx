"use client";

import { useState } from "react";
import BoxOpeningPanel from "./BoxOpeningPanel";
import type { BoxOpening, Opening, ProvenanceStats } from "@/lib/types";

// Panneau « À l'ouverture » : l'ingénierie (simulation, fourchettes, frais,
// provenance) reste sous le capot — la surface parle en phrases et en
// « 1 sur N ». Aucun jargon statistique n'atteint l'écran.

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const eur0 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

type ProvenanceKey = "sealedBox" | "freshBox" | "trustedLoose" | "unknownLoose";

// L'ordre est une échelle de confiance ; chaque niveau dit sa conséquence en
// une ligne — l'utilisateur choisit une situation, jamais un paramètre.
const PROVENANCES: { key: ProvenanceKey; label: string; hint: string; factor: number }[] = [
  { key: "sealedBox", label: "Display scellé", hint: "Toutes les chances sont intactes.", factor: 1 },
  { key: "freshBox", label: "Booster d'un display ouvert devant vous", hint: "Mêmes chances qu'un display scellé.", factor: 1 },
  { key: "trustedLoose", label: "Boutique qui détaille", hint: "Chances des grosses cartes réduites de 30 %, par prudence.", factor: 0.7 },
  { key: "unknownLoose", label: "Loose — origine inconnue", hint: "Le plancher : un lot mappé perd TOUS ses boosters à hit — le mappeur ne voit pas lequel contient quoi, il les retire en bloc.", factor: 0 },
];

function Statement({ children, tone }: { children: React.ReactNode; tone?: "good" | "warn" }) {
  const color =
    tone === "good"
      ? "text-[color:var(--color-good)]"
      : tone === "warn"
        ? "text-[color:var(--color-warn)]"
        : "text-mist-050";
  return <p className={`display m-0 text-[clamp(1.3rem,2.6vw,1.7rem)] leading-snug ${color}`}>{children}</p>;
}

// La distribution en une image : où atterrit un booster. Quatre issues, du
// jackpot à la perte sèche — encodage divergent, jamais la couleur seule
// (les libellés portent les pourcentages).
function OutcomeStrip({ stats }: { stats: ProvenanceStats }) {
  const double = stats.pDouble;
  const recoup = Math.max(0, stats.pRecoup - stats.pDouble);
  const softLoss = Math.max(0, 1 - stats.pRecoup - stats.pLoseHalf);
  const hardLoss = stats.pLoseHalf;
  const segments = [
    { share: double, color: "#199e70", label: "plus du double" },
    { share: recoup, color: "#3987e5", label: "remboursé" },
    { share: softLoss, color: "#c98500", label: "perte modérée" },
    { share: hardLoss, color: "#e66767", label: "plus de la moitié perdue" },
  ].filter((segment) => segment.share > 0.001);

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full" role="img" aria-label={segments.map((s) => `${s.label} : ${Math.round(s.share * 100)} %`).join(", ")}>
        {segments.map((segment) => (
          <span
            key={segment.label}
            className="h-full border-r-2 border-ink-850 last:border-r-0"
            style={{ width: `${segment.share * 100}%`, background: segment.color }}
          />
        ))}
      </div>
      <ul className="m-0 mt-2.5 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[0.78rem] text-mist-300">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: segment.color }} />
            {segment.label} <span className="tabular text-mist-050">{Math.round(segment.share * 100)} %</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function OpeningPanel({ opening, setName }: { opening: Opening | BoxOpening | null; setName: string }) {
  const [provenance, setProvenance] = useState<ProvenanceKey>("sealedBox");

  if (opening && opening.mode === "box") return <BoxOpeningPanel opening={opening} />;

  if (!opening) {
    return (
      <section className="rounded-2xl border border-ink-600 p-8">
        <p className="display m-0 text-[1.2rem] text-mist-050">Pas encore de calcul pour ce set.</p>
        <p className="prose-measure m-0 mt-3 text-[0.92rem] leading-relaxed text-mist-300">
          Il manque soit un prix de booster fiable, soit des taux de tirage documentés.
        </p>
      </section>
    );
  }

  const chosen = PROVENANCES.find((p) => p.key === provenance)!;
  // En ère SV (looseModel "independent"), aucun quota par produit n'est
  // documenté : les facteurs de décote ne s'appliquent pas — le risque de
  // sélection existe mais n'est pas quantifiable, on ne l'invente pas.
  const independent = opening.looseModel === "independent";
  const effFactor = independent ? 1 : chosen.factor;
  const hint =
    independent && chosen.factor < 1
      ? "Taux inchangés : aucun quota par produit n'est documenté sur ce set — aucune décote automatique n'est défendable. Le risque de sélection est réel mais non quantifié : il se gère par le choix du vendeur."
      : chosen.hint;
  const stats = opening.distribution?.byProvenance[provenance] ?? null;

  // Fourchette d'espérance du niveau choisi : interpolation entre le plancher
  // (classes premium à zéro) et le nominal, par le facteur de confiance.
  const lo = opening.looseLo + effFactor * (opening.netLo - opening.looseLo);
  const hi = opening.looseHi + effFactor * (opening.netHi - opening.looseHi);
  const ratioMid = (lo + hi) / 2 / opening.boosterPrice;
  const payMultiple = ratioMid > 0 ? 1 / ratioMid : null;
  const top1 = opening.top1;

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
      {/* ---- L'essentiel ---- */}
      <section className="rounded-2xl bg-ink-850 p-6 ring-1 ring-ink-700/70 sm:p-8">
        <p className="m-0 text-[0.8rem] uppercase tracking-[0.14em] text-mist-500">À l&apos;ouverture</p>
        <div className="mt-4 grid gap-2">
          <Statement>Un booster coûte {eur.format(opening.boosterPrice)}.</Statement>
          <Statement>
            Ce qu&apos;il contient vaut {eur.format(lo)} à {eur.format(hi)} une fois revendu.
          </Statement>
          <Statement tone={verdict.tone}>{verdict.text}</Statement>
        </div>

        {/* D'où vient le booster ? */}
        <div className="mt-7">
          <p className="m-0 mb-2 text-[0.8rem] uppercase tracking-[0.14em] text-mist-500">D&apos;où vient-il ?</p>
          <div className="flex flex-wrap gap-2">
            {PROVENANCES.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setProvenance(option.key)}
                aria-pressed={provenance === option.key}
                className={`rounded-xl border px-3 py-1.5 text-[0.85rem] transition-colors duration-200 ${
                  provenance === option.key
                    ? "border-accent bg-accent/10 text-mist-050"
                    : "border-ink-600 text-mist-300 hover:text-mist-050"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="m-0 mt-2 text-[0.82rem] text-mist-500">{hint}</p>
        </div>

        {/* Où atterrit un booster */}
        {stats && (
          <div className="mt-7 border-t border-ink-700 pt-5">
            <OutcomeStrip stats={stats} />
            <div className="mt-4 grid gap-1 text-[0.9rem] text-mist-300">
              <p className="m-0">
                {stats.median <= 0.01
                  ? "Un booster sur deux ne rend que du vrac — rien de revendable."
                  : `La moitié des boosters rendent moins de ${eur.format(stats.median)}.`}
              </p>
              {stats.p75 > 0.01 && <p className="m-0">Trois sur quatre rendent moins de {eur.format(stats.p75)}.</p>}
              {opening.distribution && (
                <p className="m-0">
                  Le jackpot : {top1?.nameFR ?? top1?.name ?? "la carte-titre"}, ~
                  {eur0.format(opening.distribution.jackpotNet)} net.
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ---- La carte-titre : ouvrir ou acheter ? ---- */}
        {top1 && (
          <section className="rounded-2xl bg-ink-850 p-6 ring-1 ring-ink-700/70">
            <h3 className="display m-0 text-[1.1rem] text-mist-050">Viser {top1.nameFR ?? top1.name} ?</h3>
            <ul className="m-0 mt-4 grid list-none gap-2 p-0 text-[0.95rem] text-mist-300">
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
                <span>L&apos;acheter directement{top1.buyPriceFR != null ? " en français" : ""}</span>
                <span className="tabular text-right text-mist-050">
                  {eur.format(top1.buyPriceFR ?? top1.buyPrice)}
                  {top1.buyPriceFR != null && (
                    <span className="ml-1.5 text-[0.78rem] text-mist-500">CM {eur.format(top1.buyPrice)}</span>
                  )}
                </span>
              </li>
              {top1.perDisplay != null && (
                <li className="flex items-baseline justify-between gap-4">
                  <span>Dans un display entier</span>
                  <span className="tabular text-right text-mist-050">{Math.round(top1.perDisplay * 100)} % de chances</span>
                </li>
              )}
            </ul>
            <p className="display m-0 mt-5 text-[1.05rem] text-accent">{top1Verdict}</p>
            {effFactor < 1 && (
              <p className="m-0 mt-2 text-[0.78rem] text-mist-500">
                Ces chances valent pour un booster aux probabilités intactes — pas pour la provenance choisie.
              </p>
            )}
          </section>
        )}

        {/* ---- Les pioches qui comptent ---- */}
        <section className="rounded-2xl bg-ink-850 p-6 ring-1 ring-ink-700/70">
          <h3 className="display m-0 text-[1.1rem] text-mist-050">Ce que vous pouvez y trouver</h3>
          <ul className="m-0 mt-4 grid list-none gap-1.5 p-0">
            {opening.topPulls.map((pull) => {
              const dimmed = effFactor === 0 && pull.premium;
              // Les cotes suivent la provenance : à −30 % de chances premium,
              // « 1 sur 215 » devient « 1 sur 307 » — sinon l'espérance et les
              // cotes affichées se contrediraient.
              const factor = pull.premium ? effFactor : 1;
              const oneIn = factor > 0 ? Math.round(pull.oneIn / factor) : null;
              const contribution = pull.contribution != null ? pull.contribution * factor : null;
              return (
                <li key={`${pull.number}-${pull.name}`} className="text-[0.92rem]">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={dimmed ? "text-mist-500 line-through" : "text-mist-100"}>
                      {pull.nameFR ?? pull.name}
                      <span className="ml-1.5 text-[0.75rem] text-mist-500">{pull.number}</span>
                    </span>
                    <span className="tabular whitespace-nowrap text-right text-mist-300">
                      {oneIn != null ? `1 sur ${oneIn}` : "écarté"} ·{" "}
                      <span className="text-mist-050">{eur.format(pull.price)}</span>
                    </span>
                  </div>
                  {/* La ligne qui réconcilie la grosse carte et la petite
                      moyenne : sa valeur × sa rareté = son poids réel. */}
                  {contribution != null && !dimmed && (
                    <p className="m-0 mt-0.5 text-right text-[0.74rem] text-mist-500">
                      pèse {eur.format(contribution)} dans l&apos;espérance d&apos;un booster
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="m-0 mt-4 border-t border-ink-700 pt-3 text-[0.8rem] leading-relaxed text-mist-500">
            {effFactor === 0
              ? "Les cartes barrées sont celles qu'un vendeur qui écrème retire en premier."
              : "Chacune vaut plus que le booster — multipliée par sa rareté, chacune ne pèse que quelques dizaines de centimes dans la moyenne. C'est tout le paradoxe d'une loterie."}
          </p>
        </section>
      </div>

      {/* ---- La méthode, en petit ---- */}
      <p className="prose-measure m-0 text-[0.78rem] leading-relaxed text-mist-500">
        Estimations communautaires par ère ({opening.confidence}), adaptées à ce set — des fourchettes, pas des
        promesses. Frais de revente déduits, cartes sous 0,40 € comptées à zéro, 20 000 ouvertures simulées.
        {opening.partialNote ? ` ${opening.partialNote}` : ""}
        {` Un contenu qui rattrape le prix du booster est aussi un signal pour le scellé de ${setName} : quand ouvrir devient rentable, l'offre scellée fond.`}
      </p>
    </div>
  );
}
