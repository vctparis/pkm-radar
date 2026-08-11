"use client";

import { useEffect, useMemo, useState } from "react";
import LineChart from "./LineChart";

// Portefeuille : les cartes possédées, suivies comme des positions.
//
// Tout vit dans le navigateur (localStorage) — pas de compte, pas de serveur,
// personne d'autre que vous ne voit vos positions. Les prix viennent de
// l'index régénéré chaque matin par le pipeline ; l'évolution combine la
// trajectoire 30 j de chaque carte (ancres Cardmarket) et des instantanés
// quotidiens enregistrés localement à chaque visite.

type IndexCard = {
  i: string;
  n: string;
  f: string | null;
  num: string;
  r: string | null;
  s: string;
  p: number;
  a30?: number | null;
  a7?: number | null;
  a1?: number | null;
};
type CardsIndex = { generatedAt: string; sets: Record<string, { name: string; jp: boolean }>; cards: IndexCard[] };
type Holding = { cardId: string; qty: number; buyPrice: number | null };
type Snapshot = { date: string; value: number };

const HOLDINGS_KEY = "pkm-portefeuille-v1";
const SNAPSHOTS_KEY = "pkm-portefeuille-instantanes-v1";

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const pct = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)} %`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

function toneFor(value: number | null) {
  if (value == null) return "text-mist-500";
  if (value > 0.5) return "text-[color:var(--color-good)]";
  if (value < -0.5) return "text-[color:var(--color-bad)]";
  return "text-mist-300";
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // stockage indisponible : la session vivra sans persistance
  }
}

export default function Portfolio() {
  const [index, setIndex] = useState<CardsIndex | null>(null);
  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [query, setQuery] = useState("");

  // L'index est volumineux : chargé à la demande, jamais dans le bundle.
  useEffect(() => {
    fetch("/cards-index.json", { cache: "no-store" })
      .then((response) => response.json())
      .then(setIndex)
      .catch(() => setIndex(null));
    setHoldings(load<Holding[]>(HOLDINGS_KEY, []));
    setSnapshots(load<Snapshot[]>(SNAPSHOTS_KEY, []));
  }, []);

  const byId = useMemo(() => new Map((index?.cards ?? []).map((card) => [card.i, card])), [index]);

  const rows = useMemo(() => {
    if (!holdings) return [];
    return holdings
      .map((holding) => {
        const card = byId.get(holding.cardId);
        if (!card) return null;
        const value = card.p * holding.qty;
        const change30 =
          card.a30 && card.a30 > 0 ? ((card.p - card.a30) / card.a30) * 100 : null;
        const pnl = holding.buyPrice != null ? (card.p - holding.buyPrice) * holding.qty : null;
        const pnlPct =
          holding.buyPrice != null && holding.buyPrice > 0 ? ((card.p - holding.buyPrice) / holding.buyPrice) * 100 : null;
        return { holding, card, value, change30, pnl, pnlPct };
      })
      .filter((row): row is NonNullable<typeof row> => row != null)
      .sort((a, b) => b.value - a.value);
  }, [holdings, byId]);

  const totals = useMemo(() => {
    const value = rows.reduce((sum, row) => sum + row.value, 0);
    const invested = rows.reduce((sum, row) => sum + (row.holding.buyPrice ?? 0) * row.holding.qty, 0);
    const investedRows = rows.filter((row) => row.holding.buyPrice != null);
    const pnl = investedRows.reduce((sum, row) => sum + (row.pnl ?? 0), 0);
    // Valeur du panier il y a ~30 j / ~7 j / ~24 h, aux ancres Cardmarket —
    // seules les cartes qui en ont participent (les japonaises n'en ont pas).
    // Une vente isolée peut laisser une ancre aberrante (vu : avg1 à
    // 3 999 € sur une carte à 600 €). Même garde que le pipeline : une ancre
    // au-delà de 3× le cours — dans un sens ou l'autre — est ramenée au cours.
    const anchor = (key: "a30" | "a7" | "a1") =>
      rows.reduce((sum, row) => {
        const raw = row.card[key] ?? row.card.p;
        const sane = raw > row.card.p * 3 || raw < row.card.p / 3 ? row.card.p : raw;
        return sum + sane * row.holding.qty;
      }, 0);
    return { value, invested, pnl, v30: anchor("a30"), v7: anchor("a7"), v1: anchor("a1") };
  }, [rows]);

  // Un instantané par jour, dès qu'il y a des positions : c'est lui qui
  // construit la vraie courbe au fil des visites.
  useEffect(() => {
    if (!holdings || !index || rows.length === 0) return;
    const today = iso(new Date());
    if (snapshots.at(-1)?.date === today) return;
    const next = [...snapshots.filter((snap) => snap.date !== today), { date: today, value: Number(totals.value.toFixed(2)) }].slice(-400);
    setSnapshots(next);
    save(SNAPSHOTS_KEY, next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length, index]);

  const updateHoldings = (next: Holding[]) => {
    setHoldings(next);
    save(HOLDINGS_KEY, next);
  };

  const addCard = (card: IndexCard) => {
    if (!holdings) return;
    const existing = holdings.find((holding) => holding.cardId === card.i);
    updateHoldings(
      existing
        ? holdings.map((holding) => (holding.cardId === card.i ? { ...holding, qty: holding.qty + 1 } : holding))
        : [...holdings, { cardId: card.i, qty: 1, buyPrice: null }],
    );
    setQuery("");
  };

  const results = useMemo(() => {
    if (!index || query.trim().length < 2) return [];
    const needle = query.trim().toLowerCase();
    return index.cards
      .filter(
        (card) =>
          card.n.toLowerCase().includes(needle) ||
          (card.f ?? "").toLowerCase().includes(needle) ||
          `${card.n} ${card.num}`.toLowerCase().includes(needle),
      )
      .sort((a, b) => b.p - a.p)
      .slice(0, 8);
  }, [index, query]);

  // Courbe : ancres approximatives (~J-30 / ~J-7 / ~hier) + instantanés locaux.
  const chartPoints = useMemo(() => {
    if (rows.length === 0) return [];
    const today = new Date();
    const at = (days: number) => iso(new Date(today.getTime() - days * 86_400_000));
    const anchors = [
      { date: at(30), value: Number(totals.v30.toFixed(2)) },
      { date: at(7), value: Number(totals.v7.toFixed(2)) },
      { date: at(1), value: Number(totals.v1.toFixed(2)) },
      { date: iso(today), value: Number(totals.value.toFixed(2)) },
    ];
    const merged = new Map<string, number>();
    for (const point of anchors) merged.set(point.date, point.value);
    for (const snap of snapshots) merged.set(snap.date, snap.value);
    return [...merged.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
  }, [rows.length, totals, snapshots]);

  if (holdings === null) return null;

  const change30Pct = totals.v30 > 0 ? ((totals.value - totals.v30) / totals.v30) * 100 : null;
  const pnlPctTotal = totals.invested > 0 ? (totals.pnl / totals.invested) * 100 : null;

  return (
    <div>
      {/* ---- Les quatre chiffres du portefeuille ---- */}
      <div className="grid gap-4 rounded-2xl bg-ink-850 p-6 ring-1 ring-ink-700/70 sm:grid-cols-4">
        <div>
          <p className="m-0 text-[0.72rem] uppercase tracking-wider text-mist-500">Valeur du portefeuille</p>
          <p className="tabular m-0 mt-1 text-[1.7rem] font-semibold leading-none text-mist-050">{eur.format(totals.value)}</p>
        </div>
        <div>
          <p className="m-0 text-[0.72rem] uppercase tracking-wider text-mist-500">Investi</p>
          <p className="tabular m-0 mt-1 text-[1.7rem] font-semibold leading-none text-mist-300">
            {totals.invested > 0 ? eur.format(totals.invested) : "—"}
          </p>
        </div>
        <div>
          <p className="m-0 text-[0.72rem] uppercase tracking-wider text-mist-500">Plus-value</p>
          <p className={`tabular m-0 mt-1 text-[1.7rem] font-semibold leading-none ${toneFor(totals.pnl)}`}>
            {totals.invested > 0 ? `${totals.pnl >= 0 ? "+" : ""}${eur.format(totals.pnl)}` : "—"}
            {pnlPctTotal != null && <span className="ml-2 text-[0.95rem]">{pct(pnlPctTotal)}</span>}
          </p>
        </div>
        <div>
          <p className="m-0 text-[0.72rem] uppercase tracking-wider text-mist-500">Sur ~30 jours</p>
          <p className={`tabular m-0 mt-1 text-[1.7rem] font-semibold leading-none ${toneFor(change30Pct)}`}>{pct(change30Pct)}</p>
        </div>
      </div>

      {/* ---- Ajouter une position ---- */}
      <div className="relative mt-5">
        <label className="block">
          <span className="sr-only">Rechercher une carte</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && results[0]) addCard(results[0]);
            }}
            placeholder={index ? "Ajouter une carte — nom français ou anglais…" : "Chargement de l'index…"}
            disabled={!index}
            className="w-full rounded-xl border border-ink-600 bg-ink-850 px-4 py-3 text-[0.95rem] text-mist-050 outline-none transition-colors duration-200 placeholder:text-mist-500 focus:border-accent"
          />
        </label>
        {results.length > 0 && (
          <ul className="absolute z-30 mt-2 w-full list-none overflow-hidden rounded-xl bg-ink-800 p-1.5 shadow-[0_18px_40px_-12px_rgba(4,8,20,0.95)] ring-1 ring-ink-600">
            {results.map((card) => (
              <li key={card.i}>
                <button
                  type="button"
                  onClick={() => addCard(card)}
                  className="flex w-full items-baseline justify-between gap-3 rounded-lg px-3 py-1.5 text-left transition-colors duration-150 hover:bg-ink-700/70"
                >
                  <span className="text-[0.9rem] text-mist-050">
                    {card.f ?? card.n}
                    <span className="ml-2 text-[0.74rem] text-mist-500">
                      {card.num} · {index?.sets[card.s]?.name}
                      {index?.sets[card.s]?.jp ? " (JP)" : ""}
                    </span>
                  </span>
                  <span className="tabular whitespace-nowrap text-[0.88rem] text-mist-300">{eur.format(card.p)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-ink-600 px-6 py-12 text-center">
          <p className="display m-0 text-[1.2rem] text-mist-050">Votre portefeuille est vide.</p>
          <p className="prose-measure mx-auto mt-2 text-[0.9rem] leading-relaxed text-mist-500">
            Cherchez une carte ci-dessus — Dracaufeu, Noctali, Giratina… — et ajoutez vos exemplaires. Tout reste
            dans ce navigateur : ni compte, ni envoi, personne d&apos;autre ne voit vos positions.
          </p>
        </div>
      ) : (
        <>
          {/* ---- La courbe ---- */}
          <div className="mt-6">
            <LineChart
              title="Évolution du portefeuille"
              subtitle="Trajectoire ~30 jours reconstruite par les moyennes Cardmarket de vos cartes, puis un instantané par jour de visite. Les cartes japonaises n'ont pas de trajectoire — elles n'entrent dans la courbe qu'au prix du jour."
              series={[{ label: "Valeur", color: "#3987e5", points: chartPoints }]}
              format={(value) =>
                value >= 1000
                  ? `${(value / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} k€`
                  : eur.format(value)
              }
              emptyHint="La courbe apparaît dès deux points."
            />
          </div>

          {/* ---- Les positions ---- */}
          <div className="mt-5 overflow-x-auto rounded-2xl ring-1 ring-ink-700/70">
            <table className="w-full min-w-[760px] border-collapse text-[0.87rem]">
              <caption className="sr-only">Vos positions</caption>
              <thead className="bg-ink-800 text-left">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium text-mist-100">Carte</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium text-mist-100">Qté</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium text-mist-100">
                    Achat
                    <span className="block text-[0.68rem] font-normal text-mist-500">unitaire, optionnel</span>
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium text-mist-100">Cours</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium text-mist-100">30 j</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium text-mist-100">Valeur</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium text-mist-100">+/-value</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium text-mist-100"><span className="sr-only">Retirer</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ holding, card, value, change30, pnl, pnlPct }) => (
                  <tr key={holding.cardId} className="border-t border-ink-700/60">
                    <th scope="row" className="px-4 py-1.5 text-left font-medium text-mist-050">
                      {card.f ?? card.n}
                      <span className="ml-2 text-[0.72rem] font-normal text-mist-500">
                        {card.num} · {index?.sets[card.s]?.name}
                        {index?.sets[card.s]?.jp ? " (JP)" : ""}
                      </span>
                    </th>
                    <td className="tabular px-4 py-1.5 text-right">
                      <span className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          aria-label={`Réduire la quantité de ${card.f ?? card.n}`}
                          onClick={() =>
                            updateHoldings(
                              holding.qty <= 1
                                ? holdings.filter((entry) => entry.cardId !== holding.cardId)
                                : holdings.map((entry) => (entry.cardId === holding.cardId ? { ...entry, qty: entry.qty - 1 } : entry)),
                            )
                          }
                          className="h-6 w-6 rounded-md border border-ink-600 text-mist-300 transition-colors duration-150 hover:border-accent hover:text-mist-050"
                        >
                          −
                        </button>
                        <span className="w-7 text-center text-mist-050">{holding.qty}</span>
                        <button
                          type="button"
                          aria-label={`Augmenter la quantité de ${card.f ?? card.n}`}
                          onClick={() =>
                            updateHoldings(holdings.map((entry) => (entry.cardId === holding.cardId ? { ...entry, qty: entry.qty + 1 } : entry)))
                          }
                          className="h-6 w-6 rounded-md border border-ink-600 text-mist-300 transition-colors duration-150 hover:border-accent hover:text-mist-050"
                        >
                          +
                        </button>
                      </span>
                    </td>
                    <td className="tabular px-4 py-1.5 text-right">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={holding.buyPrice ?? ""}
                        placeholder="—"
                        aria-label={`Prix d'achat unitaire de ${card.f ?? card.n}`}
                        onChange={(event) =>
                          updateHoldings(
                            holdings.map((entry) =>
                              entry.cardId === holding.cardId
                                ? { ...entry, buyPrice: event.target.value === "" ? null : Number(event.target.value) }
                                : entry,
                            ),
                          )
                        }
                        className="w-20 rounded-md border border-ink-700 bg-ink-900 px-2 py-0.5 text-right text-mist-050 outline-none transition-colors duration-150 placeholder:text-mist-500 focus:border-accent"
                      />
                    </td>
                    <td className="tabular px-4 py-1.5 text-right text-mist-050">{eur.format(card.p)}</td>
                    <td className={`tabular px-4 py-1.5 text-right ${toneFor(change30)}`}>{pct(change30)}</td>
                    <td className="tabular px-4 py-1.5 text-right font-semibold text-mist-050">{eur.format(value)}</td>
                    <td className={`tabular px-4 py-1.5 text-right ${toneFor(pnlPct)}`}>
                      {pnl != null ? `${pnl >= 0 ? "+" : ""}${eur.format(pnl)}` : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        type="button"
                        aria-label={`Retirer ${card.f ?? card.n}`}
                        onClick={() => updateHoldings(holdings.filter((entry) => entry.cardId !== holding.cardId))}
                        className="h-6 w-6 rounded-md text-mist-500 transition-colors duration-150 hover:bg-ink-700 hover:text-[color:var(--color-bad)]"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="prose-measure m-0 mt-4 text-[0.78rem] leading-relaxed text-mist-500">
            Cours : référence Cardmarket pour les sets occidentaux, plancher p10 des annonces japonaises en Europe
            pour les sets JP — rafraîchis chaque matin. Vos positions et l&apos;historique restent dans ce
            navigateur : videz son stockage et ils disparaissent.
          </p>
        </>
      )}
    </div>
  );
}
