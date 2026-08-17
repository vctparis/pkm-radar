"use client";

import { useMemo, useState } from "react";
import type {
  MarketPressureData,
  MarketPressureSet,
  PressureSnapshot,
  PressureSourceSeries,
} from "@/lib/market-pressure-types";

const EBAY = "#3987e5";
const CARDTRADER = "#c98500";
const INK = "#eef1f6";
const MUTED = "#99a1b3";
const GRID = "#2a3040";

const eur = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const integer = new Intl.NumberFormat("fr-FR");
const pct = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 });
const parseDate = (value: string) => Date.parse(`${value}T12:00:00Z`);
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const shortDate = (value: string) => {
  const [, month, day] = value.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]}`;
};

function sourceName(source: "ebay" | "cardtrader") {
  return source === "ebay" ? "eBay.fr" : "CardTrader";
}

function languageLabel(value: string | null) {
  const labels: Record<string, string> = { fr: "FR", en: "EN", jp: "JP", it: "IT", es: "ES", de: "DE", kr: "KR" };
  return value ? labels[value] ?? value.toUpperCase() : "langue non renseignée";
}

function formatDelta(value: number | null, unit: "pct" | "number" = "pct") {
  if (value == null) return "—";
  if (unit === "number") return `${value > 0 ? "+" : ""}${integer.format(value)}`;
  return `${value > 0 ? "+" : ""}${pct.format(value)}`;
}

function Readiness({ current, minimum }: { current: number; minimum: number }) {
  return (
    <div className="mt-5" aria-label={`${current} journées complètes sur ${minimum} requises`}>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${minimum}, minmax(0, 1fr))` }}>
        {Array.from({ length: minimum }, (_, index) => (
          <span
            key={index}
            aria-hidden
            className={`h-2 rounded-sm ${index < current ? "bg-accent" : "bg-ink-600"}`}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[0.72rem] text-mist-500">
        <span>{current} observées</span>
        <span>{minimum} pour un premier verdict</span>
      </div>
    </div>
  );
}

function MarketOverview({
  sets,
  activeId,
  onSelect,
}: {
  sets: MarketPressureSet[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const ordered = useMemo(
    () => [...sets].sort((a, b) => {
      const depth = (set: MarketPressureSet) =>
        Math.max(set.sources.ebay?.latest?.activeListings ?? 0, set.sources.cardtrader?.latest?.activeListings ?? 0);
      return depth(b) - depth(a);
    }),
    [sets],
  );
  const maximum = Math.max(
    1,
    ...sets.flatMap((set) => [
      set.sources.ebay?.latest?.activeListings ?? 0,
      set.sources.cardtrader?.latest?.activeListings ?? 0,
    ]),
  );

  return (
    <section aria-labelledby="market-map-title" className="rounded-2xl bg-ink-850 ring-1 ring-ink-700/70">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink-700/70 px-5 py-5 sm:px-6">
        <div>
          <p className="m-0 text-[0.72rem] font-semibold uppercase tracking-[0.15em] text-accent">Vue d&apos;ensemble</p>
          <h2 id="market-map-title" className="display m-0 mt-2 text-[1.35rem] text-mist-050">
            Où le carnet est-il le plus profond&nbsp;?
          </h2>
          <p className="m-0 mt-2 text-[0.8rem] text-mist-500">
            Annonces actives au dernier crawl complet · cliquez une ligne pour lire ses flux.
          </p>
        </div>
        <div className="flex items-center gap-4 text-[0.75rem] text-mist-300" aria-label="Légende">
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#3987e5]" />eBay.fr</span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#c98500]" />CardTrader</span>
        </div>
      </div>

      <div className="max-h-[510px] overflow-y-auto p-2 sm:p-3">
        {ordered.map((set) => {
          const ebay = set.sources.ebay?.latest?.activeListings ?? 0;
          const cardtrader = set.sources.cardtrader?.latest?.activeListings ?? 0;
          const active = set.id === activeId;
          return (
            <button
              key={set.id}
              type="button"
              onClick={() => onSelect(set.id)}
              aria-pressed={active}
              className={`grid w-full grid-cols-[minmax(7rem,0.82fr)_minmax(0,1.5fr)] items-center gap-2 rounded-xl px-2.5 py-2.5 text-left transition-colors sm:grid-cols-[minmax(12rem,0.75fr)_minmax(18rem,2fr)] sm:gap-4 sm:px-3 ${
                active ? "bg-ink-700/80 ring-1 ring-accent/70" : "hover:bg-ink-800"
              }`}
            >
              <span>
                <strong className="block truncate text-[0.84rem] font-medium text-mist-050">{set.name}</strong>
                <span className="block truncate text-[0.68rem] text-mist-500">{set.era}</span>
              </span>
              <span className="grid gap-1.5">
                {([
                  ["eBay", ebay, EBAY],
                  ["CT", cardtrader, CARDTRADER],
                ] as const).map(([label, value, color]) => (
                  <span key={label} className="grid grid-cols-[1.7rem_minmax(0,1fr)_1.45rem] items-center gap-1.5 sm:grid-cols-[2.2rem_minmax(0,1fr)_2rem] sm:gap-2">
                    <span className="text-[0.65rem] text-mist-500">{label}</span>
                    <span className="h-2 overflow-hidden rounded-sm bg-ink-600">
                      <span
                        className="block h-full rounded-sm"
                        style={{ width: `${(value / maximum) * 100}%`, background: color }}
                        title={`${set.name} · ${sourceName(label === "eBay" ? "ebay" : "cardtrader")} : ${value} annonces actives`}
                      />
                    </span>
                    <span className="tabular text-right text-[0.72rem] text-mist-100">{value}</span>
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SourceButton({
  source,
  series,
  active,
  onClick,
}: {
  source: "ebay" | "cardtrader";
  series: PressureSourceSeries | null;
  active: boolean;
  onClick: () => void;
}) {
  const latest = series?.latest;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!series}
      aria-pressed={active}
      className={`min-w-0 rounded-xl border px-4 py-3 text-left transition-colors ${
        active ? "border-accent bg-accent-soft/45" : "border-ink-600 bg-ink-850 hover:border-ink-500"
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      <span className="flex items-center justify-between gap-3">
        <strong className="text-[0.86rem] font-medium text-mist-050">{sourceName(source)}</strong>
        {series && <span className="text-[0.65rem] uppercase tracking-wider text-mist-500">{languageLabel(series.language)}</span>}
      </span>
      <span className="mt-2 grid grid-cols-2 gap-3">
        <span><b className="tabular block text-[1.15rem] font-semibold text-mist-050">{latest?.activeListings ?? "—"}</b><small className="text-[0.68rem] text-mist-500">annonces</small></span>
        <span><b className="tabular block text-[1.15rem] font-semibold text-mist-050">{latest?.floor10 != null ? eur.format(latest.floor10) : "—"}</b><small className="text-[0.68rem] text-mist-500">p10 demandé</small></span>
      </span>
    </button>
  );
}

function FlowBalance({ series }: { series: PressureSourceSeries }) {
  const flow = series.latest?.flowFromPrevious;
  if (!flow) {
    return <p className="m-0 rounded-xl border border-dashed border-ink-600 px-4 py-8 text-[0.82rem] text-mist-500">Une seconde journée complète est nécessaire pour comparer les flux.</p>;
  }
  const max = Math.max(1, flow.adjustedExits, flow.adjustedNewListings);
  return (
    <div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-ink-600">
        <div className="bg-ink-850 px-4 py-4 text-right">
          <p className="m-0 text-[0.68rem] uppercase tracking-wider text-mist-500">Sorties ajustées</p>
          <p className="tabular m-0 mt-1 text-[1.5rem] font-semibold text-mist-050">{flow.adjustedExits}</p>
          <div className="mt-3 flex h-2 justify-end rounded-l bg-ink-700">
            <span className="h-full rounded-l bg-mist-300" style={{ width: `${(flow.adjustedExits / max) * 100}%` }} />
          </div>
        </div>
        <div className="bg-ink-850 px-4 py-4 text-left">
          <p className="m-0 text-[0.68rem] uppercase tracking-wider text-mist-500">Nouvelles annonces</p>
          <p className="tabular m-0 mt-1 text-[1.5rem] font-semibold text-mist-050">{flow.adjustedNewListings}</p>
          <div className="mt-3 h-2 rounded-r bg-ink-700">
            <span className="block h-full rounded-r bg-accent" style={{ width: `${(flow.adjustedNewListings / max) * 100}%` }} />
          </div>
        </div>
      </div>
      <p className="m-0 mt-2 text-center text-[0.72rem] text-mist-500">
        {shortDate(flow.from)} → {shortDate(flow.to)} · {flow.likelyRelists} remise{flow.likelyRelists > 1 ? "s" : ""} en ligne probable{flow.likelyRelists > 1 ? "s" : ""} neutralisée{flow.likelyRelists > 1 ? "s" : ""}
      </p>
    </div>
  );
}

function TrendChart({
  title,
  subtitle,
  history,
  valueOf,
  format,
  color,
}: {
  title: string;
  subtitle: string;
  history: PressureSnapshot[];
  valueOf: (snapshot: PressureSnapshot) => number | null;
  format: (value: number) => string;
  color: string;
}) {
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const points = history.map((row) => ({ date: row.date, value: valueOf(row) })).filter((row): row is { date: string; value: number } => row.value != null);
  const width = 520;
  const height = 190;
  const pad = { left: 18, right: 18, top: 28, bottom: 36 };
  if (points.length < 2) {
    return (
      <section className="rounded-xl bg-ink-850 p-4 ring-1 ring-ink-700/70">
        <h3 className="m-0 text-[0.9rem] font-medium text-mist-050">{title}</h3>
        <p className="m-0 mt-1 text-[0.74rem] text-mist-500">{subtitle}</p>
        <p className="m-0 mt-8 border-t border-dashed border-ink-600 pt-5 text-[0.78rem] text-mist-500">Pas encore deux observations comparables.</p>
      </section>
    );
  }
  const values = points.map((point) => point.value);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (lo === hi) { lo -= Math.max(1, lo * 0.03); hi += Math.max(1, hi * 0.03); }
  const margin = (hi - lo) * 0.18;
  lo -= margin;
  hi += margin;
  const times = points.map((point) => parseDate(point.date));
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const x = (value: number) => pad.left + ((value - minTime) / Math.max(1, maxTime - minTime)) * (width - pad.left - pad.right);
  const y = (value: number) => pad.top + ((hi - value) / (hi - lo)) * (height - pad.top - pad.bottom);
  const path = points.map((point, index) => `${index ? "L" : "M"}${x(parseDate(point.date)).toFixed(1)} ${y(point.value).toFixed(1)}`).join(" ");
  const sparse = points.length < 8;
  return (
    <section className="rounded-xl bg-ink-850 p-4 ring-1 ring-ink-700/70">
      <h3 className="m-0 text-[0.9rem] font-medium text-mist-050">{title}</h3>
      <p className="m-0 mt-1 text-[0.74rem] text-mist-500">{subtitle}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 block h-auto w-full" role="img" aria-label={`${title}, ${points.length} observations`} onPointerLeave={() => setHoveredDate(null)}>
        <line x1={pad.left} x2={width - pad.right} y1={height - pad.bottom} y2={height - pad.bottom} stroke={GRID} />
        <line x1={pad.left} x2={width - pad.right} y1={pad.top} y2={pad.top} stroke={GRID} />
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {hoveredDate && (() => {
          const hovered = points.find((point) => point.date === hoveredDate);
          return hovered ? (
            <text x={width - pad.right} y="16" textAnchor="end" fill={INK} fontSize="12" fontWeight="600">
              {shortDate(hovered.date)} · {format(hovered.value)}
            </text>
          ) : null;
        })()}
        {points.map((point, index) => (
          <g key={point.date}>
            <circle
              cx={x(parseDate(point.date))}
              cy={y(point.value)}
              r={hoveredDate === point.date ? "7" : "5"}
              fill={color}
              stroke="#12141a"
              strokeWidth="2"
              onPointerEnter={() => setHoveredDate(point.date)}
              aria-label={`${shortDate(point.date)} · ${format(point.value)}`}
            />
            {(points.length <= 3 || index === 0 || index === points.length - 1) && (
              <text x={x(parseDate(point.date))} y={y(point.value) - 11} textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"} fill={INK} fontSize="12">
                {format(point.value)}
              </text>
            )}
            {(index === 0 || index === points.length - 1) && (
              <text x={x(parseDate(point.date))} y={height - 13} textAnchor={index === 0 ? "start" : "end"} fill={MUTED} fontSize="11">
                {shortDate(point.date)}
              </text>
            )}
          </g>
        ))}
      </svg>
      <p className="m-0 mt-1 text-[0.68rem] text-mist-500">
        {sparse ? `${points.length} observations discrètes — direction visible, pas encore une tendance.` : "Échelle verticale resserrée ; valeurs exactes au survol."}
      </p>
    </section>
  );
}

function Detail({ set }: { set: MarketPressureSet }) {
  const firstAvailable = set.sources.ebay ? "ebay" : "cardtrader";
  const [source, setSource] = useState<"ebay" | "cardtrader">(firstAvailable);
  const series = set.sources[source] ?? set.sources.ebay ?? set.sources.cardtrader;
  if (!series) return null;
  const latest = series.latest;
  const flow = latest?.flowFromPrevious;
  const sourceColor = series.source === "ebay" ? EBAY : CARDTRADER;

  return (
    <section aria-labelledby="set-detail-title" className="mt-6">
      <div className="grid gap-5 border-b border-ink-700/70 pb-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
        <div>
          <p className="m-0 text-[0.72rem] font-semibold uppercase tracking-[0.15em] text-mist-500">Set analysé</p>
          <h2 id="set-detail-title" className="display m-0 mt-2 text-[clamp(1.6rem,3vw,2.2rem)] text-mist-050">{set.name}</h2>
          <p className="m-0 mt-2 text-[0.82rem] text-mist-500">{set.era} · sources lues séparément, jamais additionnées.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <SourceButton source="ebay" series={set.sources.ebay} active={series.source === "ebay"} onClick={() => setSource("ebay")} />
          <SourceButton source="cardtrader" series={set.sources.cardtrader} active={series.source === "cardtrader"} onClick={() => setSource("cardtrader")} />
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Annonces actives", latest ? integer.format(latest.activeListings) : "—", flow ? `${formatDelta(flow.stockChange, "number")} depuis le relevé précédent` : "stock observable"],
          ["Vendeurs distincts", latest ? integer.format(latest.sellers) : "—", latest ? `${pct.format(latest.sellerIdentityCoverage)} des annonces identifiées` : "identité disponible"],
          ["Prix bas robuste", latest?.floor10 != null ? eur.format(latest.floor10) : "—", flow ? `${formatDelta(flow.floor10ChangePct)} depuis le relevé précédent` : "p10 par vendeur"],
          ["Profondeur à +10 %", latest ? integer.format(latest.depth10Listings) : "—", "annonces proches du meilleur prix"],
        ].map(([label, value, note]) => (
          <div key={label} className="rounded-xl bg-ink-850 p-4 ring-1 ring-ink-700/70">
            <p className="m-0 text-[0.68rem] uppercase tracking-wider text-mist-500">{label}</p>
            <p className="tabular m-0 mt-1.5 text-[1.45rem] font-semibold text-mist-050">{value}</p>
            <p className="m-0 mt-1 text-[0.7rem] text-mist-500">{note}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <section className="rounded-2xl bg-ink-850 p-5 ring-1 ring-ink-700/70">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="display m-0 text-[1.05rem] text-mist-050">Le carnet se remplit-il ou se vide-t-il&nbsp;?</h3>
              <p className="m-0 mt-1 text-[0.75rem] text-mist-500">Flux d&apos;identifiants, remises en ligne neutralisées.</p>
            </div>
            <span className="rounded-full bg-ink-700 px-2.5 py-1 text-[0.68rem] text-mist-300">sortie ≠ vente</span>
          </div>
          <FlowBalance series={series} />
          {series.source === "cardtrader" && flow && (
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-ink-700/70 pt-4">
              <div><b className="tabular block text-[1.05rem] text-mist-050">{flow.knownOutflowUnits}</b><span className="text-[0.7rem] text-mist-500">unités sorties / baissées</span></div>
              <div><b className="tabular block text-[1.05rem] text-mist-050">{flow.knownInflowUnits}</b><span className="text-[0.7rem] text-mist-500">unités entrées / restockées</span></div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-ink-600 bg-ink-900 p-5">
          <p className="m-0 text-[0.68rem] uppercase tracking-[0.14em] text-mist-500">Verdict du moteur</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-3">
            <h3 className="display m-0 text-[1.35rem] text-mist-050">{series.verdict.label}</h3>
            <span className="text-[0.74rem] text-mist-500">{series.verdict.reason}</span>
          </div>
          <Readiness current={series.coverage.completeDays} minimum={series.coverage.minimumDaysForVerdict} />
          <p className="m-0 mt-4 text-[0.78rem] leading-relaxed text-mist-500">
            À partir de 14 journées complètes, le verdict exigera la convergence de trois faits&nbsp;: flux ajusté, variation du stock et variation du p10. Un seul signal ne suffira pas.
          </p>
        </section>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <TrendChart
          title="Prix bas robuste dans le temps"
          subtitle={`${sourceName(series.source)} · p10 des demandes, un prix plancher par vendeur`}
          history={series.history}
          valueOf={(snapshot) => snapshot.floor10}
          format={(value) => eur.format(value)}
          color={sourceColor}
        />
        <TrendChart
          title="Stock visible dans le temps"
          subtitle={`${sourceName(series.source)} · nombre d'annonces actives dans les crawls complets`}
          history={series.history}
          valueOf={(snapshot) => snapshot.activeListings}
          format={(value) => integer.format(value)}
          color={sourceColor}
        />
      </div>

      <details className="mt-6 rounded-2xl border border-ink-600 p-5 [&[open]>summary]:mb-5">
        <summary className="cursor-pointer text-[0.86rem] font-medium text-mist-100 marker:text-mist-500">Volume de l&apos;étude et traçabilité</summary>
        <div className="grid gap-4 text-[0.8rem] leading-relaxed text-mist-300 sm:grid-cols-2 lg:grid-cols-4">
          <div><span className="block text-[0.68rem] uppercase tracking-wider text-mist-500">Source</span>{sourceName(series.source)} · {languageLabel(series.language)}</div>
          <div><span className="block text-[0.68rem] uppercase tracking-wider text-mist-500">Fenêtre</span>{series.coverage.firstDate ?? "—"} → {series.coverage.lastDate ?? "—"}</div>
          <div><span className="block text-[0.68rem] uppercase tracking-wider text-mist-500">Dernier crawl</span>{latest?.crawl.captured ?? "—"} capturées · {latest?.crawl.pages ?? "—"} page(s) · complet</div>
          <div><span className="block text-[0.68rem] uppercase tracking-wider text-mist-500">Quantités</span>{latest ? pct.format(latest.quantityCoverage) : "—"} des annonces renseignées</div>
        </div>
      </details>
    </section>
  );
}

export default function MarketPressure({ data }: { data: MarketPressureData }) {
  const initial = useMemo(
    () => [...data.sets].sort((a, b) => {
      const depth = (set: MarketPressureSet) => (set.sources.ebay?.latest?.activeListings ?? 0) + (set.sources.cardtrader?.latest?.activeListings ?? 0);
      return depth(b) - depth(a);
    })[0]?.id ?? data.sets[0]?.id,
    [data.sets],
  );
  const [activeId, setActiveId] = useState(initial);
  const active = data.sets.find((set) => set.id === activeId) ?? data.sets[0];
  const ebayListings = data.sets.reduce((sum, set) => sum + (set.sources.ebay?.latest?.activeListings ?? 0), 0);
  const cardTraderListings = data.sets.reduce((sum, set) => sum + (set.sources.cardtrader?.latest?.activeListings ?? 0), 0);

  return (
    <>
      <section className="grid gap-8 py-10 lg:grid-cols-[1.25fr_0.75fr] lg:items-end lg:gap-14">
        <div>
          <p className="m-0 text-[0.76rem] uppercase tracking-[0.15em] text-accent">Pression du carnet · bêta</p>
          <h1 className="display m-0 mt-3 max-w-[18ch] text-[clamp(2rem,4.5vw,3.25rem)] text-mist-050">Qui prend le dessus&nbsp;: l&apos;offre ou la demande&nbsp;?</h1>
          <p className="prose-measure m-0 mt-5 text-[0.98rem] leading-relaxed text-mist-300">
            Pour l&apos;instant, le radar montre le stock visible, le prix et les flux d&apos;annonces. Il ne prétend pas compter les acheteurs&nbsp;: cette donnée n&apos;est pas exposée par les marketplaces.
          </p>
        </div>
        <aside className="rounded-2xl bg-ink-850 p-5 ring-1 ring-ink-700/70">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-[0.72rem] uppercase tracking-wider text-mist-500">État de la preuve</span>
            <span className="tabular text-[1.45rem] font-semibold text-mist-050">{data.readiness.completeDaysMax}/{data.readiness.minimumDaysForVerdict}</span>
          </div>
          <p className="m-0 mt-2 text-[0.84rem] font-medium text-mist-100">Pas encore de verdict directionnel.</p>
          <Readiness current={data.readiness.completeDaysMax} minimum={data.readiness.minimumDaysForVerdict} />
        </aside>
      </section>

      <section className="mb-6 grid gap-3 sm:grid-cols-2">
        <div className="flex items-center justify-between rounded-xl border border-ink-700 bg-ink-850 px-4 py-3">
          <span><strong className="block text-[0.84rem] font-medium text-mist-050">eBay.fr</strong><small className="text-[0.68rem] text-mist-500">carnet français observé</small></span>
          <b className="tabular text-[1.35rem] font-semibold text-[#75aff2]">{integer.format(ebayListings)}</b>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-ink-700 bg-ink-850 px-4 py-3">
          <span><strong className="block text-[0.84rem] font-medium text-mist-050">CardTrader</strong><small className="text-[0.68rem] text-mist-500">langue cotée par set</small></span>
          <b className="tabular text-[1.35rem] font-semibold text-[#d7a447]">{integer.format(cardTraderListings)}</b>
        </div>
      </section>

      <MarketOverview sets={data.sets} activeId={active.id} onSelect={setActiveId} />
      <Detail key={active.id} set={active} />

      <section className="mt-10 border-t border-ink-700/70 pt-7">
        <h2 className="display m-0 text-[1.15rem] text-mist-050">Ce que le radar mesure — et ce qu&apos;il refuse d&apos;inventer</h2>
        <div className="mt-4 grid gap-4 text-[0.82rem] leading-relaxed text-mist-300 md:grid-cols-3">
          <p className="m-0"><strong className="font-medium text-mist-050">Mesuré.</strong> Annonces actives, vendeurs, prix demandés, profondeur près du plancher, entrées, sorties et variations de quantité quand elles existent.</p>
          <p className="m-0"><strong className="font-medium text-mist-050">Interprété avec prudence.</strong> Une sortie d&apos;annonce est un signal de retrait du carnet, jamais une vente certaine. Les remises en ligne probables sont neutralisées.</p>
          <p className="m-0"><strong className="font-medium text-mist-050">Non disponible.</strong> Nombre d&apos;acheteurs, ventes conclues et double-publication entre marketplaces. eBay et CardTrader restent donc séparés.</p>
        </div>
        <p className="m-0 mt-5 text-[0.7rem] text-mist-500">Modèle {data.modelVersion} · relevé au {data.asOf ?? "—"} · prix demandés hors frais de port · journées UTC complètes uniquement.</p>
      </section>
    </>
  );
}
