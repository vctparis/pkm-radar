import type { Metadata } from "next";
import { Outfit, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Outfit porte les titres : géométrique, un peu de caractère, lisible en gras
// serré. IBM Plex Mono sert exclusivement aux chiffres, pour que les colonnes
// de prix et de scores s'alignent verticalement.
const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-outfit",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono-data",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://pkm-radar.vercel.app"),
  title: {
    default: "PKM Radar — sélection de sets et de cartes Pokémon TCG",
    template: "%s · PKM Radar",
  },
  description:
    "Radar de sélection Pokémon TCG : diffusion de la hausse, rareté de l'offre et dilution du grading, mesurées set par set sur données de marché.",
  openGraph: {
    title: "PKM Radar",
    description:
      "Quels sets et quelles cartes tiennent la route quand on doute que toutes les cartes puissent monter durablement.",
    type: "website",
    locale: "fr_FR",
  },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${outfit.variable} ${mono.variable}`}>
      <body className="antialiased">
        <a href="#contenu" className="skip-link">
          Aller au contenu
        </a>
        {children}
      </body>
    </html>
  );
}
