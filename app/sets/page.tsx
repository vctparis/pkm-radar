import { redirect } from "next/navigation";

// L'index des sets a fusionné dans l'onglet Marché : catégorisation par
// famille, périodes d'édition, dates de sortie et prix du jour y vivent
// désormais ensemble. On redirige au lieu de casser les liens.
export default function SetsPage() {
  redirect("/marche");
}
