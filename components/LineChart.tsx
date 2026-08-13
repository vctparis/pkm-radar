"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type Point = { date: string; value: number | null; sample?: number };
export type Series = { label: string; color: string; points: Point[]; unit?: string };

type Props = {
  title: string;
  subtitle?: string;
  series: Series[];
  /** Repère horizontal de lecture, par ex. 50 % pour une diffusion. */
  reference?: { value: number; label: string };
  emptyHint: string;
  format?: (value: number) => string;
  /** Hauteur du tracé en unités viewBox — 320 par défaut, plus pour un graphe pleine largeur. */
  height?: number;
  /** Commandes supplémentaires affichées dans l'en-tête (ex. bascule de lissage). */
  controls?: React.ReactNode;
  /** Masquer la légende interne quand les commandes tiennent déjà ce rôle
      (des pastilles de sélection colorées SONT une légende). */
  legend?: boolean;
  /** Domaine vertical symétrique autour de zéro. Une borne explicite permet
      de garder la même échelle quand l'utilisateur masque une série. */
  symmetricZero?: boolean | number;
};

const dateFmtShort = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit" });

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "2-digit" });
const parse = (iso: string) => Date.parse(`${iso}T12:00:00Z`);

export default function LineChart({ title, subtitle, series, reference, emptyHint, format, height, controls, legend = true, symmetricZero = false }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);

  // Le SVG est dessiné dans un viewBox virtuel puis mis à l'échelle par le
  // navigateur : sur un écran de 375 px, un viewBox de 880 écrase le texte
  // sous les 5 px. On observe donc la largeur réelle du conteneur et on
  // redessine dans un viewBox étroit quand elle passe sous 560 px — le texte
  // garde ainsi une taille lisible après mise à l'échelle.
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setCompact(width > 0 && width < 560);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const W = compact ? 460 : 880;
  const PAD = useMemo(
    () => (compact ? { top: 26, right: 12, bottom: 40, left: 62 } : { top: 28, right: 24, bottom: 42, left: 52 }),
    [compact],
  );
  const FONT = compact ? 13 : 11;
  const H = Math.round((height ?? 320) * (compact ? 0.85 : 1));

  const model = useMemo(() => {
    const clean = series
      .map((s) => ({ ...s, points: s.points.filter((p) => p.value != null) }))
      .filter((s) => s.points.length > 0);
    if (!clean.length) return null;

    const times = clean.flatMap((s) => s.points.map((p) => parse(p.date)));
    const values = clean.flatMap((s) => s.points.map((p) => p.value as number));
    if (reference) values.push(reference.value);

    const minT = Math.min(...times);
    const maxT = Math.max(...times);
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    if (symmetricZero) {
      const observed = Math.max(1, ...values.map((value) => Math.abs(value)));
      const bound = (typeof symmetricZero === "number" ? Math.max(symmetricZero, observed) : observed) * 1.15;
      lo = -bound;
      hi = bound;
    } else {
      if (lo === hi) {
        lo -= 1;
        hi += 1;
      }
      const pad = (hi - lo) * 0.15;
      lo -= pad;
      hi += pad;
    }

    const x = (t: number) => (maxT === minT ? (PAD.left + W - PAD.right) / 2 : PAD.left + ((t - minT) / (maxT - minT)) * (W - PAD.left - PAD.right));
    const y = (v: number) => PAD.top + ((hi - v) / (hi - lo)) * (H - PAD.top - PAD.bottom);

    // Grille d'abscisses commune : l'union des dates observées, ce qui permet
    // de caler un curseur unique sur toutes les séries à la fois.
    const dates = [...new Set(clean.flatMap((s) => s.points.map((p) => p.date)))].sort();

    return { clean, x, y, lo, hi, minT, maxT, dates };
  }, [series, reference, symmetricZero, H, W, PAD]);

  // Une ligne exige au moins deux points ; en dessous on affiche l'état réel
  // plutôt qu'un graphe trompeusement vide.
  const enough = model?.clean.some((s) => s.points.length >= 2) ?? false;
  const fmt = format ?? ((v: number) => v.toFixed(1));

  return (
    <figure className="m-0 rounded-2xl bg-ink-850 p-5 ring-1 ring-ink-700/70 shadow-[0_18px_40px_-24px_rgba(4,8,20,0.9)]">
      <figcaption className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="display m-0 text-[1.05rem] text-mist-050">{title}</h3>
          {subtitle && <p className="prose-measure m-0 mt-1 text-[0.82rem] leading-relaxed text-mist-500">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {controls}
          {legend && model && model.clean.length >= 2 && (
            <ul className="m-0 flex list-none flex-wrap gap-3 p-0">
              {model.clean.map((s) => (
                <li key={s.label} className="flex items-center gap-1.5 text-[0.78rem] text-mist-300">
                  <span aria-hidden className="h-[3px] w-4 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => setAsTable((v) => !v)}
            aria-pressed={asTable}
            className="rounded-lg border border-ink-600 px-2.5 py-1 text-[0.75rem] text-mist-300 transition-colors duration-200 hover:border-accent hover:text-mist-050 active:translate-y-px"
          >
            {asTable ? "Voir le graphe" : "Voir les valeurs"}
          </button>
        </div>
      </figcaption>

      {!enough || !model ? (
        <div ref={wrapRef} className="flex min-h-[170px] flex-col items-start justify-center gap-2 rounded-xl border border-dashed border-ink-600 px-5 py-8">
          <strong className="text-[0.92rem] text-mist-100">Pas encore de série</strong>
          <p className="prose-measure m-0 text-[0.82rem] leading-relaxed text-mist-500">{emptyHint}</p>
        </div>
      ) : asTable ? (
        <div className="max-h-[320px] overflow-auto rounded-xl ring-1 ring-ink-700">
          <table className="w-full border-collapse text-left text-[0.82rem]">
            <thead className="sticky top-0 bg-ink-800">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium text-mist-300">Date</th>
                {model.clean.map((s) => (
                  <th key={s.label} scope="col" className="px-3 py-2 text-right font-medium text-mist-300">{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.dates.map((d) => (
                <tr key={d} className="border-t border-ink-700/70">
                  <th scope="row" className="px-3 py-1.5 font-normal text-mist-300">{dateFmt.format(parse(d))}</th>
                  {model.clean.map((s) => {
                    const p = s.points.find((q) => q.date === d);
                    return (
                      <td key={s.label} className="tabular px-3 py-1.5 text-right text-mist-050">
                        {p?.value != null ? fmt(p.value) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative" ref={wrapRef}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="block h-auto w-full touch-none"
            role="img"
            aria-label={`${title}. ${model.clean.map((s) => `${s.label} : ${fmt(s.points.at(-1)!.value as number)}`).join(". ")}`}
            onPointerLeave={() => setHover(null)}
            onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
            onPointerMove={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              const px = ((event.clientX - box.left) / box.width) * W;
              let best = 0;
              let bestDist = Infinity;
              model.dates.forEach((d, i) => {
                const dist = Math.abs(model.x(parse(d)) - px);
                if (dist < bestDist) {
                  bestDist = dist;
                  best = i;
                }
              });
              setHover(best);
            }}
          >
            {/* Grille en retrait : elle situe, elle ne se lit pas. */}
            {Array.from({ length: 5 }, (_, i) => {
              const gy = PAD.top + (i * (H - PAD.top - PAD.bottom)) / 4;
              const value = model.hi - (i * (model.hi - model.lo)) / 4;
              return (
                <g key={i}>
                  <line x1={PAD.left} y1={gy} x2={W - PAD.right} y2={gy} stroke="#1e2230" strokeWidth={1} />
                  <text x={PAD.left - 10} y={gy + 4} textAnchor="end" className="tabular" fontSize={FONT} fill="#6b7488">
                    {fmt(value)}
                  </text>
                </g>
              );
            })}

            {reference && (
              <g>
                <line
                  x1={PAD.left}
                  y1={model.y(reference.value)}
                  x2={W - PAD.right}
                  y2={model.y(reference.value)}
                  stroke="#3d4457"
                  strokeWidth={1}
                  strokeDasharray="5 5"
                />
                <text x={W - PAD.right} y={model.y(reference.value) - 7} textAnchor="end" fontSize={FONT} fill="#6b7488">
                  {reference.label}
                </text>
              </g>
            )}

            {model.dates.length > 1 &&
              [model.dates[0], model.dates.at(-1)!].map((d, i) => (
                <text
                  key={d}
                  x={model.x(parse(d))}
                  y={H - 14}
                  textAnchor={i ? "end" : "start"}
                  className="tabular"
                  fontSize={FONT}
                  fill="#6b7488"
                >
                  {(compact ? dateFmtShort : dateFmt).format(parse(d))}
                </text>
              ))}

            {hover != null && model.dates[hover] && (
              <line
                x1={model.x(parse(model.dates[hover]))}
                y1={PAD.top}
                x2={model.x(parse(model.dates[hover]))}
                y2={H - PAD.bottom}
                stroke="#3d4457"
                strokeWidth={1}
              />
            )}

            {model.clean.map((s) => {
              const path = s.points
                .map((p, i) => `${i ? "L" : "M"}${model.x(parse(p.date)).toFixed(1)} ${model.y(p.value as number).toFixed(1)}`)
                .join(" ");
              return (
                <g key={s.label}>
                  <path d={path} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  {s.points.map((p) => {
                    const active = hover != null && model.dates[hover] === p.date;
                    return (
                      <circle
                        key={p.date}
                        cx={model.x(parse(p.date))}
                        cy={model.y(p.value as number)}
                        r={active ? 6 : 4}
                        fill={s.color}
                        /* Anneau de la couleur du fond : sans lui, deux points
                           qui se croisent forment une tache illisible. */
                        stroke="#12141a"
                        strokeWidth={2}
                      />
                    );
                  })}
                </g>
              );
            })}
          </svg>

          {hover != null && model.dates[hover] && (
            <div
              className="pointer-events-none absolute top-2 max-w-[230px] rounded-xl bg-ink-900/95 px-3 py-2 text-[0.78rem] ring-1 ring-ink-600 backdrop-blur"
              style={{
                left: `${(model.x(parse(model.dates[hover])) / W) * 100}%`,
                transform: `translateX(${model.x(parse(model.dates[hover])) > W / 2 ? "-108%" : "8%"})`,
              }}
              role="status"
            >
              <div className="mb-1 text-mist-300">{dateFmt.format(parse(model.dates[hover]))}</div>
              {model.clean.map((s) => {
                const p = s.points.find((q) => q.date === model.dates[hover]);
                if (!p) return null;
                return (
                  <div key={s.label} className="flex items-center justify-between gap-4 whitespace-nowrap">
                    <span className="flex items-center gap-1.5 text-mist-300">
                      <span aria-hidden className="h-[3px] w-3 rounded-full" style={{ background: s.color }} />
                      {s.label}
                    </span>
                    <span className="text-right">
                      <span className="tabular block text-mist-050">{fmt(p.value as number)}</span>
                      {p.sample != null && (
                        <span className="block text-[0.7rem] text-mist-500">
                          {p.sample} carte{p.sample > 1 ? "s" : ""}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
