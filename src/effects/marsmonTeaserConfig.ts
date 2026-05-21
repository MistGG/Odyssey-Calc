import { FORUM_TEASER_IMAGE_URL } from '../lib/forumTeaserImage'
import { imgurIdFromUrl, isBundledTeaserImageUrl } from '../lib/teaserImageStorage'

/** Marsmon teaser (6JQlbLZ) — plain-image ambience only. */
export const MARSMON_TEASER_IMGUR_ID = '6JQlbLZ'

/** Central god-rays / chest glow behind Marsmon. */
export const MARSMON_TEASER_RADIANCE = {
  xPct: 49.5,
  yPct: 35,
  rgb: [255, 228, 160] as const,
} as const

export const MARSMON_FLAME_CYCLE_MS = 2800

export const MARSMON_TEASER_FLAMES = [
  { xPct: 66.2, yPct: 36.6, rotateDeg: -14, delayMs: 0, cycleMs: MARSMON_FLAME_CYCLE_MS },
  { xPct: 67.1, yPct: 35, rotateDeg: -8, delayMs: 220, cycleMs: MARSMON_FLAME_CYCLE_MS },
  { xPct: 67.8, yPct: 38.8, rotateDeg: -4, delayMs: 440, cycleMs: MARSMON_FLAME_CYCLE_MS },
  { xPct: 76.8, yPct: 36.2, rotateDeg: 10, delayMs: 120, cycleMs: MARSMON_FLAME_CYCLE_MS },
  { xPct: 77.5, yPct: 34.6, rotateDeg: 14, delayMs: 340, cycleMs: MARSMON_FLAME_CYCLE_MS },
  { xPct: 78.2, yPct: 38.4, rotateDeg: 18, delayMs: 560, cycleMs: MARSMON_FLAME_CYCLE_MS },
] as const

export function supportsMarsmonTeaserAmbience(
  imgurId?: string | null,
  imgSrc?: string,
  imageUrl: string = FORUM_TEASER_IMAGE_URL,
): boolean {
  const id = MARSMON_TEASER_IMGUR_ID
  if (imgurId?.trim() === id) return true
  if (imgSrc && (imgSrc.includes(id) || isBundledTeaserImageUrl(imgSrc, id))) return true
  return imgurIdFromUrl(imageUrl) === id
}
