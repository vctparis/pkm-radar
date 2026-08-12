import { redirect } from "next/navigation";

// Le Portefeuille était un PoC non concluant (cours produit Cardmarket
// clampés, sans preuve marché). Le tracker de cartes le remplace : mêmes
// cartes, cotations françaises EX+ sourcées. On redirige au lieu de casser
// les habitudes et les liens.
export default function PortefeuillePage() {
  redirect("/cartes");
}
