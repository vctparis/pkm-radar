"use client";

import Link from "next/link";
import { useState } from "react";
import LineChart from "./LineChart";
import type { RadarData, Segment, SetEntry } from "@/lib/types";

const SERIES = { chase: "#3987e5", mid: "#d95926", commons: "#199e70" };

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const num = new Intl.NumberFormat("fr-FR");
const pct = (v: number | null, digits = 1) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(digits)} %`);

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
  const undiffused = data.sets.filter((s) => (s.history.points.at(-1)?.diffusion ?? 50) < 45).length;

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
              Sur les {data.sets.length} sets suivis, {undiffused} affichent une diffusion sous 45 % : la majorité des
              cartes y baisse pendant que le haut du panier tient. Les communes, une fois écartées celles sans aucune
              vente, reculent nettement plus vite que les cartes chase. C&apos;est le profil d&apos;une revalorisation
              portée par quelques pièces, pas d&apos;une inflation de fond.
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
            Cliquez une ligne pour analyser le set en détail. Le score combine largeur de la hausse, rareté réelle de
            l&apos;offre scellée, résistance à la dilution du grading, diversification et maturité.
          </p>

          <div className="mt-6 overflow-x-auto rounded-2xl ring-1 ring-ink-700/70">
            <table className="w-full min-w-[820px] border-collapse text-[0.88rem]">
              <caption className="sr-only">Classement des sets suivis par score de structure</caption>
              <thead className="bg-ink-800 text-left">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium text-mist-300">Set</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium text-mist-300">Booster</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium text-mist-300">Unités en vente</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium text-mist-300">Diffusion</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium text-mist-300">Concentration</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium text-mist-300">Score</th>
                </tr>
              </thead>
              <tbody>
                {data.sets.map((set) => {
                  const diffusion = set.history.points.at(-1)?.diffusion ?? null;
                  const selected = set.id === active.id;
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
                      <td className="tabular px-4 py-3 text-right text-mist-100">
                        {set.live?.booster?.price != null ? eur.format(set.live.booster.price) : "—"}
                      </td>
                      <td className="tabular px-4 py-3 text-right text-mist-300">
                        {set.live?.booster?.quantity != null ? num.format(set.live.booster.quantity) : "—"}
                        <span className="ml-1 text-mist-500">({set.live?.booster?.sellers ?? 0} vend.)</span>
                      </td>
                      <td className={`tabular px-4 py-3 text-right ${toneFor(diffusion != null ? diffusion - 50 : null)}`}>
                        {diffusion == null ? "—" : `${diffusion.toFixed(0)} %`}
                      </td>
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
            <LineChart
              title="La hausse se diffuse-t-elle vers le bas du set ?"
              subtitle="Part des cartes en hausse, par segment, sur une fenêtre glissante de 90 jours avancée mois par mois. Si la courbe du haut de panier se détache durablement de celle des communes, la valeur reste captée par le sommet du set. Les points se recouvrent : la série est lissée."
              series={[
                {
                  label: "Chase",
                  color: SERIES.chase,
                  points: active.segmentSeries.chase.map((p) => ({ date: p.date, value: p.diffusion, sample: p.sample })),
                },
                {
                  label: "Intermédiaires",
                  color: SERIES.mid,
                  points: active.segmentSeries.mid.map((p) => ({ date: p.date, value: p.diffusion, sample: p.sample })),
                },
                {
                  label: "Communes",
                  color: SERIES.commons,
                  points: active.segmentSeries.commons.map((p) => ({ date: p.date, value: p.diffusion, sample: p.sample })),
                },
              ]}
              reference={{ value: 50, label: "équilibre" }}
              format={(v) => `${v.toFixed(0)} %`}
              emptyHint="Aucune date de relevé ne réunit assez de cartes pour ce set."
            />

            <div className="grid gap-5 lg:grid-cols-2">
              <LineChart
                title="Momentum médian sur 30 jours"
                subtitle="Variation médiane du panier relevé à chaque date. Chaque carte sert de base à elle-même."
                series={[
                  {
                    label: "Momentum",
                    color: SERIES.mid,
                    points: active.history.points.map((p) => ({ date: p.date, value: p.momentum, sample: p.sample })),
                  },
                ]}
                reference={{ value: 0, label: "stable" }}
                format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} %`}
                emptyHint="Série insuffisante pour ce set."
              />

              {/* Un relevé unique ne fait pas une courbe : tant que la série
                  n'a pas au moins deux points, l'information se lit mieux en
                  tuiles qu'en graphe vide. */}
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
                    CardTrader n&apos;expose aucun historique de prix. Ces valeurs sont le relevé du jour ; le cron
                    quotidien en fera une courbe à partir du deuxième passage.
                  </p>
                  <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {[
                      { term: "Booster", value: active.live?.booster?.price != null ? eur.format(active.live.booster.price) : "—" },
                      { term: "Display", value: active.live?.boosterBox?.price != null ? eur.format(active.live.boosterBox.price) : "—" },
                      { term: "Unités en vente", value: active.live?.booster?.quantity != null ? num.format(active.live.booster.quantity) : "—" },
                      { term: "Vendeurs", value: active.live?.booster?.sellers != null ? num.format(active.live.booster.sellers) : "—" },
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
                  <th scope="col" className="pb-2 text-right font-medium text-mist-300">Diffusion</th>
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
            Classement par force relative au set, tension de l&apos;offre et liquidité. Le bulk sous 40 centimes est
            écarté : les frais d&apos;envoi y dépassent toute plus-value envisageable.
          </p>

          {active.picks.length === 0 ? (
            <p className="mt-6 rounded-xl border border-dashed border-ink-600 px-5 py-8 text-[0.88rem] text-mist-500">
              Aucune carte de ce set ne dépasse le seuil de prix retenu.
            </p>
          ) : (
            <ul className="mt-6 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 xl:grid-cols-4">
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
                  <p className="m-0 text-[0.95rem] font-medium leading-tight text-mist-050">{pick.name}</p>
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
