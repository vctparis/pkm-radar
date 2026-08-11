"use client";

import type { Stratum } from "@/lib/types";

// Encodage divergent : deux teintes autour d'un zéro neutre. Le signe est aussi
// porté par le texte (« +11,1 % »), donc l'information ne repose jamais sur la
// seule couleur.
const UP = "#3987e5";
const DOWN = "#d95926";

export default function GrowthBars({ strata }: { strata: Stratum[] }) {
  const usable = strata.filter((s) => s.growth != null);
  if (!usable.length) {
    return (
      <p className="rounded-xl border border-dashed border-ink-600 px-5 py-8 text-[0.86rem] text-mist-500">
        Aucune strate ne réunit assez de cartes cotées pour ce set.
      </p>
    );
  }

  // Échelle symétrique : sans cela un +100 % écraserait visuellement un −10 %
  // et la comparaison entre strates deviendrait fausse à l'œil.
  const bound = Math.max(...usable.map((s) => Math.abs(s.growth as number)), 5);

  return (
    <div className="grid gap-2">
      {strata.map((stratum) => {
        const value = stratum.growth;
        if (value == null) {
          return (
            <div key={stratum.key} className="grid grid-cols-[minmax(5.5rem,8rem)_1fr_4.2rem] items-center gap-2 sm:gap-3">
              <span className="text-[0.84rem] text-mist-300">{stratum.label}</span>
              <span className="text-[0.8rem] text-mist-500">échantillon insuffisant</span>
              <span aria-hidden />
            </div>
          );
        }
        const width = (Math.abs(value) / bound) * 50;
        const positive = value >= 0;

        return (
          // La valeur vit dans sa propre colonne, jamais en absolu au bout de
          // la barre : au bout d'une barre longue elle sortirait du cadre sur
          // un écran de téléphone.
          <div key={stratum.key} className="grid grid-cols-[minmax(5.5rem,8rem)_1fr_4.2rem] items-start gap-2 sm:gap-3">
            <div className="pt-0.5">
              <span className="block text-[0.84rem] font-medium leading-tight text-mist-100">{stratum.label}</span>
              <span className="block text-[0.72rem] text-mist-500">{stratum.cards} cartes</span>
            </div>

            <div>
              <div className="relative h-7">
                {/* Axe zéro au centre : les strates se comparent de part et d'autre. */}
                <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-ink-600" />
                <span
                  className="absolute top-1 h-5 rounded-[3px] transition-[width] duration-500 ease-out"
                  style={{
                    background: positive ? UP : DOWN,
                    left: positive ? "50%" : `${50 - width}%`,
                    width: `${Math.max(width, 0.4)}%`,
                  }}
                />
              </div>

              {stratum.driver && (
                <p className="m-0 mt-0.5 text-[0.74rem] leading-snug text-mist-500">
                  dont{" "}
                  <strong className="font-medium text-mist-300">
                    {Math.round(stratum.driver.share * 100)} %
                  </strong>{" "}
                  dus à la seule carte {stratum.driver.name} ({stratum.driver.number}),{" "}
                  {stratum.driver.change >= 0 ? "+" : ""}
                  {stratum.driver.change} %
                </p>
              )}
            </div>

            <span className={`tabular pt-1.5 text-right text-[0.82rem] font-semibold ${positive ? "text-mist-050" : "text-mist-050"}`}>
              {positive ? "+" : ""}
              {value.toFixed(1)} %
            </span>
          </div>
        );
      })}
    </div>
  );
}
