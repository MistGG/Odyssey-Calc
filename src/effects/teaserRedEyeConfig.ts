import { supportsGrayFog, supportsGrayFogForImgurId } from './grayFogConfig'

/**
 * Red eye hotspot on forum teaser 6v7FJWV (sampled from image pixels).
 * Used by {@link TeaserRedEyeGlow} during the {@link GrayFog} phase.
 */
export const TEASER_RED_EYE = {
  xPct: 56.31,
  yPct: 54.5,
  /** Typical eye color in source art. */
  rgb: [197, 78, 87] as const,
  /** Brief struggle flicker before steady glow (ms). */
  ignitionMs: 1100,
  /** Second struggle pulse at halfway through the 15s CRT loop (ms). */
  midCycleStruggleMs: 650,
} as const

/** Same gate as GrayFog for the live embed; archive uses {@link supportsGrayFogForImgurId}. */
export const supportsTeaserRedEyeGlow = supportsGrayFog

export { supportsGrayFogForImgurId }