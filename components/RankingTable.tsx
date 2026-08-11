"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import type { SetEntry } from "@/lib/types";

// Tableau « Quel booster » piloté : filtres, tri par colonne, colonnes à la
// carte. Tout est défini dans COLUMNS — en-tête, cellule, accesseur de tri,
// caractère obligatoire — pour que filtres, tri et sélection de colonnes ne
// puissent jamais diverger du rendu.

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const num = new Intl.NumberFormat("fr-FR");
const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "numeric", timeZone: "Europe/Paris" });
const pct = (v: number | null, digits = 1) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(digits)} %`);

function toneFor(value: number | null) {
  if (value == null) return "text-mist-500";
  if (value > 1) return "text-[color:var(--color-good)]";
  if (value < -1) return "text-[color:var(--color-bad)]";
  return "text-mist-300";
}

const growthOf = (set: SetEntry, key: string) => set.strata.find((s) => s.key === key)?.growth ?? null;
const boosterPriceOf = (set: SetEntry) => set.boosterFR?.floor10 ?? set.live?.booster?.price ?? null;
const contentRatioOf = (set: SetEntry) =>
  set.opening && set.opening.mode !== "box" ? (set.opening.ratioLo + set.opening.ratioHi) / 2 : null;
const psaPopOf = (set: SetEntry) => set.psa?.history?.at(-1)?.total ?? null;

type Column = {
  key: string;
  label: string;
  hint: string;
  align: "left" | "right";
  mandatory?: boolean;
  defaultOn: boolean;
  /** Valeur de tri ; null se classe toujours en fin. */
  sortValue: (set: SetEntry) => string | number | null;
  /** Sens du premier clic — prix ascendant, croissances descendantes. */
  firstDir: "asc" | "desc";
  render: (set: SetEntry, selected: boolean) => React.ReactNode;
};

const COLUMNS: Column[] = [
  {
    key: "set",
    label: "Set",
    hint: "",
    align: "left",
    mandatory: true,
    defaultOn: true,
    sortValue: (s) => s.name.toLowerCase(),
    firstDir: "asc",
    render: (s) => (
      <>
        {s.name}
        <span className="mt-0.5 block text-[0.74rem] font-normal text-mist-500">
          {s.nameEN && s.nameEN !== s.name ? `${s.nameEN} · ` : ""}
          {s.era} · {s.ageYears} ans
        </span>
      </>
    ),
  },
  {
    key: "booster",
    label: "Booster",
    hint: "le moins cher, neuf",
    align: "right",
    mandatory: true,
    defaultOn: true,
    sortValue: boosterPriceOf,
    firstDir: "asc",
    render: (s) =>
      s.boosterFR?.floor10 != null ? (
        <>
          {s.boosterFR.floor10Url ? (
            <a
              href={s.boosterFR.floor10Url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="underline decoration-ink-500 underline-offset-4 transition-colors duration-200 hover:decoration-accent"
            >
              {eur.format(s.boosterFR.floor10)}
            </a>
          ) : (
            eur.format(s.boosterFR.floor10)
          )}
          <span className="mt-0.5 block text-[0.72rem] text-mist-500">
            dès{" "}
            {s.boosterFR.priceUrl && s.boosterFR.price != null ? (
              <a
                href={s.boosterFR.priceUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="underline decoration-ink-500 underline-offset-2 transition-colors duration-200 hover:decoration-accent"
              >
                {eur.format(s.boosterFR.price)}
              </a>
            ) : s.boosterFR.price != null ? (
              eur.format(s.boosterFR.price)
            ) : (
              "—"
            )}{" "}
            · méd. {s.boosterFR.median != null ? eur.format(s.boosterFR.median) : "—"} · {s.jpOnly ? "JP" : "FR"} eBay
          </span>
        </>
      ) : s.live?.booster?.price != null ? (
        <>
          {eur.format(s.live.booster.price)}
          <span className="mt-0.5 block text-[0.72rem] uppercase text-mist-500">
            {s.live.booster.language ?? "?"} · CardTrader
          </span>
        </>
      ) : (
        "—"
      ),
  },
  {
    key: "contenu",
    label: "Contenu",
    hint: "valeur d'ouverture / prix",
    align: "right",
    defaultOn: true,
    sortValue: contentRatioOf,
    firstDir: "desc",
    render: (s) => {
      const ratio = contentRatioOf(s);
      return ratio != null ? (
        <span className={ratio >= 0.8 ? "font-semibold text-[color:var(--color-good)]" : "text-mist-300"}>
          {ratio.toFixed(2).replace(".", ",")}×
        </span>
      ) : (
        <span className="text-mist-500">—</span>
      );
    },
  },
  {
    key: "offre",
    label: "Offre",
    hint: "eBay.fr + unités CardTrader",
    align: "right",
    defaultOn: true,
    sortValue: (s) => s.boosterFR?.offers ?? null,
    firstDir: "asc",
    render: (s) => (
      <>
        {s.boosterFR ? num.format(s.boosterFR.offers) : "—"}
        <span className="mt-0.5 block text-[0.72rem] text-mist-500">{s.boosterFR?.sellers ?? 0} vendeurs FR</span>
        <span className="mt-0.5 block text-[0.72rem] text-mist-500">
          CT {s.live?.booster?.quantity != null ? num.format(s.live.booster.quantity) : "—"} unités
        </span>
      </>
    ),
  },
  {
    key: "carteTitre",
    label: "Carte-titre",
    hint: "et sa croissance 30 j",
    align: "left",
    defaultOn: true,
    sortValue: (s) => s.bestCard?.change30 ?? null,
    firstDir: "desc",
    render: (s) =>
      s.bestCard ? (
        <div className="flex items-start justify-between gap-3">
          <span className="group relative inline-block">
            {s.bestCard.url ? (
              <a
                href={s.bestCard.url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-mist-050 underline decoration-ink-500 underline-offset-4 transition-colors duration-200 hover:decoration-accent"
              >
                {s.bestCard.nameFR ?? s.bestCard.name}
              </a>
            ) : (
              <span className="text-mist-050">{s.bestCard.nameFR ?? s.bestCard.name}</span>
            )}
            <span className="tabular mt-0.5 block text-[0.72rem] text-mist-500">
              {s.bestCard.number} · {eur.format(s.bestCard.price)}
            </span>
            {s.bestCard.image && (
              <span
                aria-hidden
                className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-[150px] overflow-hidden rounded-lg shadow-[0_18px_40px_-12px_rgba(4,8,20,0.95)] ring-1 ring-ink-600 group-hover:block"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.bestCard.image} alt="" loading="lazy" className="block h-auto w-full" />
              </span>
            )}
          </span>
          <span className={`tabular whitespace-nowrap pt-0.5 text-[0.84rem] ${toneFor(s.bestCard.change30)}`}>
            {pct(s.bestCard.change30)}
          </span>
        </div>
      ) : (
        <span className="text-mist-500">—</span>
      ),
  },
  {
    key: "r615",
    label: "Rangs 6-15",
    hint: "croissance 30 j",
    align: "right",
    defaultOn: true,
    sortValue: (s) => growthOf(s, "r6_15"),
    firstDir: "desc",
    render: (s) => <span className={`tabular ${toneFor(growthOf(s, "r6_15"))}`}>{pct(growthOf(s, "r6_15"))}</span>,
  },
  {
    key: "fond",
    label: "Fond du set",
    hint: "croissance 30 j",
    align: "right",
    defaultOn: true,
    sortValue: (s) => growthOf(s, "fond"),
    firstDir: "desc",
    render: (s) => <span className={`tabular ${toneFor(growthOf(s, "fond"))}`}>{pct(growthOf(s, "fond"))}</span>,
  },
  {
    key: "poids",
    label: "Poids carte n°1",
    hint: "part de la valeur du set",
    align: "right",
    defaultOn: true,
    sortValue: (s) => s.concentration,
    firstDir: "desc",
    render: (s) => <span className="tabular text-mist-300">{s.concentration == null ? "—" : `${s.concentration} %`}</span>,
  },
  {
    key: "langue",
    label: "Langue",
    hint: "produit suivi",
    align: "right",
    defaultOn: false,
    sortValue: (s) => (s.jpOnly ? 1 : 0),
    firstDir: "asc",
    render: (s) => <span className="text-mist-300">{s.jpOnly ? "JP" : "FR"}</span>,
  },
  {
    key: "sortie",
    label: "Sortie",
    hint: "date de parution",
    align: "right",
    defaultOn: false,
    sortValue: (s) => s.releaseDate,
    firstDir: "asc",
    render: (s) => (
      <span className="tabular text-mist-300">
        {s.releaseDate ? monthFmt.format(new Date(s.releaseDate.replaceAll("/", "-"))) : "—"}
      </span>
    ),
  },
  {
    key: "cartes",
    label: "Cartes",
    hint: "suivies au set",
    align: "right",
    defaultOn: false,
    sortValue: (s) => s.cardsTracked,
    firstDir: "desc",
    render: (s) => <span className="tabular text-mist-300">{num.format(s.cardsTracked)}</span>,
  },
  {
    key: "psa",
    label: "PSA",
    hint: "population gradée",
    align: "right",
    defaultOn: false,
    sortValue: psaPopOf,
    firstDir: "desc",
    render: (s) => {
      const pop = psaPopOf(s);
      return <span className="tabular text-mist-300">{pop != null ? num.format(pop) : "—"}</span>;
    },
  },
  {
    key: "score",
    label: "Score",
    hint: "sur 100",
    align: "right",
    mandatory: true,
    defaultOn: true,
    sortValue: (s) => s.score,
    firstDir: "desc",
    render: (s) => (
      <>
        <span className="tabular inline-flex min-w-[2.4rem] justify-center rounded-lg bg-ink-700 px-2 py-1 font-semibold text-mist-050">
          {s.score}
        </span>
        <span className="mt-0.5 block text-[0.72rem] text-mist-500">{s.verdict}</span>
      </>
    ),
  },
];

const DEFAULT_VISIBLE = Object.fromEntries(COLUMNS.map((c) => [c.key, c.defaultOn]));
const STORAGE_KEY = "pkm-radar-colonnes-v1";

// Préférences de colonnes : un mini-store adossé à localStorage, consommé via
// useSyncExternalStore — le serveur rend les défauts, le navigateur relit la
// préférence sans setState dans un effet (et sans écart d'hydratation :
// React re-rend au snapshot client après montage).
const columnStore = {
  listeners: new Set<() => void>(),
  cacheRaw: null as string | null,
  cacheValue: DEFAULT_VISIBLE,
  read(): Record<string, boolean> {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      raw = null;
    }
    if (raw !== this.cacheRaw) {
      this.cacheRaw = raw;
      try {
        this.cacheValue = raw ? { ...DEFAULT_VISIBLE, ...JSON.parse(raw) } : DEFAULT_VISIBLE;
      } catch {
        this.cacheValue = DEFAULT_VISIBLE;
      }
    }
    return this.cacheValue;
  },
  write(next: Record<string, boolean>) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      this.cacheRaw = "volatile";
      this.cacheValue = next;
    }
    this.listeners.forEach((listener) => listener());
  },
  subscribe: (listener: () => void) => {
    columnStore.listeners.add(listener);
    return () => columnStore.listeners.delete(listener);
  },
};

type Filters = { langue: "toutes" | "fr" | "jp"; era: string; budget: "tous" | "moins10" | "10a25" | "plus25" };

export default function RankingTable({
  sets,
  activeId,
  onSelect,
}: {
  sets: SetEntry[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "score", dir: "desc" });
  const [filters, setFilters] = useState<Filters>({ langue: "toutes", era: "toutes", budget: "tous" });
  const [pickerOpen, setPickerOpen] = useState(false);

  const visible = useSyncExternalStore(
    columnStore.subscribe,
    () => columnStore.read(),
    () => DEFAULT_VISIBLE,
  );
  const toggleColumn = (key: string) => {
    columnStore.write({ ...visible, [key]: !visible[key] });
  };

  const eras = useMemo(() => [...new Set(sets.map((s) => s.era))], [sets]);

  const rows = useMemo(() => {
    const filtered = sets.filter((s) => {
      if (filters.langue === "fr" && s.jpOnly) return false;
      if (filters.langue === "jp" && !s.jpOnly) return false;
      if (filters.era !== "toutes" && s.era !== filters.era) return false;
      const price = boosterPriceOf(s);
      if (filters.budget === "moins10" && !(price != null && price < 10)) return false;
      if (filters.budget === "10a25" && !(price != null && price >= 10 && price <= 25)) return false;
      if (filters.budget === "plus25" && !(price != null && price > 25)) return false;
      return true;
    });

    const column = COLUMNS.find((c) => c.key === sort.key) ?? COLUMNS.at(-1)!;
    return [...filtered].sort((a, b) => {
      const va = column.sortValue(a);
      const vb = column.sortValue(b);
      // Les absents vont en fin de liste quel que soit le sens.
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = typeof va === "string" ? va.localeCompare(String(vb), "fr") : Number(va) - Number(vb);
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [sets, filters, sort]);

  const shown = COLUMNS.filter((c) => visible[c.key]);

  const headerClick = (column: Column) => {
    setSort((prev) =>
      prev.key === column.key ? { key: column.key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key: column.key, dir: column.firstDir },
    );
  };

  const filterChip = (active: boolean) =>
    `rounded-lg border px-2.5 py-1 text-[0.8rem] transition-colors duration-200 ${
      active ? "border-accent bg-accent/10 text-mist-050" : "border-ink-600 text-mist-300 hover:text-mist-050"
    }`;

  return (
    <div>
      {/* ---- Filtres + colonnes, une seule rangée ---- */}
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <div role="group" aria-label="Langue" className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { key: "toutes", label: "Toutes" },
              { key: "fr", label: "Françaises" },
              { key: "jp", label: "Japonaises" },
            ] as const
          ).map((o) => (
            <button key={o.key} type="button" onClick={() => setFilters((f) => ({ ...f, langue: o.key }))} aria-pressed={filters.langue === o.key} className={filterChip(filters.langue === o.key)}>
              {o.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-[0.8rem] text-mist-500">
          Ère
          <select
            value={filters.era}
            onChange={(e) => setFilters((f) => ({ ...f, era: e.target.value }))}
            className="rounded-lg border border-ink-600 bg-ink-850 px-2 py-1 text-[0.82rem] text-mist-100 transition-colors duration-200 hover:border-accent"
          >
            <option value="toutes">Toutes</option>
            {eras.map((era) => (
              <option key={era} value={era}>
                {era}
              </option>
            ))}
          </select>
        </label>

        <div role="group" aria-label="Prix du booster" className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { key: "tous", label: "Tout prix" },
              { key: "moins10", label: "< 10 €" },
              { key: "10a25", label: "10-25 €" },
              { key: "plus25", label: "> 25 €" },
            ] as const
          ).map((o) => (
            <button key={o.key} type="button" onClick={() => setFilters((f) => ({ ...f, budget: o.key }))} aria-pressed={filters.budget === o.key} className={filterChip(filters.budget === o.key)}>
              {o.label}
            </button>
          ))}
        </div>

        <div className="relative ml-auto">
          <button type="button" onClick={() => setPickerOpen((v) => !v)} aria-expanded={pickerOpen} className={filterChip(pickerOpen)}>
            Colonnes
          </button>
          {pickerOpen && (
            <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-xl bg-ink-800 p-3 shadow-[0_18px_40px_-12px_rgba(4,8,20,0.95)] ring-1 ring-ink-600">
              {COLUMNS.map((column) => (
                <label
                  key={column.key}
                  className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[0.84rem] ${
                    column.mandatory ? "cursor-not-allowed text-mist-500" : "cursor-pointer text-mist-100 hover:bg-ink-700/60"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={visible[column.key]}
                    disabled={column.mandatory}
                    onChange={() => toggleColumn(column.key)}
                    className="accent-[color:var(--color-accent)]"
                  />
                  {column.label}
                  {column.mandatory && <span className="ml-auto text-[0.7rem]">fixe</span>}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-ink-600 px-5 py-8 text-[0.88rem] text-mist-500">
          Aucun set ne passe ces filtres.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl ring-1 ring-ink-700/70">
          <table className="w-full min-w-[880px] border-collapse text-[0.88rem]">
            <caption className="sr-only">Classement des sets suivis — cliquez un en-tête pour trier</caption>
            <thead className="bg-ink-800 text-left align-bottom">
              <tr>
                {shown.map((column) => {
                  const active = sort.key === column.key;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                      className={`p-0 ${column.key === "set" ? "sticky left-0 z-10 bg-ink-800" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => headerClick(column)}
                        className={`block w-full px-4 py-2.5 font-medium transition-colors duration-200 hover:text-mist-050 ${
                          column.align === "right" ? "text-right" : "text-left"
                        } ${active ? "text-mist-050" : "text-mist-100"}`}
                      >
                        {column.label}
                        {active && <span aria-hidden className="ml-1 text-accent">{sort.dir === "asc" ? "↑" : "↓"}</span>}
                        {column.hint && (
                          <span className="mt-0.5 block text-[0.7rem] font-normal normal-case text-mist-500">{column.hint}</span>
                        )}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((set) => {
                const selected = set.id === activeId;
                return (
                  <tr
                    key={set.id}
                    onClick={() => onSelect(set.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(set.id);
                      }
                    }}
                    tabIndex={0}
                    aria-selected={selected}
                    className={`cursor-pointer border-t border-ink-700/70 transition-colors duration-200 ${
                      selected ? "bg-accent/10" : "hover:bg-ink-800/70"
                    }`}
                  >
                    {shown.map((column) =>
                      column.key === "set" ? (
                        <th
                          key={column.key}
                          scope="row"
                          className={`sticky left-0 z-10 px-4 py-2 text-left font-medium text-mist-050 ${
                            selected ? "bg-[#161c2e]" : "bg-ink-850"
                          }`}
                        >
                          {column.render(set, selected)}
                        </th>
                      ) : (
                        <td key={column.key} className={`px-4 py-2 ${column.align === "right" ? "text-right" : "text-left"} ${column.key === "booster" ? "tabular text-mist-100" : ""}`}>
                          {column.render(set, selected)}
                        </td>
                      ),
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
