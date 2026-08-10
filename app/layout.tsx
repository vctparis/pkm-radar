import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Simulateur Pokémon TCG",
  description: "Dossier de marché Pokémon TCG et simulateurs interactifs expliqués.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
