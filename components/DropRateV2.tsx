"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { DropV2Card, DropV2Data, DropV2Set } from "@/lib/drop-v2-types";

const GREEN = "#176b5b";
const GREEN_LIGHT = "#cfe1d9";
const AMBER = "#b87516";
const AMBER_LIGHT = "#ead8b7";
const INK = "#1d2521";
const MUTED = "#69716d";
const GRID = "#d3cfc3";
const PAPER = "#f2efe7";

const eur = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const pctFormatter = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });
const pct = (value: number) => pctFormatter.format(value);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function retained(set: DropV2Set) {
  return set.boosterPrice > 0 ? set.netCentralMid / set.boosterPrice : 0;
}

function confidenceCopy(set: DropV2Set) {
  if (set.confidence === "élevée") return "Prix actuels et taux assez solides pour comparer ce set.";
  if (set.confidence === "moyenne") return "Lecture utile, mais une part de l’EV reste ancrée sur l’historique.";
  return "Ordre de grandeur : couverture, profondeur de marché ou taux encore fragiles.";
}

function confidenceTone(confidence: DropV2Set["confidence"]) {
  if (confidence === "élevée") return "bg-[#dcebe4] text-[#165846]";
  if (confidence === "moyenne") return "bg-[#eee1c8] text-[#725716]";
  return "bg-[#e8e5dd] text-[#59615d]";
}

function activateOnKeyboard(event: KeyboardEvent, callback: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    callback();
  }
}

function Marker({ set, x, y, active }: { set: DropV2Set; x: number; y: number; active: boolean }) {
  const common = { strokeWidth: active ? 2.5 : 1.8 };
  const fill = set.confidence === "élevée" ? GREEN : set.confidence === "moyenne" ? AMBER_LIGHT : PAPER;
  const stroke = set.confidence === "élevée" ? GREEN : set.confidence === "moyenne" ? AMBER : MUTED;

  return (
    <>
      {active ? <circle cx={x} cy={y} r="12" fill="none" stroke={INK} strokeWidth="2" /> : null}
      {set.partialNote ? (
        <circle cx={x} cy={y} r="9.5" fill="none" stroke={AMBER} strokeWidth="1.2" strokeDasharray="2.5 2.5" />
      ) : null}
      {set.confidence === "élevée" ? (
        <circle cx={x} cy={y} r="6" fill={fill} stroke={stroke} {...common} />
      ) : set.confidence === "moyenne" ? (
        <rect x={x - 5.5} y={y - 5.5} width="11" height="11" fill={fill} stroke={stroke} {...common} />
      ) : (
        <path d={`M ${x} ${y - 6.5} L ${x + 6.5} ${y} L ${x} ${y + 6.5} L ${x - 6.5} ${y} Z`} fill={fill} stroke={stroke} {...common} />
      )}
    </>
  );
}

