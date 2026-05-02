/**
 * Wiki element string normalization (e.g. True Vice gear rolls must match the digimon element).
 */
export function normalizeWikiElement(raw: string | null | undefined): string {
  const t = (raw ?? '').trim()
  if (!t) return ''
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
}
