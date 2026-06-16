/** Current in-game Digimon level cap for INT scaling (other stats may scale to 130). */
export const DIGIMON_INT_LEVEL_CAP = 90

/** Flat INT gained per Digimon level: in-game INT = wiki base + this × level (≤ cap). */
export const WIKI_INT_GAIN_PER_DIGIMON_LEVEL = 24

export function clampDigimonIntLevel(level: unknown): number {
  const n = typeof level === 'number' ? level : Number(level)
  if (!Number.isFinite(n)) return DIGIMON_INT_LEVEL_CAP
  return Math.max(1, Math.min(DIGIMON_INT_LEVEL_CAP, Math.floor(n)))
}

export function wikiBaseIntFromStats(stats: { int?: unknown } | null | undefined): number {
  const n = typeof stats?.int === 'number' ? stats.int : Number(stats?.int ?? 0)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.floor(n))
}

/**
 * In-game INT from wiki base + 24 × Digimon level (capped at {@link DIGIMON_INT_LEVEL_CAP}).
 * Example: Plesiomon wiki 1333 at L90 → 1333 + 2160 = 3493.
 */
export function effectiveIntAtDigimonLevel(
  wikiBaseInt: number,
  digimonLevel: number = DIGIMON_INT_LEVEL_CAP,
): number {
  const base = Math.max(0, Math.floor(wikiBaseInt))
  const lv = clampDigimonIntLevel(digimonLevel)
  return base + WIKI_INT_GAIN_PER_DIGIMON_LEVEL * lv
}

/** Tier list / comparable sim default: max-level INT. */
export function tierListEffectiveInt(wikiBaseInt: number): number {
  return effectiveIntAtDigimonLevel(wikiBaseInt, DIGIMON_INT_LEVEL_CAP)
}