function DecisionMap({
  data,
  active,
  onSelect,
}: {
  data: DropV2Data;
  active: DropV2Set;
  onSelect: (id: string) => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const width = 980;
  const height = 390;
  const margin = { left: 62, right: 30, top: 25, bottom: 58 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const xMax = Math.max(0.5, Math.ceil(Math.max(...data.sets.map(retained)) * 10) / 10);
  const x = (value: number) => margin.left + (clamp(value, 0, xMax) / xMax) * plotWidth;
  const y = (value: number) => margin.top + (1 - clamp(value, 0, 1)) * plotHeight;
  const xTicks = Array.from({ length: 6 }, (_, index) => (xMax * index) / 5);
  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const hovered = data.sets.find((set) => set.id === hoveredId) ?? null;
  const hoveredX = hovered ? x(retained(hovered)) : 0;
  const hoveredY = hovered ? y(hovered.coverage) : 0;
  const activeX = x(retained(active));
  const orderedSets = [...data.sets].sort(
    (first, second) => Number(first.id === active.id) - Number(second.id === active.id),
  );
  const paretoIds = new Set(
    data.sets
      .filter(
        (candidate) =>
          !data.sets.some(
            (other) =>
              other.id !== candidate.id &&
              retained(other) >= retained(candidate) &&
              other.coverage >= candidate.coverage &&
              (retained(other) > retained(candidate) || other.coverage > candidate.coverage),
          ),
      )
      .map((set) => set.id),
  );
  const labelPriority = (set: DropV2Set) =>
    (set.id === active.id ? 100 : 0) +
    (set.confidence === "élevée" ? 80 : set.confidence === "moyenne" ? 55 : 0) +
    (paretoIds.has(set.id) ? 70 : 0) +
    (set.coverage >= 0.7 ? 45 : 0) +
    (retained(set) >= 0.25 ? 25 : 0);
  const labelCandidates = data.sets
    .filter(
      (set) =>
        set.id === active.id ||
        set.confidence !== "faible" ||
        paretoIds.has(set.id) ||
        set.coverage >= 0.7 ||
        retained(set) >= 0.25,
    )
    .sort((first, second) => labelPriority(second) - labelPriority(first));
  const occupied: Array<{ left: number; right: number; top: number; bottom: number }> = [];
  const allPointBoxes = data.sets.map((set) => {
    const pointX = x(retained(set));
    const pointY = y(set.coverage);
    return { id: set.id, left: pointX - 9, right: pointX + 9, top: pointY - 9, bottom: pointY + 9 };
  });
  const intersects = (
    first: { left: number; right: number; top: number; bottom: number },
    second: { left: number; right: number; top: number; bottom: number },
    padding = 3,
  ) =>
    first.left < second.right + padding &&
    first.right > second.left - padding &&
    first.top < second.bottom + padding &&
    first.bottom > second.top - padding;
  const alternatives: Array<{ dx: number; dy: number; anchor: "start" | "middle" | "end" }> = [
    { dx: 14, dy: -14, anchor: "start" },
    { dx: -14, dy: -14, anchor: "end" },
    { dx: 14, dy: 25, anchor: "start" },
    { dx: -14, dy: 25, anchor: "end" },
    { dx: 0, dy: -27, anchor: "middle" },
    { dx: 0, dy: 34, anchor: "middle" },
    { dx: 28, dy: 5, anchor: "start" },
    { dx: -28, dy: 5, anchor: "end" },
    { dx: 30, dy: -34, anchor: "start" },
    { dx: -30, dy: -34, anchor: "end" },
    { dx: 30, dy: 42, anchor: "start" },
    { dx: -30, dy: 42, anchor: "end" },
  ];
  const directLabels = labelCandidates.map((set) => {
    const pointX = x(retained(set));
    const pointY = y(set.coverage);
    const labelWidth = clamp(set.name.length * 6.4 + 10, 48, 158);
    const labelHeight = 17;
    const placement = alternatives.find((alternative) => {
      const textX = pointX + alternative.dx;
      const textY = pointY + alternative.dy;
      const left = alternative.anchor === "start" ? textX : alternative.anchor === "end" ? textX - labelWidth : textX - labelWidth / 2;
      const box = { left, right: left + labelWidth, top: textY - 13, bottom: textY - 13 + labelHeight };
      const inside = box.left >= margin.left + 3 && box.right <= width - margin.right - 3 && box.top >= margin.top + 2 && box.bottom <= height - margin.bottom - 2;
      const clearsLabels = occupied.every((other) => !intersects(box, other, 5));
      const clearsPoints = allPointBoxes.every((point) => point.id === set.id || !intersects(box, point, 2));
      if (inside && clearsLabels && clearsPoints) {
        occupied.push(box);
        return true;
      }
      return false;
    }) ?? alternatives[0];
    return {
      set,
      pointX,
      pointY,
      textX: pointX + placement.dx,
      textY: pointY + placement.dy,
      anchor: placement.anchor,
    };
  });
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || scroller.scrollWidth <= scroller.clientWidth) return;
    const activePixel = (activeX / width) * scroller.scrollWidth;
    scroller.scrollTo({ left: Math.max(0, activePixel - scroller.clientWidth / 2), behavior: "smooth" });
  }, [active.id, activeX]);
  return (
    <section aria-labelledby="decision-title" className="border-b border-[#d3cfc3] pb-10 pt-8 sm:pb-12 sm:pt-10">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
        <div>
          <p className="m-0 text-[0.72rem] font-semibold uppercase tracking-[0.15em] text-[#176b5b]">Vue de décision</p>
          <h2 id="decision-title" className="m-0 mt-2 max-w-[28ch] text-[clamp(1.65rem,3vw,2.45rem)] font-semibold leading-[1.05] tracking-[-0.045em]">
            Quels sets combinent valeur conservée et preuve suffisante&nbsp;?
          </h2>
        </div>
        <p className="m-0 text-[0.86rem] leading-6 text-[#59615d]">
          Plus un point est haut et à droite, plus l’estimation est couverte et le contenu valorisé. Les candidats qui changent la décision sont nommés directement.
        </p>
      </div>

      <div ref={scrollerRef} className="mt-7 overflow-x-auto border-y border-[#d3cfc3] bg-[#f7f4ed]">
        <div className="relative min-w-[760px]">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="block h-auto w-full"
            role="img"
            aria-label={`Carte de décision de ${data.sets.length} sets. Axe horizontal : valeur nette conservée. Axe vertical : part de l’EV repricée en EX+.`}
          >
            <title>Valeur conservée et couverture EX+ par set</title>
            {yTicks.map((tick) => (
              <g key={`y-${tick}`}>
                <line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} stroke={GRID} strokeWidth="1" />
                <text x={margin.left - 12} y={y(tick) + 4} textAnchor="end" fill={MUTED} fontSize="12">{pct(tick)}</text>
              </g>
            ))}
            {xTicks.map((tick) => (
              <g key={`x-${tick}`}>
                <line x1={x(tick)} x2={x(tick)} y1={margin.top} y2={height - margin.bottom} stroke={GRID} strokeWidth="1" />
                <text x={x(tick)} y={height - 30} textAnchor="middle" fill={MUTED} fontSize="12">{pct(tick)}</text>
              </g>
            ))}
            <text x={margin.left + plotWidth / 2} y={height - 7} textAnchor="middle" fill={INK} fontSize="12" fontWeight="600">
              Valeur nette conservée / prix du booster →
            </text>
            <text transform={`translate(15 ${margin.top + plotHeight / 2}) rotate(-90)`} textAnchor="middle" fill={INK} fontSize="12" fontWeight="600">
              EV repricée en EX+ →
            </text>

            {orderedSets.map((set) => {
              const pointX = x(retained(set));
              const pointY = y(set.coverage);
              return (
                <g
                  key={set.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${set.name}, ${pct(retained(set))} de valeur conservée, ${pct(set.coverage)} d’EV repricée, confiance ${set.confidence}`}
                  className="cursor-pointer outline-none"
                  onClick={() => onSelect(set.id)}
                  onKeyDown={(event) => activateOnKeyboard(event, () => onSelect(set.id))}
                  onMouseEnter={() => setHoveredId(set.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onFocus={() => setHoveredId(set.id)}
                  onBlur={() => setHoveredId(null)}
                >
                  <Marker set={set} x={pointX} y={pointY} active={set.id === active.id} />
                </g>
              );
            })}
            {directLabels.map(({ set, pointX, pointY, textX, textY, anchor }) => (
              <g key={`label-${set.id}`} pointerEvents="none">
                <line
                  x1={pointX}
                  y1={pointY}
                  x2={textX + (anchor === "start" ? -4 : anchor === "end" ? 4 : 0)}
                  y2={textY - 4}
                  stroke={set.id === active.id ? INK : "#9a9d97"}
                  strokeWidth={set.id === active.id ? 1.3 : 0.9}
                />
                <text
                  x={textX}
                  y={textY}
                  textAnchor={anchor}
                  fill={set.confidence === "faible" && set.id !== active.id ? "#535b57" : INK}
                  fontSize={set.id === active.id ? 13 : 11.5}
                  fontWeight={set.id === active.id || set.confidence !== "faible" ? 700 : 600}
                  paintOrder="stroke"
                  stroke="#f7f4ed"
                  strokeWidth="4"
                  strokeLinejoin="round"
                >
                  {set.name}
                </text>
              </g>
            ))}
          </svg>

          {hovered ? (
            <div
              role="tooltip"
              className="pointer-events-none absolute z-10 w-[17rem] border border-[#b9b5aa] bg-[#fffdf8] p-3 text-[#1d2521] shadow-[0_12px_28px_rgba(29,37,33,0.14)]"
              style={{
                left: `${(hoveredX / width) * 100}%`,
                top: `${(hoveredY / height) * 100}%`,
                transform: `${hoveredX > width * 0.72 ? "translateX(-100%)" : "translateX(10px)"} ${hoveredY < 95 ? "translateY(12px)" : "translateY(-105%)"}`,
              }}
            >
              <strong className="block text-[0.9rem]">{hovered.name}</strong>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[0.76rem] text-[#59615d]">
                <span>Valeur conservée</span><b className="text-right text-[#1d2521]">{pct(retained(hovered))}</b>
                <span>EV repricée</span><b className="text-right text-[#1d2521]">{pct(hovered.coverage)}</b>
                <span>EV nette</span><b className="text-right text-[#1d2521]">{eur.format(hovered.netCentralMid)}</b>
                <span>Confiance</span><b className="text-right text-[#1d2521]">{hovered.confidence}</b>
              </div>
              {hovered.partialNote ? <p className="m-0 mt-2 border-t border-[#ddd9cf] pt-2 text-[0.72rem] leading-5 text-[#8a5a16]">Périmètre structurel incomplet</p> : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[0.72rem] text-[#59615d]">
        <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#176b5b]" /> confiance élevée</span>
        <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 bg-[#d8b878]" /> confiance moyenne</span>
        <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rotate-45 border border-[#69716d] bg-[#f2efe7]" /> confiance faible</span>
        <span className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded-full border border-dashed border-[#b87516]" /> omission structurelle documentée</span>
      </div>
    </section>
  );
}

function ScenarioScale({ set }: { set: DropV2Set }) {
  const width = 920;
  const height = 108;
  const left = 18;
  const right = 18;
  const plot = width - left - right;
  const scaleMax = Math.max(set.boosterPrice, set.grossCentral, set.netCentralHi, set.netQuickHi) * 1.07;
  const x = (value: number) => left + (clamp(value, 0, scaleMax) / scaleMax) * plot;

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block h-auto w-full"
        role="img"
        aria-label={`Échelle commune : booster ${eur.format(set.boosterPrice)}, brut ${eur.format(set.grossCentral)}, net de ${eur.format(set.netCentralLo)} à ${eur.format(set.netCentralHi)}, vente rapide ${eur.format(set.netQuickMid)}.`}
      >
        <title>Prix du booster et scénarios de valeur sur une même échelle</title>
        <line x1={left} x2={width - right} y1="48" y2="48" stroke={GRID} strokeWidth="2" />
        <line x1={x(set.netCentralLo)} x2={x(set.netCentralHi)} y1="48" y2="48" stroke={GREEN_LIGHT} strokeWidth="16" />
        <line x1={x(set.netCentralMid)} x2={x(set.netCentralMid)} y1="33" y2="63" stroke={GREEN} strokeWidth="3" />
        <path d={`M ${x(set.netQuickMid)} 40 L ${x(set.netQuickMid) + 8} 48 L ${x(set.netQuickMid)} 56 L ${x(set.netQuickMid) - 8} 48 Z`} fill={AMBER} />
        <line x1={x(set.grossCentral)} x2={x(set.grossCentral)} y1="23" y2="73" stroke={MUTED} strokeWidth="2" />
        <line x1={x(set.boosterPrice)} x2={x(set.boosterPrice)} y1="15" y2="79" stroke={INK} strokeWidth="3" />
        <text x={left} y="98" fill={MUTED} fontSize="12">0 €</text>
        <text x={x(set.boosterPrice)} y="98" textAnchor="middle" fill={INK} fontSize="12" fontWeight="700">prix du booster</text>
      </svg>
      <div className="grid gap-x-5 gap-y-3 border-t border-[#d3cfc3] pt-4 sm:grid-cols-2 xl:grid-cols-4">
        <div><span className="block text-[0.68rem] uppercase tracking-[0.1em] text-[#69716d]">Booster</span><b className="mt-1 block text-[1.15rem] tabular-nums">{eur.format(set.boosterPrice)}</b></div>
        <div><span className="block text-[0.68rem] uppercase tracking-[0.1em] text-[#69716d]">Brut EX+</span><b className="mt-1 block text-[1.15rem] text-[#59615d] tabular-nums">{eur.format(set.grossCentral)}</b></div>
        <div><span className="block text-[0.68rem] uppercase tracking-[0.1em] text-[#69716d]">Net vendu</span><b className="mt-1 block text-[1.15rem] text-[#176b5b] tabular-nums">{eur.format(set.netCentralMid)}</b><small className="text-[#69716d]">{eur.format(set.netCentralLo)}–{eur.format(set.netCentralHi)}</small></div>
        <div><span className="block text-[0.68rem] uppercase tracking-[0.1em] text-[#69716d]">Vente rapide</span><b className="mt-1 block text-[1.15rem] text-[#9a6114] tabular-nums">{eur.format(set.netQuickMid)}</b></div>
      </div>
    </div>
  );
}

function CoverageComposition({ set }: { set: DropV2Set }) {
  const parts = set.coverageBreakdown;
  const fallbackTracked = parts.trackedFallbackThin + parts.trackedFallbackConflict + parts.trackedFallbackUnavailable;
  const crawlIssues = set.study.crawlHealth.incomplete + set.study.crawlHealth.error + set.study.crawlHealth.missing;

  return (
    <aside className="self-start bg-[#e5ebe6] px-5 py-5 lg:mt-1">
      <div className="flex items-center justify-between gap-4">
        <p className="m-0 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#53615b]">Solidité de la lecture</p>
        <span className={`px-2.5 py-1 text-[0.7rem] font-semibold ${confidenceTone(set.confidence)}`}>{set.confidence}</span>
      </div>
      <p className="m-0 mt-3 text-[0.84rem] leading-6 text-[#405049]">{confidenceCopy(set)}</p>

      <div className="mt-6" aria-label={`Composition de la couverture : ${pct(parts.repriced)} repricée, ${pct(fallbackTracked)} suivie sur fallback, ${pct(parts.untracked)} non suivie.`}>
        <div className="flex items-end justify-between gap-4">
          <span className="text-[0.76rem] text-[#53615b]">Composition de l’EV</span>
          <strong className="text-[1.08rem] tabular-nums">{pct(set.coverage)} actuelle</strong>
        </div>
        <div className="mt-2 flex h-4 overflow-hidden border border-[#aeb9b1] bg-[#f2efe7]">
          <span title="Repricée en EX+" className="h-full bg-[#176b5b]" style={{ width: `${parts.repriced * 100}%` }} />
          <span title="Marché trop mince" className="h-full bg-[#aeb9b1]" style={{ width: `${parts.trackedFallbackThin * 100}%` }} />
          <span
            title="Conflit avec l’ancre"
            className="h-full"
            style={{ width: `${parts.trackedFallbackConflict * 100}%`, background: "repeating-linear-gradient(135deg, #b87516 0 3px, #ead8b7 3px 6px)" }}
          />
          <span
            title="Pas de marché frais exploitable"
            className="h-full"
            style={{ width: `${parts.trackedFallbackUnavailable * 100}%`, background: "repeating-linear-gradient(135deg, #c8c4ba 0 2px, #e7e3da 2px 6px)" }}
          />
          <span title="Queue d’EV volontairement non suivie" className="h-full bg-[#f2efe7]" style={{ width: `${parts.untracked * 100}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[0.7rem] leading-5 text-[#53615b]">
          <span><i className="mr-2 inline-block h-2 w-2 bg-[#176b5b]" />EX+ actuelle {pct(parts.repriced)}</span>
          <span><i className="mr-2 inline-block h-2 w-2 bg-[#aeb9b1]" />fallback mince {pct(parts.trackedFallbackThin)}</span>
          <span><i className="mr-2 inline-block h-2 w-2 bg-[#b87516]" />conflit {pct(parts.trackedFallbackConflict)}</span>
          <span><i className="mr-2 inline-block h-2 w-2 border border-[#b9b5aa] bg-[#f2efe7]" />non suivie {pct(parts.untracked)}</span>
        </div>
      </div>

      <dl className="m-0 mt-6 grid gap-3 border-t border-[#bdc8c0] pt-5 text-[0.76rem]">
        <div className="flex justify-between gap-4"><dt className="text-[#627069]">Cartes repricées</dt><dd className="m-0 font-semibold tabular-nums">{set.study.repricedCards}/{set.study.trackedCards}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[#627069]">Offres actives observées</dt><dd className="m-0 font-semibold tabular-nums">{set.study.observedOffers}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[#627069]">Conflits bloquants</dt><dd className="m-0 font-semibold tabular-nums">{set.blockingConflicts}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[#627069]">Crawls incomplets/erreur</dt><dd className={`m-0 font-semibold tabular-nums ${crawlIssues ? "text-[#8a4b2d]" : ""}`}>{crawlIssues}</dd></div>
      </dl>
    </aside>
  );
}

function RarityDrivers({ set }: { set: DropV2Set }) {
  const rows = [...set.classes].sort((a, b) => b.centralContribution - a.centralContribution);
  const max = Math.max(...rows.flatMap((row) => [row.baselineContribution, row.centralContribution, row.quickContribution]), 0.01);
  const dominant = rows[0];
  const dominantShare = dominant ? dominant.centralContribution / Math.max(set.grossCentral, 0.01) : 0;

  return (
    <section className="border-t border-[#d3cfc3] py-12" aria-labelledby="rarity-title">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16">
        <div>
          <p className="m-0 text-[0.72rem] font-semibold uppercase tracking-[0.15em] text-[#176b5b]">Moteurs de valeur</p>
          <h2 id="rarity-title" className="m-0 mt-2 text-[1.75rem] font-semibold tracking-[-0.04em]">Quelles raretés portent l’EV&nbsp;?</h2>
          <p className="m-0 mt-3 text-[0.84rem] leading-6 text-[#59615d]">Barre verte&nbsp;: cotation actuelle. Trait gris&nbsp;: ancre historique. Losange ambre&nbsp;: vente rapide.</p>
          <div className="mt-7 grid gap-4">
            {rows.map((row) => {
              const central = (row.centralContribution / max) * 100;
              const baseline = (row.baselineContribution / max) * 100;
              const quick = (row.quickContribution / max) * 100;
              return (
                <button
                  key={row.rarity}
                  type="button"
                  className="group grid w-full grid-cols-[minmax(8rem,0.8fr)_minmax(8rem,1.2fr)_4.7rem] items-center gap-4 border-0 bg-transparent p-0 text-left text-[#1d2521]"
                  aria-label={`${row.rarity}, actuelle ${eur.format(row.centralContribution)}, historique ${eur.format(row.baselineContribution)}, vente rapide ${eur.format(row.quickContribution)}, une rareté tous les ${row.oneInAny} boosters.`}
                >
                  <span><b className="block text-[0.83rem] font-medium">{row.rarity}</b><small className="text-[0.68rem] text-[#737b76]">1/{row.oneInAny}</small></span>
                  <span className="relative block h-7">
                    <i className="absolute left-0 right-0 top-1/2 h-px bg-[#d3cfc3]" />
                    <i className="absolute left-0 top-[9px] h-2 bg-[#277565]" style={{ width: `${Math.max(1.5, central)}%` }} />
                    <i className="absolute top-[5px] h-[18px] w-[2px] bg-[#737b76]" style={{ left: `${baseline}%` }} />
                    <i className="absolute top-[8px] h-2.5 w-2.5 rotate-45 border border-[#8a5a16] bg-[#ead8b7]" style={{ left: `calc(${quick}% - 5px)` }} />
                    <span className="absolute left-1/2 top-[-28px] z-10 hidden -translate-x-1/2 whitespace-nowrap border border-[#c8c4ba] bg-[#fffdf8] px-2 py-1 text-[0.68rem] shadow-sm group-hover:block group-focus-visible:block">
                      hist. {eur.format(row.baselineContribution)} · rapide {eur.format(row.quickContribution)}
                    </span>
                  </span>
                  <strong className="text-right text-[0.82rem] tabular-nums">{eur.format(row.centralContribution)}</strong>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="self-start border-l-2 border-[#d3cfc3] pl-5 lg:mt-16">
          <p className="m-0 text-[0.7rem] uppercase tracking-[0.12em] text-[#69716d]">Lecture rapide</p>
          <p className="m-0 mt-3 text-[1.12rem] font-semibold leading-6">{dominant?.rarity ?? "La rareté dominante"} porte {pct(dominantShare)} de la cotation brute.</p>
          <p className="m-0 mt-4 text-[0.83rem] leading-6 text-[#59615d]">La comparaison avec l’ancre distingue un vrai déplacement de marché d’un simple effet de taux de drop.</p>
        </aside>
      </div>
    </section>
  );
}

function CardContributions({ set }: { set: DropV2Set }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const keyOf = (card: DropV2Card) => `${set.id}:${card.number}:${card.name}`;
  const selected = set.cards.find((card) => keyOf(card) === selectedKey) ?? set.cards[0];
  const max = Math.max(...set.cards.map((card) => card.contribution), 0.01);

  return (
    <section className="border-t border-[#d3cfc3] py-12" aria-labelledby="cards-title">
      <p className="m-0 text-[0.72rem] font-semibold uppercase tracking-[0.15em] text-[#176b5b]">Concentration de l’EV</p>
      <h2 id="cards-title" className="m-0 mt-2 text-[1.75rem] font-semibold tracking-[-0.04em]">Quelles cartes font réellement la moyenne&nbsp;?</h2>
      <p className="m-0 mt-3 max-w-[72ch] text-[0.84rem] leading-6 text-[#59615d]">Prix de la carte × chance de tirage = contribution par booster. La longueur représente uniquement cette contribution, jamais le prix seul.</p>

      {set.cards.length && selected ? (
        <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-14">
          <div className="grid gap-2">
            {set.cards.map((card) => {
              const active = keyOf(card) === keyOf(selected);
              return (
                <button
                  key={keyOf(card)}
                  type="button"
                  onMouseEnter={() => setSelectedKey(keyOf(card))}
                  onFocus={() => setSelectedKey(keyOf(card))}
                  onClick={() => setSelectedKey(keyOf(card))}
                  className={`grid grid-cols-[minmax(8rem,0.95fr)_minmax(5rem,1.05fr)_5.4rem] items-center gap-3 border-0 px-0 py-2.5 text-left text-[#1d2521] sm:gap-4 ${active ? "bg-[#e7ece7]" : "bg-transparent"}`}
                  aria-label={`${card.name}, prix ${eur.format(card.median)}, chance une sur ${card.oneIn}, contribution ${eur.format(card.contribution)} par booster`}
                >
                  <span className="min-w-0 pl-2">
                    <b className="block truncate text-[0.84rem] font-medium">{card.name}</b>
                    <small className="mt-0.5 block whitespace-nowrap text-[0.67rem] text-[#737b76]">
                      <span className="font-semibold text-[#4f5853] tabular-nums">{eur.format(card.median)}</span> la carte × 1/{card.oneIn}
                    </small>
                  </span>
                  <span className="h-2 bg-[#ddd9cf]"><i className={`block h-full ${active ? "bg-[#176b5b]" : "bg-[#79a397]"}`} style={{ width: `${Math.max(2, (card.contribution / max) * 100)}%` }} /></span>
                  <span className="pr-2 text-right">
                    <strong className="block text-[0.82rem] tabular-nums">{eur.format(card.contribution)}</strong>
                    <small className="block text-[0.62rem] text-[#737b76]">par booster</small>
                  </span>
                </button>
              );
            })}
          </div>

          <aside className="self-start border-t-2 border-[#176b5b] bg-[#f7f4ed] p-5 lg:sticky lg:top-5">
            <p className="m-0 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#69716d]">Carte observée</p>
            <h3 className="m-0 mt-2 text-[1.12rem] font-semibold leading-6">{selected.name}</h3>
            <p className="m-0 mt-1 text-[0.74rem] text-[#69716d]">#{selected.number} · {selected.rarity}</p>
            <strong className="mt-5 block text-[1.75rem] text-[#176b5b] tabular-nums">{eur.format(selected.contribution)}</strong>
            <span className="text-[0.72rem] text-[#59615d]">d’EV brute par booster · {pct(selected.contribution / Math.max(set.grossCentral, 0.01))} du total</span>
            <dl className="m-0 mt-5 grid gap-2 border-t border-[#d3cfc3] pt-4 text-[0.76rem]">
              <div className="flex justify-between gap-4"><dt className="text-[#69716d]">Médiane EX+</dt><dd className="m-0 font-semibold tabular-nums">{eur.format(selected.median)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-[#69716d]">Vente rapide</dt><dd className="m-0 font-semibold tabular-nums">{eur.format(selected.floor10)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-[#69716d]">Chance</dt><dd className="m-0 font-semibold tabular-nums">1/{selected.oneIn}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-[#69716d]">Marché</dt><dd className="m-0 font-semibold tabular-nums">{selected.offers} offres · {selected.sellers} vendeurs</dd></div>
            </dl>
            {selected.floorIndicative ? <p className="m-0 mt-4 border-l-2 border-[#b87516] pl-3 text-[0.7rem] leading-5 text-[#7b561f]">P10 indicatif : moins de 10 vendeurs.</p> : null}
          </aside>
        </div>
      ) : (
        <p className="mt-7 border-y border-[#d3cfc3] py-5 text-[0.84rem] text-[#59615d]">Aucune carte ne franchit encore le seuil de profondeur EX+.</p>
      )}
    </section>
  );
}

function EvidencePanel({ data, set }: { data: DropV2Data; set: DropV2Set }) {
  const globalConflicts = data.sets.reduce((sum, item) => sum + item.conflicts, 0);
  const globalBlocking = data.sets.reduce((sum, item) => sum + item.blockingConflicts, 0);
  const generated = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(data.generatedAt));
  const completeCrawls = set.study.crawlHealth.complete + set.study.crawlHealth.completeZero;

  return (
    <section className="border-t border-[#d3cfc3] py-10" aria-labelledby="evidence-title">
      <div className="grid gap-5 border-y border-[#d3cfc3] py-5 sm:grid-cols-2 lg:grid-cols-4">
        <div><span className="block text-[0.66rem] uppercase tracking-[0.1em] text-[#69716d]">Étude des taux</span><b className="mt-1 block text-[0.82rem]">{set.sample ?? "volume non documenté"}</b></div>
        <div><span className="block text-[0.66rem] uppercase tracking-[0.1em] text-[#69716d]">Marché du set</span><b className="mt-1 block text-[0.82rem] tabular-nums">{set.study.observedOffers} offres · {set.study.sellerCardVoices} voix vendeur-carte</b></div>
        <div><span className="block text-[0.66rem] uppercase tracking-[0.1em] text-[#69716d]">Sources actives</span><b className="mt-1 block text-[0.82rem] tabular-nums">eBay.fr {set.study.sourceOffers.ebayFR} · CardTrader FR {set.study.sourceOffers.cardTraderFR}</b></div>
        <div><span className="block text-[0.66rem] uppercase tracking-[0.1em] text-[#69716d]">Actualisation</span><b className="mt-1 block text-[0.82rem]">{generated}</b></div>
      </div>

      <details className="mt-6">
        <summary id="evidence-title" className="cursor-pointer text-[0.95rem] font-semibold">Sources, volume et limites de l’estimation</summary>
        <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
          <div>
            <h3 className="m-0 text-[0.9rem] font-semibold">Comment lire les prix</h3>
            <p className="m-0 mt-2 text-[0.8rem] leading-6 text-[#59615d]">{data.definition.languageDoctrine}. Une voix par vendeur et par source, puis médiane et p10. Minimum {data.definition.minimumOffers} offres, {data.definition.minimumSellers} vendeurs et {data.definition.maximumAgeDays} jours.</p>
            <p className="m-0 mt-3 text-[0.8rem] leading-6 text-[#59615d]">Les frais sont fixés à {pct(data.definition.fees)} et les cartes sous {eur.format(data.definition.bulkThreshold)} valent zéro dans le scénario de revente. Les taux proviennent de {set.sampleSource ?? "sources communautaires documentées"} ; confiance {set.rateConfidence}.</p>

            <h3 className="m-0 mt-7 text-[0.9rem] font-semibold">Taux par rareté</h3>
            <div className="mt-3 divide-y divide-[#d3cfc3] border-y border-[#d3cfc3]">
              {set.classes.map((row) => (
                <div key={row.rarity} className="grid grid-cols-[1fr_auto] gap-x-5 gap-y-1 py-2.5 sm:grid-cols-[1fr_8rem_8rem] sm:items-center">
                  <strong className="text-[0.78rem] font-medium">{row.rarity}</strong>
                  <span className="text-right text-[0.76rem] tabular-nums">{pct((row.rateLo + row.rateHi) / 2)} <small className="text-[#737b76]">({pct(row.rateLo)}–{pct(row.rateHi)})</small></span>
                  <span className="col-span-2 text-right text-[0.72rem] text-[#59615d] sm:col-span-1">une précise ≈ 1/{row.oneInSpecific}</span>
                </div>
              ))}
            </div>
          </div>

          <aside className="text-[0.78rem] leading-6 text-[#59615d]">
            <h3 className="m-0 text-[0.9rem] font-semibold text-[#1d2521]">Contrôle opérationnel</h3>
            <dl className="m-0 mt-3 grid gap-2">
              <div className="flex justify-between gap-4"><dt>Crawls complets</dt><dd className="m-0 font-semibold text-[#1d2521] tabular-nums">{completeCrawls}/{set.study.crawlHealth.expected}</dd></div>
              <div className="flex justify-between gap-4"><dt>Marchés à zéro offre</dt><dd className="m-0 font-semibold text-[#1d2521] tabular-nums">{set.study.crawlHealth.completeZero}</dd></div>
              <div className="flex justify-between gap-4"><dt>Écarts observés</dt><dd className="m-0 font-semibold text-[#1d2521] tabular-nums">{set.conflicts}</dd></div>
              <div className="flex justify-between gap-4"><dt>Écarts réellement bloquants</dt><dd className="m-0 font-semibold text-[#1d2521] tabular-nums">{set.blockingConflicts}</dd></div>
            </dl>
            <p className="m-0 mt-5 border-l-2 border-[#b87516] pl-3">Sur les {globalConflicts} écarts du modèle, {globalBlocking} seulement disposent aussi d’une profondeur suffisante. Les autres restent en fallback pour marché trop mince.</p>
            <p className="m-0 mt-4">Une cotation est mise en revue sous {data.definition.minimumReferenceRatio}× ou au-dessus de {data.definition.maximumReferenceRatio}× l’ancre. Elle n’est jamais injectée silencieusement.</p>
            <p className="m-0 mt-4"><strong className="text-[#1d2521]">Version.</strong> {data.modelVersion}.</p>
          </aside>
        </div>

        {set.conflictDetails.length ? (
          <div className="mt-8 overflow-x-auto">
            <h3 className="m-0 text-[0.9rem] font-semibold">Écarts de cotation du set</h3>
            <table className="mt-3 min-w-[720px] w-full border-collapse text-[0.74rem]">
              <thead className="border-y border-[#d3cfc3] text-left text-[#69716d]"><tr><th className="py-2 font-medium">Carte</th><th className="py-2 text-right font-medium">Ancre</th><th className="py-2 text-right font-medium">Marché</th><th className="py-2 text-right font-medium">Ratio</th><th className="py-2 text-right font-medium">Volume</th><th className="py-2 text-right font-medium">Effet</th></tr></thead>
              <tbody className="divide-y divide-[#dedad0]">
                {set.conflictDetails.map((conflict) => (
                  <tr key={`${conflict.number}-${conflict.name}`}>
                    <td className="py-2.5"><b className="font-medium">{conflict.name}</b> <span className="text-[#737b76]">#{conflict.number}</span></td>
                    <td className="py-2.5 text-right tabular-nums">{eur.format(conflict.anchorGross)}</td>
                    <td className="py-2.5 text-right tabular-nums">{eur.format(conflict.marketMedian)}</td>
                    <td className="py-2.5 text-right tabular-nums">{conflict.ratio}×</td>
                    <td className="py-2.5 text-right tabular-nums">{conflict.offers} offres · {conflict.sellers} vendeurs</td>
                    <td className="py-2.5 text-right"><span className={conflict.blocking ? "text-[#8a5a16]" : "text-[#69716d]"}>{conflict.blocking ? "fallback conflit" : "fallback mince"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </details>
    </section>
  );
}

export default function DropRateV2({ data }: { data: DropV2Data }) {
  const [activeId, setActiveId] = useState(data.sets.find((set) => set.id === "s151")?.id ?? data.sets[0]?.id);
  const active = data.sets.find((set) => set.id === activeId) ?? data.sets[0];
  const reliableCount = useMemo(() => data.sets.filter((set) => set.confidence !== "faible").length, [data.sets]);
  if (!active) return null;

  const retainedPct = retained(active);

  return (
    <div className="drop-v2-shell min-h-screen bg-[#f2efe7] text-[#1d2521]">
      <main id="contenu" className="mx-auto max-w-[1160px] px-4 pb-24 sm:px-7">
        <header className="grid gap-5 py-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end lg:py-10">
          <div>
            <p className="m-0 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#176b5b]">Drop rate v2.3 · bêta</p>
            <h1 className="m-0 mt-3 max-w-[24ch] text-[clamp(2rem,4.2vw,3.45rem)] font-semibold leading-[0.98] tracking-[-0.05em]">Ouvrir un booster&nbsp;: combien de valeur reste-t-il vraiment&nbsp;?</h1>
          </div>
          <p className="m-0 text-[0.88rem] leading-6 text-[#59615d]">Prix français EX+ uniquement. {data.sets.length} sets comparés, dont {reliableCount} avec une confiance au moins moyenne. La fragilité reste visible.</p>
        </header>

        <DecisionMap data={data} active={active} onSelect={setActiveId} />

        <section className="grid gap-8 py-10 lg:grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.55fr)] lg:gap-12 lg:py-12" aria-labelledby="set-result-title">
          <div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {active.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={active.logo} alt="" className="max-h-9 max-w-[145px] object-contain object-left" />
              ) : null}
              <p className="m-0 text-[0.78rem] text-[#69716d]">{active.nameEN && active.nameEN !== active.name ? active.nameEN : active.era}</p>
            </div>
            <h2 id="set-result-title" className="m-0 mt-5 max-w-[25ch] text-[clamp(1.75rem,3.8vw,3rem)] font-semibold leading-[1.03] tracking-[-0.045em]">{active.name} conserve environ {pct(retainedPct)} du prix du booster.</h2>
            <p className="m-0 mt-4 max-w-[68ch] text-[0.9rem] leading-7 text-[#59615d]">L’EV n’est pas le résultat typique d’un booster&nbsp;: quelques grosses cartes tirent la moyenne vers le haut. L’échelle ci-dessous compare les scénarios sans les confondre.</p>
            <div className="mt-7"><ScenarioScale set={active} /></div>
          </div>
          <CoverageComposition set={active} />
        </section>

        {active.partialNote || active.evCoverageTruncated ? (
          <aside className="mb-1 border-l-2 border-[#a35b3f] bg-[#efe4dd] px-5 py-4 text-[0.8rem] leading-6 text-[#6c3c30]">
            <strong className="font-semibold">Périmètre structurel incomplet.</strong> {active.partialNote} {active.evCoverageTruncated ? "Le suivi des cartes porteuses d’EV atteint aussi sa limite technique de 40 cartes." : ""}
          </aside>
        ) : null}

        <RarityDrivers set={active} />
        <CardContributions key={active.id} set={active} />
        <EvidencePanel data={data} set={active} />
      </main>
    </div>
  );
}
