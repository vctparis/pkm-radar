"use client";

import { useState } from "react";

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

const CRITERIA = [
  { key: "demand", label: "Demande", weight: 0.35, hint: "Popularité du Pokémon et de l'illustration, profondeur d'acheteurs. 20 = niche, 80 = Pokémon iconique avec ventes fréquentes." },
  { key: "scarcity", label: "Rareté de l'offre", weight: 0.25, hint: "Listings NM, âge, statut promo, risque de reprint. Une offre faible ne compte pas si un reprint reste probable." },
  { key: "condition", label: "Rareté d'état", weight: 0.15, hint: "Difficulté à trouver un exemplaire propre. Un gem rate faible justifie une note haute." },
  { key: "narrative", label: "Narratif", weight: 0.1, hint: "Première apparition, artwork culte, anniversaire. Le narratif soutient la persistance, pas la rareté." },
  { key: "liquidity", label: "Liquidité", weight: 0.15, hint: "Facilité de revente au prix de marché. Utilisez les ventes conclues, pas les prix affichés." },
] as const;

type CriteriaKey = (typeof CRITERIA)[number]["key"];

function Slider({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-[0.86rem] font-medium text-mist-100" htmlFor={`c-${label}`}>
          {label}
        </label>
        <output className="tabular text-[0.86rem] text-accent" htmlFor={`c-${label}`}>
          {value}
        </output>
      </div>
      <input
        id={`c-${label}`}
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-700 accent-[color:var(--color-accent)]"
      />
      <p className="m-0 text-[0.74rem] leading-snug text-mist-500">{hint}</p>
    </div>
  );
}

function CardScore() {
  const [values, setValues] = useState<Record<CriteriaKey, number>>({
    demand: 60,
    scarcity: 50,
    condition: 50,
    narrative: 40,
    liquidity: 55,
  });

  const score = CRITERIA.reduce((sum, c) => sum + c.weight * values[c.key], 0);
  const reading =
    score >= 80
      ? "Structure très forte — exiger malgré tout un bon prix d'entrée."
      : score >= 65
        ? "Structure intéressante — dépend du prix et du régime de marché."
        : score >= 50
          ? "Mixte — au moins un pilier est insuffisant."
          : "Fragile.";

  return (
    <section className="rounded-2xl bg-ink-850 p-6 ring-1 ring-ink-700/70">
      <h3 className="display m-0 text-[1.05rem] text-mist-050">Structure d&apos;une carte</h3>
      <p className="prose-measure m-0 mt-1 text-[0.84rem] leading-relaxed text-mist-500">
        À utiliser sur une carte que le radar a fait remonter, pour confronter la mesure à ce que vous savez du
        Pokémon, de l&apos;artwork et du marché.
      </p>
      <div className="mt-5 grid gap-4">
        {CRITERIA.map((c) => (
          <Slider
            key={c.key}
            label={c.label}
            hint={c.hint}
            value={values[c.key]}
            onChange={(v) => setValues((prev) => ({ ...prev, [c.key]: v }))}
          />
        ))}
      </div>
      <div className="mt-6 border-t border-ink-700 pt-4">
        <div className="flex items-baseline gap-2">
          <span className="tabular text-[2.2rem] font-semibold leading-none text-mist-050">{score.toFixed(1)}</span>
          <span className="text-[0.85rem] text-mist-500">/ 100</span>
        </div>
        <p className="m-0 mt-2 text-[0.86rem] text-mist-300">{reading}</p>
        <p className="m-0 mt-2 text-[0.76rem] text-mist-500">
          {CRITERIA.map((c) => `${c.label.toLowerCase()} ${(c.weight * values[c.key]).toFixed(1)}`).join(" + ")}
        </p>
      </div>
    </section>
  );
}

function Roi() {
  const [buy, setBuy] = useState(120);
  const [sell, setSell] = useState(190);
  const [fee, setFee] = useState(5);
  const [fixed, setFixed] = useState(8);
  const [years, setYears] = useState(3);

  const fees = (sell * fee) / 100;
  const net = sell - fees - fixed;
  const profit = net - buy;
  const cagr = buy > 0 && net > 0 ? (Math.pow(net / buy, 1 / Math.max(1, years)) - 1) * 100 : null;

  const field = (label: string, value: number, onChange: (v: number) => void, suffix: string, step = 1) => (
    <div className="grid gap-1">
      <label className="text-[0.8rem] text-mist-300" htmlFor={`roi-${label}`}>
        {label}
      </label>
      <div className="flex items-center gap-2 rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 transition-colors duration-200 focus-within:border-accent">
        <input
          id={`roi-${label}`}
          type="number"
          value={value}
          step={step}
          min={0}
          onChange={(e) => onChange(Number(e.target.value))}
          className="tabular w-full bg-transparent text-[0.9rem] text-mist-050 outline-none"
        />
        <span className="text-[0.78rem] text-mist-500">{suffix}</span>
      </div>
    </div>
  );

  return (
    <section className="rounded-2xl bg-ink-850 p-6 ring-1 ring-ink-700/70">
      <h3 className="display m-0 text-[1.05rem] text-mist-050">Rendement net après frais</h3>
      <p className="prose-measure m-0 mt-1 text-[0.84rem] leading-relaxed text-mist-500">
        Les frais de marketplace et d&apos;expédition décident souvent du résultat sur les petits montants. Le CAGR
        annualise pour comparer des durées de détention différentes.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {field("Prix d'achat", buy, setBuy, "€")}
        {field("Revente visée", sell, setSell, "€")}
        {field("Commission", fee, setFee, "%", 0.5)}
        {field("Coûts fixes", fixed, setFixed, "€")}
        {field("Détention", years, setYears, "ans")}
      </div>
      <div className="mt-6 grid gap-3 border-t border-ink-700 pt-4 sm:grid-cols-2">
        <div>
          <p className="m-0 text-[0.78rem] uppercase tracking-wider text-mist-500">Plus-value nette</p>
          <p
            className={`tabular m-0 mt-1 text-[1.7rem] font-semibold leading-none ${
              profit >= 0 ? "text-[color:var(--color-good)]" : "text-[color:var(--color-bad)]"
            }`}
          >
            {profit >= 0 ? "+" : ""}
            {eur.format(profit)}
          </p>
        </div>
        <div>
          <p className="m-0 text-[0.78rem] uppercase tracking-wider text-mist-500">Rendement annualisé</p>
          <p className="tabular m-0 mt-1 text-[1.7rem] font-semibold leading-none text-mist-050">
            {cagr == null ? "—" : `${cagr.toFixed(1)} %/an`}
          </p>
        </div>
      </div>
      <p className="m-0 mt-3 text-[0.76rem] leading-relaxed text-mist-500">
        Revente {eur.format(sell)} − frais {eur.format(fees)} − coûts fixes {eur.format(fixed)} ={" "}
        {eur.format(net)} nets, puis moins {eur.format(buy)} d&apos;achat.
      </p>
    </section>
  );
}

export default function Calculators() {
  return (
    <section id="calculators" className="scroll-mt-8">
      <h2 className="display text-[1.35rem] text-mist-050">7. Instruments de calcul</h2>
      <p className="prose-measure mt-2 text-[0.92rem] leading-relaxed text-mist-300">
        Deux instruments seulement. Le troisième — la lecture de phase à partir de la diffusion — demandait de saisir
        à la main des chiffres que le radar mesure désormais lui-même sur données de marché ; il a été retiré au
        profit de la mesure directe.
      </p>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <CardScore />
        <Roi />
      </div>
    </section>
  );
}
