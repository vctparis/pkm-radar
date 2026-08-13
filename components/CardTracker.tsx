"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CardTrackerData,
  TrackerCard,
  TrackerHistoryPoint,
  TrackerMarketSummary,
  TrackerSet,
  TrackerSetDetail,
} from "@/lib/card-tracker-types";

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const shortDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });

const normalize = (value: string) => value
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

function displayName(card: TrackerCard, language: "fr" | "en") {
  return language === "fr" ? card.nameFR ?? card.nameEN : card.nameEN;
}

function parseQuery(query: string, sets: Record<string, TrackerSet>) {
  const normalized = normalize(query);
  const aliases = Object.entries(sets)
    .flatMap(([setId, set]) => set.aliases.map((alias) => ({ setId, alias: normalize(alias) })))
    .filter((entry) => entry.alias.length >= 2)
    .sort((a, b) => b.alias.length - a.alias.length);
  const setMatch = aliases.find((entry) => (` ${normalized} `).includes(` ${entry.alias} `)) ?? null;
  const withoutSet = setMatch
    ? normalize(` ${normalized} `.replace(` ${setMatch.alias} `, " "))
    : normalized;
  const terms = withoutSet.split(" ").filter((term) => term && !["fr", "en", "raw", "ungraded", "psa", "cgc"].includes(term) && !/^(?:10|9|8)$/.test(term));
  return { setId: setMatch?.setId ?? null, terms, normalized };
}

function searchCards(data: CardTrackerData, query: string) {
  if (normalize(query).length < 2) return [];
  const parsed = parseQuery(query, data.sets);
  return data.cards
    .filter((card) => {
      if (parsed.setId && card.setId !== parsed.setId) return false;
      const haystack = normalize(`${card.nameFR ?? ""} ${card.nameEN} ${card.number}`);
      return parsed.terms.every((term) => haystack.includes(term));
    })
    .sort((a, b) => {
      const exactA = [normalize(a.nameFR ?? ""), normalize(a.nameEN)].includes(parsed.terms.join(" ")) ? 1 : 0;
      const exactB = [normalize(b.nameFR ?? ""), normalize(b.nameEN)].includes(parsed.terms.join(" ")) ? 1 : 0;
      const marketA = a.followed ? 1 : 0;
      const marketB = b.followed ? 1 : 0;
      return exactB - exactA || marketB - marketA || b.price - a.price;
    })
    .slice(0, 80);
}

function confidenceClass(confidence: TrackerMarketSummary["confidence"]) {
  if (confidence === "élevée") return "border-[#287a61] bg-[#15382f] text-[#8ed5bd]";
  if (confidence === "moyenne") return "border-[#9d711e] bg-[#352b18] text-[#e3bd6a]";
  return "border-ink-500 bg-ink-800 text-mist-300";
}

