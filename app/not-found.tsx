import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Page introuvable" };

export default function NotFound() {
  return (
    <main id="contenu" className="relative z-10 mx-auto flex min-h-[80dvh] max-w-[1180px] flex-col justify-center px-6">
      <p className="m-0 text-[0.8rem] uppercase tracking-[0.14em] text-mist-500">Erreur 404</p>
      <h1 className="display mt-3 text-[clamp(1.8rem,4vw,2.6rem)] text-mist-050">Cette page n&apos;existe pas.</h1>
      <p className="prose-measure mt-4 text-[0.98rem] leading-relaxed text-mist-300">
        Le lien est peut-être obsolète : le dossier était auparavant servi à l&apos;adresse{" "}
        <code className="tabular rounded bg-ink-800 px-1.5 py-0.5 text-[0.86em]">/report.html</code>, il vit désormais
        sur sa propre page.
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link
          href="/"
          className="rounded-xl bg-accent px-4 py-2.5 text-[0.9rem] font-medium text-white transition-transform duration-200 hover:brightness-110 active:translate-y-px"
        >
          Aller au radar
        </Link>
        <Link
          href="/dossier"
          className="rounded-xl border border-ink-600 px-4 py-2.5 text-[0.9rem] text-mist-100 transition-colors duration-200 hover:border-accent active:translate-y-px"
        >
          Lire le dossier
        </Link>
      </div>
    </main>
  );
}
