import {
  MARSMON_RUNE_FLIP_BASE_MS,
  MARSMON_RUNE_FLIP_STAGGER_MS,
  MARSMON_RUNE_GLYPHS,
} from './marsmonRuneGlyphs'

const RUNE_FLIP_DURATION_MS = 920

/** Idle time after the last rune flips before the sun sequence. */
export const MARSMON_POST_REVEAL_HOLD_MS = 8000

/** Slow expand + quick golden flash. */
export const MARSMON_SUN_BURST_MS = 3400

/** Envelope image (slow → fast) then fade back before replay. */
export const MARSMON_SUN_FADEOUT_MS = 3600

/** Brief settle before the rune loop restarts. */
export const MARSMON_REPLAY_RESET_MS = 350

export type MarsmonTeaserCyclePhase =
  | 'runes'
  | 'hold'
  | 'sunburst'
  | 'fadeout'
  | 'reset'

export function marsmonRuneRevealEndMs(): number {
  const lastIndex = Math.max(0, MARSMON_RUNE_GLYPHS.length - 1)
  const lastFlipStart =
    MARSMON_RUNE_FLIP_BASE_MS + lastIndex * MARSMON_RUNE_FLIP_STAGGER_MS
  return lastFlipStart + RUNE_FLIP_DURATION_MS
}

export function marsmonTeaserCycleLengthMs(): number {
  return (
    marsmonRuneRevealEndMs() +
    MARSMON_POST_REVEAL_HOLD_MS +
    MARSMON_SUN_BURST_MS +
    MARSMON_SUN_FADEOUT_MS +
    MARSMON_REPLAY_RESET_MS
  )
}
