/** Forme canonique stable pour apparier 036, 36, TG01 et 88a. */
export function normalizeCollectorNumber(value) {
  if (value == null) return null;
  const local = String(value).split("/")[0].trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const match = local.match(/^([a-z]*?)0*(\d+)([a-z]*)$/i);
  return match ? `${match[1]}${Number(match[2])}${match[3]}` : null;
}

/** Graphie destinée à la requête : conserve TG01 mais retire un éventuel total. */
export function collectorNumberForSearch(value) {
  if (value == null) return null;
  return String(value).split("/")[0].trim() || null;
}