function PriceHistory({ points, cardName }: { points: TrackerHistoryPoint[]; cardName: string }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const width = 820;
  const height = 270;
  const margin = { left: 58, right: 34, top: 30, bottom: 42 };
  const values = points.flatMap((point) => [point.median, point.floor10]);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const span = Math.max(max - min, max * 0.12, 1);
  const lo = Math.max(0, min - span * 0.18);
  const hi = max + span * 0.18;
  const x = (index: number) => margin.left + (points.length <= 1 ? 0.5 : index / (points.length - 1)) * (width - margin.left - margin.right);
  const y = (value: number) => margin.top + (1 - (value - lo) / Math.max(hi - lo, 1)) * (height - margin.top - margin.bottom);
  const medianPath = points.map((point, index) => `${index ? "L" : "M"}${x(index)},${y(point.median)}`).join(" ");
  const floorPath = points.map((point, index) => `${index ? "L" : "M"}${x(index)},${y(point.floor10)}`).join(" ");
  const active = hovered == null ? points.at(-1) : points[hovered];

  return (
    <div className="mt-6 overflow-hidden border-y border-ink-600 bg-ink-850/70">
      <svg viewBox={`0 0 ${width} ${height}`} className="block min-w-[680px] w-full" role="img" aria-label={`Historique sur 365 jours des offres actives pour ${cardName}`}>
        <title>Historique des offres actives EX+ — médiane et prix rapide</title>
        {[0, 0.5, 1].map((tick) => {
          const value = lo + (hi - lo) * tick;
          return <g key={tick}><line x1={margin.left} x2={width - margin.right} y1={y(value)} y2={y(value)} stroke="#2a3040" /><text x={margin.left - 10} y={y(value) + 4} textAnchor="end" fill="#8992a5" fontSize="11">{eur.format(value)}</text></g>;
        })}
        <line x1={margin.left} x2={width - margin.right} y1={height - margin.bottom} y2={height - margin.bottom} stroke="#3d4457" />
        {points.length > 1 ? <><path d={floorPath} fill="none" stroke="#c98500" strokeWidth="2" strokeDasharray="5 5" /><path d={medianPath} fill="none" stroke="#5aa3f1" strokeWidth="2.5" /></> : null}
        {points.map((point, index) => <g key={point.date} onMouseEnter={() => setHovered(index)} onMouseLeave={() => setHovered(null)} className="cursor-crosshair"><circle cx={x(index)} cy={y(point.median)} r={hovered === index ? 6 : 4} fill="#5aa3f1" stroke="#12141a" strokeWidth="2" /><circle cx={x(index)} cy={y(point.floor10)} r="3.5" fill="#c98500" stroke="#12141a" strokeWidth="1.5" /><rect x={x(index) - 18} y={margin.top} width="36" height={height - margin.top - margin.bottom} fill="transparent" /></g>)}
        {points[0] ? <text x={margin.left} y={height - 15} fill="#8992a5" fontSize="11">{shortDate.format(new Date(`${points[0].date}T12:00:00Z`))}</text> : null}
        {points.length > 1 ? <text x={width - margin.right} y={height - 15} textAnchor="end" fill="#8992a5" fontSize="11">{shortDate.format(new Date(`${points.at(-1)!.date}T12:00:00Z`))}</text> : null}
        {active ? <g><rect x={width - 230} y="15" width="196" height="54" rx="6" fill="#171a22" stroke="#3d4457" /><text x={width - 216} y="36" fill="#eef1f6" fontSize="12">{shortDate.format(new Date(`${active.date}T12:00:00Z`))}</text><text x={width - 216} y="56" fill="#99a1b3" fontSize="11">Médiane {eur.format(active.median)} · {active.sellers} vendeurs</text></g> : null}
      </svg>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-700 px-4 py-3 text-[0.74rem] text-mist-500">
        <span><i className="mr-1.5 inline-block h-0.5 w-5 bg-[#5aa3f1] align-middle" />Médiane des offres <i className="ml-4 mr-1.5 inline-block h-0.5 w-5 border-t-2 border-dashed border-[#c98500] align-middle" />P10</span>
        <span>{points.length < 2 ? "La courbe démarre avec ce premier relevé — aucune pente n’est encore affirmée." : `${points.length} jours observés dans la fenêtre de 365 jours.`}</span>
      </div>
    </div>
  );
}

function SourceCard({ summary, label, languageTag }: { summary: TrackerMarketSummary | null; label: string; languageTag: string }) {
  return (
    <article className="border-t border-ink-500 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div><p className="m-0 text-[0.73rem] uppercase tracking-[0.11em] text-mist-500">{label}</p><p className="m-0 mt-1 text-[0.76rem] text-mist-300">Offres actives · {languageTag} · EX+</p></div>
        {summary ? <span className={`rounded-full border px-2 py-1 text-[0.66rem] ${confidenceClass(summary.confidence)}`}>confiance {summary.confidence}</span> : null}
      </div>
      {summary ? <><p className="tabular m-0 mt-5 text-[1.8rem] font-semibold text-mist-050">{eur.format(summary.median)}</p><p className="m-0 mt-1 text-[0.74rem] text-mist-500">médiane · rapide {eur.format(summary.floor10)}</p><p className="m-0 mt-4 text-[0.76rem] text-mist-300">{summary.offers} offres · {summary.sellers} vendeurs · {summary.excluded} écartées</p></> : <p className="m-0 mt-5 text-[0.82rem] leading-6 text-mist-500">Aucune cotation comparable active dans le dernier périmètre fiable.</p>}
    </article>
  );
}

