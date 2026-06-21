import { DEFAULT_ROTATION_SIM_DURATION_SEC } from './dpsSim'

/** Tier list fight-length slider: 1–5 minutes in 30s steps (sustained column only). */
export const TIER_FIGHT_DURATION_MIN_SEC = 60
export const TIER_FIGHT_DURATION_MAX_SEC = 300
export const TIER_FIGHT_DURATION_STEP_SEC = 30
export const TIER_FIGHT_DURATION_DEFAULT_SEC = DEFAULT_ROTATION_SIM_DURATION_SEC

/** Clamp to tier fight-length bounds without snapping to the slider step. */
export function clampTierFightDurationSecFree(durationSec: number): number {
  const n = Number.isFinite(durationSec) ? Math.round(durationSec) : TIER_FIGHT_DURATION_DEFAULT_SEC
  return Math.min(TIER_FIGHT_DURATION_MAX_SEC, Math.max(TIER_FIGHT_DURATION_MIN_SEC, n))
}

/** Slider values snap to 30s steps within the tier fight-length bounds. */
export function clampTierFightDurationSec(durationSec: number): number {
  const clamped = clampTierFightDurationSecFree(durationSec)
  const stepIndex = Math.round((clamped - TIER_FIGHT_DURATION_MIN_SEC) / TIER_FIGHT_DURATION_STEP_SEC)
  return TIER_FIGHT_DURATION_MIN_SEC + stepIndex * TIER_FIGHT_DURATION_STEP_SEC
}

export function tierFightDurationSecChoices(): number[] {
  const out: number[] = []
  for (
    let t = TIER_FIGHT_DURATION_MIN_SEC;
    t <= TIER_FIGHT_DURATION_MAX_SEC;
    t += TIER_FIGHT_DURATION_STEP_SEC
  ) {
    out.push(t)
  }
  return out
}

export function formatTierFightDurationSec(sec: number): string {
  const clamped = clampTierFightDurationSecFree(sec)
  const m = Math.floor(clamped / 60)
  const s = clamped % 60
  if (s === 0) return `${m} min`
  return `${m}:${String(s).padStart(2, '0')}`
}
