/**
 * Creeping zoom toward Mechanorimon after red-eye {@link TeaserRedEyeIgnition} = awakened.
 * Runs during CRT reveal, before the next static beat.
 */
export const TEASER_MECHANO_APPROACH = {
  /** Pivot near torso / feet in 6v7FJWV (below the red-eye hotspot). */
  transformOrigin: '54% 68%',
  /** Rush toward camera (ms); holds at end until static. */
  durationMs: 2400,
} as const