export default function CardTracker() {
  const [data, setData] = useState<CardTrackerData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<"fr" | "en">("fr");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  // Détails (image, référence, marché, historique) chargés PAR SET à la
  // sélection : l'index de recherche reste léger, le monolithe de 2,9 Mo
  // ne traverse plus le réseau à chaque visite.
  const [details, setDetails] = useState<Record<string, TrackerSetDetail>>({});

  useEffect(() => {
    let cancelled = false;
    fetch("/card-tracker-index.json", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((payload) => { if (!cancelled) setData(payload); })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, []);

  const results = useMemo(() => data ? searchCards(data, query) : [], [data, query]);
  const selected = data?.cards.find((card) => card.id === selectedId) ?? results[0] ?? null;
  const selectedSetId = selected?.setId ?? null;

  useEffect(() => {
    if (!selectedSetId || details[selectedSetId]) return;
    let cancelled = false;
    fetch(`/card-tracker/${selectedSetId}.json`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((payload) => { if (!cancelled) setDetails((current) => ({ ...current, [selectedSetId]: payload })); })
      .catch(() => { /* la carte reste consultable via l'index */ });
    return () => { cancelled = true; };
  }, [selectedSetId, details]);

  const detail = selectedSetId ? details[selectedSetId] ?? null : null;
  const detailCard = selected && detail ? detail.cards[selected.id] ?? null : null;
  const reference = detailCard?.reference ?? null;
  const market = selected && detail ? detail.markets[selected.id] ?? null : null;
  const set = selected && data ? data.sets[selected.setId] : null;
  const primaryName = selected ? displayName(selected, language) : "";
  const secondaryName = selected ? displayName(selected, language === "fr" ? "en" : "fr") : "";
  const referenceChange = reference?.avg30 && reference.avg30 > 0
    ? ((reference.price / reference.avg30) - 1) * 100
    : null;
  const gradeOf = (grade: number) => market?.grades[`PSA:${grade}`] ?? null;
  // La doctrine de langue suit le set : un set qui n'existe qu'en japonais se
  // cote en japonais, et l'écran doit le dire — pas « marché français ».
  const japanese = Boolean(set?.japanese);
  const languageTag = japanese ? "JP" : "FR";
  const marketLabel = japanese ? "Marché japonais comparable" : "Marché français comparable";

  if (loadError) return <p className="border-y border-ink-600 py-8 text-mist-300">Le tracker n’a pas pu charger son artefact de marché.</p>;
  if (!data) return <p className="py-16 text-mist-500">Chargement des identités et des marchés…</p>;

  return (
    <div>
      <section className="grid gap-8 py-12 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)] lg:items-end lg:py-16">
        <div>
          <p className="m-0 text-[0.76rem] uppercase tracking-[0.15em] text-accent">Cartes · bêta</p>
          <h1 className="display m-0 mt-3 max-w-[18ch] text-[clamp(2.2rem,5vw,4rem)]">Quelle carte cherchez-vous&nbsp;?</h1>
          <p className="prose-measure m-0 mt-5 text-[0.98rem] leading-7 text-mist-300">Un nom français ou anglais retrouve toutes les impressions. Ajoutez le code du set ou le numéro pour atteindre la bonne carte sans ambiguïté.</p>
        </div>
        <div className="border-l border-ink-500 pl-5 text-[0.8rem] leading-6 text-mist-500"><strong className="text-mist-100">{data.cards.length.toLocaleString("fr-FR")} cartes</strong> dans {Object.keys(data.sets).length} sets suivis. Les prix demandés, indices de plateforme et ventes confirmées ne sont jamais fusionnés.</div>
      </section>

      <section aria-label="Recherche de carte" className="relative border-y border-ink-600 bg-ink-850 p-3 sm:p-4">
        <div className="flex gap-3">
          <label className="min-w-0 flex-1"><span className="sr-only">Nom, set ou numéro de la carte</span><input autoFocus type="search" value={query} onFocus={() => setShowResults(true)} onChange={(event) => { setQuery(event.target.value); setShowResults(true); }} onKeyDown={(event) => { if (event.key === "Escape") setShowResults(false); if (event.key === "Enter" && results[0]) { setSelectedId(results[0].id); setShowResults(false); } }} placeholder="Ectoplasma · Gengar · Ectoplasma FST 157…" className="w-full border-0 bg-transparent px-2 py-3 text-[1.08rem] text-mist-050 outline-none placeholder:text-mist-500" /></label>
          <div className="flex items-center rounded-lg bg-ink-800 p-1" aria-label="Langue d’affichage"><button type="button" onClick={() => setLanguage("fr")} className={`rounded-md border-0 px-3 py-2 text-[0.75rem] ${language === "fr" ? "bg-accent text-white" : "bg-transparent text-mist-300"}`}>FR</button><button type="button" onClick={() => setLanguage("en")} className={`rounded-md border-0 px-3 py-2 text-[0.75rem] ${language === "en" ? "bg-accent text-white" : "bg-transparent text-mist-300"}`}>EN</button></div>
        </div>
        {showResults && query.trim().length >= 2 ? <div className="absolute left-0 right-0 top-full z-20 max-h-[26rem] overflow-y-auto border-b border-ink-600 bg-ink-850 shadow-2xl">
          {results.length ? results.slice(0, 14).map((card) => {
            const cardSet = data.sets[card.setId];
            const hasMarket = card.followed;
            const active = card.id === selected?.id;
            return <button key={card.id} type="button" onClick={() => { setSelectedId(card.id); setQuery(`${displayName(card, language)} ${cardSet.aliases.find((alias) => /^[a-z]+\d/i.test(alias)) ?? card.setId}`); setShowResults(false); }} className={`grid w-full grid-cols-[1fr_auto] gap-4 border-0 border-t border-ink-700 px-5 py-3 text-left ${active ? "bg-accent-soft" : "bg-ink-850 hover:bg-ink-800"}`}><span><b className="block text-[0.88rem] text-mist-050">{displayName(card, language)}</b><small className="text-[0.72rem] text-mist-500">{cardSet.nameFR} · #{card.number} · {card.rarity ?? "rareté non renseignée"}</small></span><span className="text-right"><b className="tabular block text-[0.84rem] text-mist-100">{eur.format(card.price)}</b><small className={hasMarket ? "text-[#63c29f]" : "text-mist-500"}>{hasMarket ? `marché ${data.sets[card.setId]?.japanese ? "JP" : "FR"} suivi` : "repère catalogue"}</small></span></button>;
          }) : <p className="m-0 px-5 py-6 text-[0.84rem] text-mist-500">Aucune impression reconnue. Vérifiez le code du set ou cherchez seulement le nom.</p>}
        </div> : null}
      </section>

      {selected && set ? <>
        <section className="grid gap-9 py-12 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14">
          <div className="self-start">
            <div className="flex aspect-[0.72] items-center justify-center overflow-hidden rounded-xl bg-ink-800 ring-1 ring-ink-600">
              {detailCard?.image ? (
                // Sources multiples et historiques : certaines images ne
                // passent pas par un domaine stable compatible next/image.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={detailCard.image} alt={`Carte ${primaryName}`} className="h-full w-full object-contain" />
              ) : <span className="px-5 text-center text-[0.8rem] text-mist-500">Illustration non disponible pour cette impression</span>}
            </div>
            <p className="m-0 mt-4 text-[0.72rem] leading-5 text-mist-500">Identité canonique&nbsp;: {selected.setId} · #{selected.number}. La langue reste une dimension de marché, jamais une simple traduction.</p>
          </div>
          <div>
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-600 pb-6"><div><p className="m-0 text-[0.76rem] text-mist-500">{set.nameFR} · #{selected.number} · {selected.rarity}</p><h2 className="display m-0 mt-2 text-[clamp(2rem,4vw,3.3rem)]">{primaryName}</h2>{secondaryName !== primaryName ? <p className="m-0 mt-2 text-[0.92rem] text-mist-500">{secondaryName}</p> : null}</div><span className="rounded-full border border-ink-500 px-3 py-1.5 text-[0.72rem] text-mist-300">Ungraded · EX+</span></div>

            <div className="mt-8 grid gap-6 md:grid-cols-3">
              <article className="md:col-span-2 border-t-2 border-accent pt-5"><p className="m-0 text-[0.72rem] uppercase tracking-[0.12em] text-mist-500">{marketLabel}</p>{market?.rawFR ? <><div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2"><strong className="tabular text-[2.7rem] leading-none text-mist-050">{eur.format(market.rawFR.median)}</strong><span className={`rounded-full border px-2 py-1 text-[0.68rem] ${confidenceClass(market.rawFR.confidence)}`}>confiance {market.rawFR.confidence}</span></div><p className="m-0 mt-3 text-[0.8rem] leading-6 text-mist-300">Médiane de {market.rawFR.offers} offres actives auprès de {market.rawFR.sellers} vendeurs. Achat rapide observé autour de <strong className="text-mist-100">{eur.format(market.rawFR.floor10)}</strong>.</p></> : <><p className="m-0 mt-4 text-[1.35rem] text-mist-100">Pas encore de marché {languageTag} assez comparable</p><p className="m-0 mt-3 text-[0.8rem] leading-6 text-mist-500">La carte reste consultable grâce au repère européen, mais aucun prix {languageTag} EX+ n’est promu.</p></>}</article>
              <article className="border-t border-ink-500 pt-5"><p className="m-0 text-[0.72rem] uppercase tracking-[0.12em] text-mist-500">{(reference?.source ?? "cardmarket_guide") === "cardmarket_guide" ? "Repère Cardmarket Europe" : "Plancher CardTrader"}</p><p className="tabular m-0 mt-3 text-[1.75rem] font-semibold">{reference ? eur.format(reference.price) : eur.format(selected.price)}</p><p className={`m-0 mt-2 text-[0.76rem] ${referenceChange != null && referenceChange > 0 ? "text-[#63c29f]" : referenceChange != null && referenceChange < 0 ? "text-[#e3bd6a]" : "text-mist-500"}`}>{referenceChange == null ? "historique indisponible" : `${referenceChange >= 0 ? "+" : ""}${referenceChange.toFixed(1)} % vs moyenne 30 j`}</p><p className="m-0 mt-3 text-[0.7rem] leading-5 text-mist-500">Indice de plateforme séparé des offres FR ; ce n’est pas une vente confirmée.</p></article>
            </div>

            <div className="mt-9 grid gap-5 sm:grid-cols-2"><SourceCard summary={market?.ebayFR ?? null} label="eBay.fr" languageTag={languageTag} /><SourceCard summary={market?.cardTraderFR ?? null} label={`CardTrader ${languageTag}`} languageTag={languageTag} /></div>
          </div>
        </section>

        <section className="border-t border-ink-600 py-12" aria-labelledby="trend-title"><div className="flex flex-wrap items-end justify-between gap-5"><div><p className="m-0 text-[0.76rem] uppercase tracking-[0.14em] text-accent">Tendance</p><h2 id="trend-title" className="display m-0 mt-2 text-[1.8rem]">Le prix monte-t-il vraiment&nbsp;?</h2></div><p className="m-0 max-w-[48ch] text-[0.78rem] leading-6 text-mist-500">Fenêtre minimale de 365 jours. Les points sont des instantanés d’offres comparables, pas des ventes reconstituées.</p></div>{market?.history.length ? <PriceHistory points={market.history} cardName={primaryName} /> : <div className="mt-6 border-y border-ink-600 py-10 text-center"><p className="m-0 text-mist-300">L’historique fiable commence au prochain relevé comparable.</p><p className="m-0 mt-2 text-[0.76rem] text-mist-500">Les moyennes 1/7/30 jours du guide Cardmarket ne sont pas transformées artificiellement en série temporelle.</p></div>}</section>

        <section className="grid gap-10 border-t border-ink-600 py-12 lg:grid-cols-[minmax(0,1fr)_21rem]" aria-labelledby="grades-title"><div><p className="m-0 text-[0.76rem] uppercase tracking-[0.14em] text-accent">Gradation</p><h2 id="grades-title" className="display m-0 mt-2 text-[1.8rem]">Raw et PSA restent deux marchés.</h2><div className="mt-7 grid grid-cols-4 border-y border-ink-600 text-center"><div className="border-r border-ink-600 bg-ink-800 px-2 py-4"><span className="block text-[0.7rem] text-mist-500">Raw EX+</span><b className="tabular mt-2 block text-[1rem]">{market?.rawFR ? eur.format(market.rawFR.median) : "—"}</b></div>{[10, 9, 8].map((grade) => { const row = gradeOf(grade); return <div key={grade} className="border-r border-ink-600 px-2 py-4 last:border-r-0"><span className="block text-[0.7rem] text-mist-500">PSA {grade}</span><b className={`tabular mt-2 block text-[1rem] ${row?.soldMedian90 ? "text-mist-050" : "text-mist-500"}`}>{row?.soldMedian90 ? eur.format(row.soldMedian90) : "—"}</b>{row ? <small className="mt-1 block text-[0.62rem] text-mist-500">{row.sales90} ventes · pop. {row.population ?? "—"}</small> : null}</div>; })}</div></div><aside className="border-l-2 border-[#c98500] pl-5 text-[0.8rem] leading-6 text-mist-300"><strong className="text-mist-050">{Object.keys(market?.grades ?? {}).length ? "PSA carte-niveau." : "Source carte-niveau à connecter."}</strong> {Object.keys(market?.grades ?? {}).length ? "Prix, volume de ventes et population sont affichés grade par grade, sans fusion avec le raw." : "Les populations PSA actuellement présentes dans Radar sont agrégées par set. Elles ne peuvent pas servir de population ni de prix pour cette carte. Aucun ratio PSA/raw n’est donc inventé."}</aside></section>

        <section className="border-t border-ink-600 py-10"><details><summary className="cursor-pointer text-[0.95rem] font-semibold text-mist-100">Sources, volume et annonces retenues</summary><div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_23rem]"><div>{market?.rawFR?.evidence.length ? <div className="divide-y divide-ink-700 border-y border-ink-600">{market.rawFR.evidence.map((row, index) => <a key={`${row.url}-${index}`} href={row.url ?? undefined} target="_blank" rel="noreferrer" className="grid grid-cols-[1fr_auto] gap-4 py-3 text-mist-300 no-underline hover:text-mist-050"><span className="min-w-0"><b className="block truncate text-[0.78rem] font-medium">{row.title ?? "Annonce sans titre"}</b><small className="text-mist-500">{row.trust === "trusted" ? "aucun signal" : "à surveiller"} · {row.condition ?? "état non structuré"}</small></span><b className="tabular text-[0.8rem]">{eur.format(row.price)}</b></a>)}</div> : <p className="text-[0.82rem] text-mist-500">Aucune preuve annonce-niveau publiée pour cette carte.</p>}</div><aside><dl className="m-0 grid gap-3 text-[0.76rem]">{data.sources.map((source) => <div key={source.id} className="grid grid-cols-[6rem_1fr] gap-3"><dt className="text-mist-100">{source.label}</dt><dd className="m-0 text-mist-500">{source.status === "active" ? "Actif" : source.status === "partial" ? "Partiel" : "En attente"} · {source.limit}</dd></div>)}</dl><p className="m-0 mt-6 text-[0.7rem] leading-5 text-mist-500">Version {data.modelVersion} · actualisé le {shortDate.format(new Date(data.generatedAt))}. {data.definitions.rawPrice}.</p></aside></div></details></section>
      </> : <p className="border-b border-ink-600 py-16 text-center text-mist-500">Commencez par saisir au moins deux caractères.</p>}
    </div>
  );
}
