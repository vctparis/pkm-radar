"use client";

import Link from "next/link";
import { useState } from "react";
import LineChart from "./LineChart";
import GrowthBars from "./GrowthBars";
import type { RadarData, Segment, SetEntry } from "@/lib/types";

// Quatre premières places de la palette catégorielle validée (mode sombre).
const SERIES = { chase: "#3987e5", mid: "#d95926", commons: "#199e70", fr: "#c98500" };

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const num = new Intl.NumberFormat("fr-FR");
const pct = (v: number | null, digits = 1) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(digits)} %`);

// Ramène une série de prix à base 100 sur son premier relevé, pour rendre
// comparables des grandeurs d'ordres différents sur un axe unique.
function indexed<T extends { date: string }>(rows: T[], pick: (row: T) => number | null) {
  const base = rows.map(pick).find((v) => v != null && v > 0);
  if (base == null) return [];
  return rows.map((row) => {
    const value = pick(row);
    return { date: row.date, value: value != null && value > 0 ? (value / base) * 100 : null };
  });
}

function toneFor(value: number | null) {
  if (value == null) return "text-mist-500";
  if (value > 1) return "text-[color:var(--color-good)]";
  if (value < -1) return "text-[color:var(--color-bad)]";
  return "text-mist-300";
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-3">
      <span className="text-[0.78rem] text-mist-300">{label}</span>
      <span className="h-1.5 overflow-hidden rounded-full bg-ink-700">
        <span
          className="block h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
          style={{ width: `${value}%` }}
        />
      </span>
      <span className="tabular text-right text-[0.78rem] text-mist-100">{value}</span>
    </div>
  );
}

function SegmentRow({ name, segment, hint }: { name: string; segment: Segment; hint: string }) {
  return (
    <tr className="border-t border-ink-700/70">
      <th scope="row" className="py-2.5 pr-3 text-left align-top font-medium text-mist-050">
        {name}
        <span className="mt-0.5 block text-[0.72rem] font-normal leading-snug text-mist-500">{hint}</span>
      </th>
      <td className="tabular py-2.5 text-right text-mist-300">{segment.cards}</td>
      <td className={`tabular py-2.5 text-right ${toneFor(segment.changeMovers)}`}>{pct(segment.changeMovers)}</td>
      <td className={`tabular py-2.5 text-right ${toneFor(segment.diffusion != null ? segment.diffusion - 50 : null)}`}>
        {segment.diffusion == null ? "—" : `${segment.diffusion.toFixed(0)} %`}
      </td>
      <td className="tabular py-2.5 text-right text-mist-500">{segment.stale == null ? "—" : `${segment.stale} %`}</td>
    </tr>
  );
}

export default function Radar({ data }: { data: RadarData }) {
  const [activeId, setActiveId] = useState(data.sets[0]?.id);
  const active: SetEntry | undefined = data.sets.find((s) => s.id === activeId) ?? data.sets[0];
  if (!active) return null;

  const generated = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(
    new Date(data.generatedAt),
  );

  // Le classement répond à « quel booster » ; le détail répond à « quelles cartes ».
  // Nombre de sets où le haut du panier progresse plus vite que les communes :
  // c'est la définition opérationnelle d'une hausse qui ne se propage pas.
  const growthOf = (set: SetEntry, key: string) => set.strata.find((s) => s.key === key)?.growth ?? null;
  const topHeavy = data.sets.filter((s) => {
    const top = growthOf(s, "top12ex5");
    const low = growthOf(s, "commons");
    return top != null && low != null && top > low;
  }).length;
  // Part du mouvement du Top 12 imputable à une seule carte, set par set.
  const singleCardDriven = data.sets.filter(
    (s) => (s.strata.find((x) => x.key === "top12")?.driver?.share ?? 0) >= 0.8,
  ).length;

  return (
    <div className="relative z-10">
      <header className="border-b border-ink-700/70">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-baseline gap-3">
            <span className="display text-[1.15rem] tracking-tight text-mist-050">PKM Radar</span>
            <span className="text-[0.78rem] text-mist-500">relevé du {generated}</span>
          </div>
          <nav aria-label="Sections">
            <ul className="m-0 flex list-none items-center gap-1 p-0">
              <li>
                <span aria-current="page" className="rounded-lg bg-ink-800 px-3 py-1.5 text-[0.85rem] text-mist-050">
                  Radar
                </span>
              </li>
              <li>
                <a
                  href="/dossier"
                  className="rounded-lg px-3 py-1.5 text-[0.85rem] text-mist-300 transition-colors duration-200 hover:bg-ink-800 hover:text-mist-050"
                >
                  Dossier de marché
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      <main id="contenu" className="mx-auto max-w-[1180px] px-6 pb-24">
        {/* Le constat d'abord : c'est lui qui conditionne la lecture du reste. */}
        <section className="grid gap-8 py-14 lg:grid-cols-[1.35fr_1fr] lg:gap-14">
          <div>
            <p className="m-0 text-[0.8rem] uppercase tracking-[0.14em] text-mist-500">Ce que disent les relevés</p>
            <h1 className="display mt-3 text-[clamp(2rem,4.4vw,3.1rem)] text-mist-050">
              La hausse ne se diffuse pas — elle se concentre.
            </h1>
            <p className="prose-measure mt-5 text-[1.02rem] leading-relaxed text-mist-300">
              Sur les {data.sets.length} sets suivis, {topHeavy} voient leur Top 12 progresser plus vite que leurs
              communes. Et dans {singleCardDriven}{" "}
              cas, plus de 80 % de la hausse du Top 12 tient à une seule carte.
              C&apos;est le profil d&apos;une revalorisation portée par quelques pièces, pas d&apos;une inflation de
              fond qui remonterait tout le set.
            </p>
            <p className="prose-measure mt-4 text-[0.92rem] leading-relaxed text-mist-500">
              Le radar est donc construit pour être sceptique : un fort momentum, seul, ne rapporte presque aucun point.
              Ce qui compte est la conjonction rareté d&apos;offre et largeur de participation.
            </p>
          </div>

          <aside className="rounded-2xl bg-ink-850 p-6 ring-1 ring-ink-700/70">
            <h2 className="m-0 text-[0.8rem] uppercase tracking-[0.14em] text-mist-500">Tête de classement</h2>
            <p className="display mt-3 text-[1.6rem] text-mist-050">{data.sets[0].name}</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="tabular text-[2.6rem] font-semibold leading-none text-accent">{data.sets[0].score}</span>
              <span className="text-[0.85rem] text-mist-500">/ 100 · {data.sets[0].verdict}</span>
            </div>
            <div className="mt-5 grid gap-2.5">
              <ScoreBar label="Largeur" value={data.sets[0].components.breadth} />
              <ScoreBar label="Rareté offre" value={data.sets[0].components.scarcity} />
              <ScoreBar label="Résistance PSA" value={data.sets[0].components.psaResistance} />
              <ScoreBar label="Diversification" value={data.sets[0].components.spread} />
              <ScoreBar label="Maturité" value={data.sets[0].components.maturity} />
            </div>
          </aside>
        </section>

        {/* ---- Quel booster ---- */}
        <section aria-labelledby="classement" className="scroll-mt-6 pt-4">
          <h2 id="classement" className="display text-[1.5rem] text-mist-050">
            Quel booster
          </h2>
          <p className="prose-measure mt-2 text-[0.92rem] leading-relaxed text-mist-500">
            Un set intéressant réunit deux choses : une offre scellée réellement contrainte, et une hausse qui ne
            tienne pas à deux ou trois cartes. Cliquez une ligne pour l&apos;analyser en détail.
          </p>

          <div className="mt-6 overflow-x-auto rounded-2xl ring-1 ring-ink-700/70">
            <table className="w-full min-w-[900px] border-collapse text-[0.88rem]">
              <caption className="sr-only">Classement des sets suivis</caption>
              <thead className="bg-ink-800 text-left align-bottom">
                <tr>
                  {[
                    { label: "Set", hint: "", align: "left" },
                    { label: "Booster", hint: "le moins cher, neuf", align: "right" },
                    { label: "Offre FR", hint: "annonces / vendeurs eBay.fr", align: "right" },
                    { label: "Carte phare", hint: "celle qui porte le set", align: "left" },
                    { label: "Top 12 hors Top 5", hint: "croissance 30 j", align: "right" },
                    { label: "Communes", hint: "croissance 30 j", align: "right" },
                    { label: "Poids carte n°1", hint: "part de la valeur du set", align: "right" },
                    { label: "Score", hint: "sur 100", align: "right" },
                  ].map((column) => (
                    <th
                      key={column.label}
                      scope="col"
                      className={`px-4 py-3 font-medium text-mist-100 ${column.align === "right" ? "text-right" : ""}`}
                    >
                      {column.label}
                      {column.hint && (
                        <span className="mt-0.5 block text-[0.7rem] font-normal normal-case text-mist-500">
                          {column.hint}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.sets.map((set) => {
                  const selected = set.id === active.id;
                  const top12 = set.strata.find((s) => s.key === "top12ex5")?.growth ?? null;
                  const commons = set.strata.find((s) => s.key === "commons")?.growth ?? null;
                  return (
                    <tr
                      key={set.id}
                      onClick={() => setActiveId(set.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setActiveId(set.id);
                        }
                      }}
                      tabIndex={0}
                      aria-selected={selected}
                      className={`cursor-pointer border-t border-ink-700/70 transition-colors duration-200 ${
                        selected ? "bg-accent/10" : "hover:bg-ink-800/70"
                      }`}
                    >
                      <th scope="row" className="px-4 py-3 text-left font-medium text-mist-050">
                        {set.name}
                        <span className="mt-0.5 block text-[0.74rem] font-normal text-mist-500">
                          {set.era} · {set.ageYears} ans · {set.cardsTracked} cartes
                        </span>
                      </th>
                      {/* Priorité au marché français (eBay.fr, 10e centile) ;
                          CardTrader en repli, avec sa langue réelle. */}
                      <td className="tabular px-4 py-3 text-right text-mist-100">
                        {set.boosterFR?.floor10 != null ? (
                          <>
                            {eur.format(set.boosterFR.floor10)}
                            <span className="mt-0.5 block text-[0.72rem] text-mist-500">
                              FR · eBay · méd. {set.boosterFR.median != null ? eur.format(set.boosterFR.median) : "—"}
                            </span>
                          </>
                        ) : set.live?.booster?.price != null ? (
                          <>
                            {eur.format(set.live.booster.price)}
                            <span className="mt-0.5 block text-[0.72rem] uppercase text-mist-500">
                              {set.live.booster.language ?? "?"} · CardTrader
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="tabular px-4 py-3 text-right text-mist-300">
                        {set.boosterFR ? num.format(set.boosterFR.offers) : "—"}
                        <span className="mt-0.5 block text-[0.72rem] text-mist-500">
                          {set.boosterFR?.sellers ?? 0} vendeurs
                        </span>
                      </td>
                      <td className="px-4 py-3 text-left">
                        {set.bestCard ? (
                          <>
                            {set.bestCard.url ? (
                              <a
                                href={set.bestCard.url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-mist-050 underline decoration-ink-500 underline-offset-4 transition-colors duration-200 hover:decoration-accent"
                              >
                                {set.bestCard.name}
                              </a>
                            ) : (
                              <span className="text-mist-050">{set.bestCard.name}</span>
                            )}
                            <span className="tabular mt-0.5 block text-[0.72rem] text-mist-500">
                              {set.bestCard.number} · {eur.format(set.bestCard.price)}
                            </span>
                          </>
                        ) : (
                          <span className="text-mist-500">—</span>
                        )}
                      </td>
                      <td className={`tabular px-4 py-3 text-right ${toneFor(top12)}`}>{pct(top12)}</td>
                      <td className={`tabular px-4 py-3 text-right ${toneFor(commons)}`}>{pct(commons)}</td>
                      <td className="tabular px-4 py-3 text-right text-mist-300">
                        {set.concentration == null ? "—" : `${set.concentration} %`}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="tabular inline-flex min-w-[2.4rem] justify-center rounded-lg bg-ink-700 px-2 py-1 font-semibold text-mist-050">
                          {set.score}
                        </span>
                        <span className="mt-0.5 block text-[0.72rem] text-mist-500">{set.verdict}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Un score composite sans sa recette n'est pas vérifiable — donc pas
              utilisable pour décider. */}
          <details className="mt-4 rounded-2xl border border-ink-600 p-5 [&[open]>summary]:mb-4">
            <summary className="cursor-pointer text-[0.88rem] font-medium text-mist-100 marker:text-mist-500">
              Comment lire ces colonnes, et comment le score est calculé
            </summary>
            <dl className="prose-measure grid gap-3 text-[0.85rem] leading-relaxed">
              <div>
                <dt className="font-medium text-mist-100">Top 12 hors Top 5, et Communes</dt>
                <dd className="m-0 text-mist-300">
                  Croissance sur 30 jours, pondérée par la valeur du panier. Le Top 5 est volontairement exclu :
                  sur Ombres Ardentes il affiche +105 % dont la totalité vient du seul Charizard-GX, ce qui masque
                  ce que fait le reste du haut de gamme. Les rangs 6 à 12 y montent de 3,1 %, ce qui est une tout
                  autre histoire. L&apos;écart avec les communes dit si la hausse se propage.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-mist-100">Carte phare et poids de la carte n°1</dt>
                <dd className="m-0 text-mist-300">
                  La carte la plus chère du set, et la part de la valeur totale qu&apos;elle capte à elle seule.
                  À 60 %, acheter le set revient surtout à parier sur cette carte-là. Le nom renvoie à sa fiche
                  Cardmarket en français.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-mist-100">Score</dt>
                <dd className="m-0 text-mist-300">
                  30 % largeur de la hausse + 25 % rareté de l&apos;offre scellée + 20 % résistance à la dilution
                  PSA + 15 % diversification + 10 % maturité. Le momentum seul ne rapporte presque rien : c&apos;est
                  le signal le plus facile à fabriquer et le premier à se retourner.
                </dd>
              </div>
            </dl>
          </details>
        </section>

        {/* ---- Détail du set ---- */}
        <section aria-labelledby="detail" className="pt-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="detail" className="display text-[1.5rem] text-mist-050">
                {active.name}
              </h2>
              <p className="mt-1 text-[0.86rem] text-mist-500">
                {active.history.window
                  ? `Historique Cardmarket du ${active.history.window.from} au ${active.history.window.to}`
                  : "Historique indisponible"}
              </p>
            </div>
            <label className="flex items-center gap-2 text-[0.85rem] text-mist-300">
              Set analysé
              <select
                value={active.id}
                onChange={(e) => setActiveId(e.target.value)}
                className="rounded-lg border border-ink-600 bg-ink-850 px-3 py-1.5 text-mist-050 transition-colors duration-200 hover:border-accent"
              >
                {data.sets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-6 grid gap-5">
            {/* Réponse directe à « de combien monte le haut par rapport au bas ».
                Une coupe et non une courbe : voir le commentaire dans ingest.mjs. */}
            <section className="rounded-2xl bg-ink-850 p-5 ring-1 ring-ink-700/70">
              <h3 className="display m-0 text-[1.05rem] text-mist-050">
                De combien chaque strate monte-t-elle ?
              </h3>
              <p className="prose-measure m-0 mb-5 mt-1 text-[0.82rem] leading-relaxed text-mist-500">
                Croissance sur 30 jours, pondérée par la valeur : on somme les prix du panier plutôt que de moyenner
                des pourcentages, sinon une commune à 0,30 € pèserait autant qu&apos;un Dracaufeu à 300 €. Quand une
                seule carte fait l&apos;essentiel du mouvement, c&apos;est indiqué sous la barre.
              </p>
              <GrowthBars strata={active.strata} />
            </section>

            {/* Trois grandeurs d'échelles très différentes (booster ~10 €,
                Top 5 ~700 €) : elles ne sont comparables qu'indexées sur une
                base commune. Un second axe serait plus court à écrire et
                trompeur à lire. */}
            <LineChart
              title="Booster, Top 5 et Top 12 hors Top 5 — base 100"
              subtitle="Paniers de composition figée, valorisés chaque jour au plancher CardTrader. Aucune source accessible ne vend 3-4 ans d'historique de prix : cette série se construit à partir d'aujourd'hui, un relevé par jour."
              series={[
                {
                  label: "Booster FR (eBay, p10)",
                  color: SERIES.fr,
                  points: indexed(active.liveHistory, (p) => p.boosterFRp10 ?? null),
                },
                {
                  label: "Booster (CardTrader)",
                  color: SERIES.chase,
                  points: indexed(active.liveHistory, (p) => p.boosterPrice),
                },
                {
                  label: "Top 5",
                  color: SERIES.mid,
                  points: indexed(active.liveHistory, (p) => p.top5Value ?? null),
                },
                {
                  label: "Top 12 hors Top 5",
                  color: SERIES.commons,
                  points: indexed(active.liveHistory, (p) => p.top12ex5Value ?? null),
                },
              ]}
              reference={{ value: 100, label: "départ" }}
              format={(v) => v.toFixed(1)}
              emptyHint="Premier relevé enregistré aujourd'hui. La courbe apparaît au deuxième passage du cron quotidien — c'est le seul moyen d'obtenir cette profondeur, aucune API ne la vend."
            />

            <div className="grid gap-5 lg:grid-cols-2">
              <LineChart
                title="Croissance dans le temps"
                subtitle="Même mesure, suivie mois par mois sur fenêtre glissante de 90 jours. Le Top 5 et le Top 12 n'y figurent pas : Cardmarket relève les cartes les plus chères trop rarement pour en tirer une courbe."
                series={[
                  {
                    label: "Contenu du set",
                    color: SERIES.chase,
                    points: active.contentValue.map((p) => ({ date: p.date, value: p.growth, sample: p.sample })),
                  },
                  {
                    label: "Intermédiaires",
                    color: SERIES.mid,
                    points: active.growthSeries.mid.map((p) => ({ date: p.date, value: p.growth, sample: p.sample })),
                  },
                  {
                    label: "Communes",
                    color: SERIES.commons,
                    points: active.growthSeries.commons.map((p) => ({ date: p.date, value: p.growth, sample: p.sample })),
                  },
                ]}
                reference={{ value: 0, label: "stable" }}
                format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} %`}
                emptyHint="Série insuffisante pour ce set."
              />

              {/* Un relevé unique ne fait pas une courbe : tant que la série n'a
                  pas deux points, l'information se lit mieux en tuiles. */}
              {active.liveHistory.length >= 2 ? (
                <LineChart
                  title="Prix du booster scellé"
                  subtitle="Relevé CardTrader, un point par jour."
                  series={[
                    {
                      label: "Booster",
                      color: SERIES.commons,
                      points: active.liveHistory.map((p) => ({ date: p.date, value: p.boosterPrice })),
                    },
                  ]}
                  format={(v) => eur.format(v)}
                  emptyHint="Série en cours de constitution."
                />
              ) : (
                <section className="rounded-2xl bg-ink-850 p-5 ring-1 ring-ink-700/70">
                  <h3 className="display m-0 text-[1.05rem] text-mist-050">Marché scellé aujourd&apos;hui</h3>
                  <p className="prose-measure m-0 mt-1 text-[0.82rem] leading-relaxed text-mist-500">
                    CardTrader n&apos;expose aucun historique de prix scellé — c&apos;est une limite de l&apos;API, pas
                    un manque de données. La courbe se construit à partir du deuxième relevé quotidien. En attendant,
                    la tendance économique du booster se lit sur la courbe « contenu du set » ci-contre.
                  </p>
                  <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {[
                      {
                        term: "Booster FR (eBay, p10)",
                        value: active.boosterFR?.floor10 != null ? eur.format(active.boosterFR.floor10) : "—",
                      },
                      {
                        term: "Médiane FR",
                        value: active.boosterFR?.median != null ? eur.format(active.boosterFR.median) : "—",
                      },
                      {
                        term: "Offres FR",
                        value: active.boosterFR ? `${num.format(active.boosterFR.offers)} · ${active.boosterFR.sellers} vend.` : "—",
                      },
                      {
                        term: `CardTrader${active.live?.booster?.language ? ` (${active.live.booster.language})` : ""}`,
                        value: active.live?.booster?.price != null ? eur.format(active.live.booster.price) : "—",
                      },
                    ].map((tile) => (
                      <div key={tile.term}>
                        <dt className="text-[0.74rem] uppercase tracking-wider text-mist-500">{tile.term}</dt>
                        <dd className="tabular m-0 mt-1 text-[1.35rem] font-semibold leading-none text-mist-050">
                          {tile.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="m-0 mt-5 text-[0.78rem] leading-relaxed text-mist-500">
                    {active.live?.singles.tracked ?? 0} cartes du set suivies, {num.format(active.live?.singles.offers ?? 0)}{" "}
                    annonces au total.
                  </p>
                </section>
              )}
            </div>
          </div>

          {/* Le tableau des segments est le cœur du diagnostic : c'est l'écart
              entre le haut et le bas du set qui tranche entre revalorisation
              structurelle et pump concentré. */}
          <div className="mt-8 overflow-x-auto rounded-2xl bg-ink-850 p-5 ring-1 ring-ink-700/70">
            <h3 className="display m-0 text-[1.05rem] text-mist-050">La hausse descend-elle dans le set ?</h3>
            <p className="prose-measure mt-1 text-[0.82rem] leading-relaxed text-mist-500">
              Si le chase monte et que les communes reculent, la valeur ne se diffuse pas. La colonne « figées »
              indique la part de cartes sans aucune vente sur la fenêtre : leur variation vaut zéro par construction,
              elles sont donc exclues de la médiane.
            </p>
            <table className="mt-4 w-full min-w-[560px] border-collapse text-[0.86rem]">
              <thead>
                <tr className="text-left">
                  <th scope="col" className="pb-2 font-medium text-mist-300">Segment</th>
                  <th scope="col" className="pb-2 text-right font-medium text-mist-300">Cartes</th>
                  <th scope="col" className="pb-2 text-right font-medium text-mist-300">Variation 30 j</th>
                  <th scope="col" className="pb-2 text-right font-medium text-mist-300">Cartes en hausse</th>
                  <th scope="col" className="pb-2 text-right font-medium text-mist-300">Figées</th>
                </tr>
              </thead>
              <tbody>
                <SegmentRow name="Chase" segment={active.segments.chase} hint="12 cartes les plus chères" />
                <SegmentRow name="Intermédiaires" segment={active.segments.mid} hint="rares hors top 12" />
                <SegmentRow name="Communes" segment={active.segments.commons} hint="communes et peu communes" />
              </tbody>
            </table>
          </div>
        </section>

        {/* ---- Quelles cartes ---- */}
        <section aria-labelledby="pepites" className="pt-16">
          <h2 id="pepites" className="display text-[1.5rem] text-mist-050">
            Quelles cartes dans {active.name}
          </h2>
          <p className="prose-measure mt-2 text-[0.92rem] leading-relaxed text-mist-500">
            Les 12 meilleures, classées par force relative au set, tension de l&apos;offre et liquidité. Le bulk
            sous 40 centimes est écarté : les frais d&apos;envoi y dépassent toute plus-value envisageable. Chaque
            nom renvoie à sa fiche Cardmarket en français.
          </p>

          {active.picks.length === 0 ? (
            <p className="mt-6 rounded-xl border border-dashed border-ink-600 px-5 py-8 text-[0.88rem] text-mist-500">
              Aucune carte de ce set ne dépasse le seuil de prix retenu.
            </p>
          ) : (
            <ul className="mt-6 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {active.picks.map((pick, rank) => (
                <li
                  key={pick.id}
                  className="flex flex-col rounded-2xl bg-ink-850 p-4 ring-1 ring-ink-700/70 transition-transform duration-200 hover:-translate-y-0.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="tabular text-[0.72rem] text-mist-500">#{rank + 1}</span>
                    <span className="tabular rounded-lg bg-ink-700 px-2 py-0.5 text-[0.8rem] font-semibold text-mist-050">
                      {pick.score}
                    </span>
                  </div>
                  {pick.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={pick.image}
                      alt={`Carte ${pick.name}, numéro ${pick.number}`}
                      loading="lazy"
                      className="mx-auto my-3 h-auto w-[104px] rounded-lg"
                    />
                  )}
                  {pick.url ? (
                    <a
                      href={pick.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[0.95rem] font-medium leading-tight text-mist-050 underline decoration-ink-500 underline-offset-4 transition-colors duration-200 hover:decoration-accent"
                    >
                      {pick.name}
                    </a>
                  ) : (
                    <p className="m-0 text-[0.95rem] font-medium leading-tight text-mist-050">{pick.name}</p>
                  )}
                  <p className="m-0 mt-0.5 text-[0.74rem] text-mist-500">
                    {pick.number} · {pick.rarity}
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[0.76rem]">
                    <dt className="text-mist-500">Prix</dt>
                    <dd className="tabular m-0 text-right text-mist-050">{eur.format(pick.price)}</dd>
                    <dt className="text-mist-500">Force rel.</dt>
                    <dd className={`tabular m-0 text-right ${toneFor(pick.relativeStrength)}`}>
                      {pct(pick.relativeStrength)}
                    </dd>
                    <dt className="text-mist-500">Vendeurs</dt>
                    <dd className="tabular m-0 text-right text-mist-300">{pick.sellers ?? "—"}</dd>
                    <dt className="text-mist-500">Plancher</dt>
                    <dd className="tabular m-0 text-right text-mist-300">
                      {pick.marketFloor != null ? eur.format(pick.marketFloor) : "—"}
                    </dd>
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---- Méthode ---- */}
        <section aria-labelledby="methode" className="pt-16">
          <h2 id="methode" className="display text-[1.5rem] text-mist-050">
            Méthode et limites
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {data.sources.map((source) => (
              <article key={source.id} className="rounded-2xl bg-ink-850 p-5 ring-1 ring-ink-700/70">
                <h3 className="m-0 text-[0.95rem] font-medium text-mist-050">{source.label}</h3>
                <p className="m-0 mt-1 text-[0.78rem] uppercase tracking-wider text-mist-500">{source.role}</p>
                <p className="m-0 mt-3 text-[0.84rem] leading-relaxed text-mist-300">{source.note}</p>
              </article>
            ))}
          </div>
          <div className="mt-5 rounded-2xl border border-ink-600 p-5">
            <h3 className="m-0 text-[0.95rem] font-medium text-mist-050">Ce que ce radar ne sait pas faire</h3>
            <ul className="prose-measure mt-3 grid list-disc gap-2 pl-5 text-[0.86rem] leading-relaxed text-mist-300">
              <li>
                Le niveau de prix d&apos;un set au cours du temps n&apos;est pas reconstituable : chaque carte n&apos;a
                qu&apos;une date de relevé, donc aucun échantillon apparié ne relie deux dates. Seules les variations
                relatives sont mesurables.
              </li>
              <li>
                L&apos;historique Cardmarket s&apos;arrête au 1<sup>er</sup> juillet 2026. Les points les plus récents
                viennent de CardTrader et ne couvrent que le scellé.
              </li>
              <li>
                Les populations PSA sont saisies à la main : pas d&apos;API publique, donc pas de série quotidienne.
              </li>
              <li>Aucun prix de vente conclue n&apos;est disponible — tout est prix demandé, donc plafond optimiste.</li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-ink-700/70">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3 px-6 py-8 text-[0.8rem] text-mist-500">
          <p className="m-0">
            Outil d&apos;analyse personnel. Aucune de ces mesures ne constitue un conseil d&apos;investissement.
          </p>
          <Link href="/dossier" className="text-mist-300 transition-colors duration-200 hover:text-mist-050">
            Dossier de marché →
          </Link>
        </div>
      </footer>
    </div>
  );
}
