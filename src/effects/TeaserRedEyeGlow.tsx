import { TEASER_RED_EYE } from './teaserRedEyeConfig'
import { useTeaserRedEyeIgnition } from './useTeaserRedEyeIgnition'

export type TeaserRedEyeGlowProps = {
  /** True while GrayFog is on screen (reveal + early static tail). */
  fogPhase: boolean
  /** Increments each CRT loop beat (for mid-cycle eye pulse). */
  beatId: number
  /** Off when the forum teaser image changes (see {@link supportsTeaserRedEyeGlow}). */
  enabled?: boolean
}

/**
 * Red eye ignition overlay for the 6v7FJWV teaser — flickers during fog, then holds steady.
 * Pair with {@link GrayFog} on the event embed.
 */
export function TeaserRedEyeGlow({ fogPhase, beatId, enabled = true }: TeaserRedEyeGlowProps) {
  const ignition = useTeaserRedEyeIgnition(fogPhase, beatId, enabled)

  if (ignition === 'off') return null

  const [r, g, b] = TEASER_RED_EYE.rgb

  return (
    <div
      className={`teaser-red-eye-glow teaser-red-eye-glow--${ignition}`}
      style={{
        left: `${TEASER_RED_EYE.xPct}%`,
        top: `${TEASER_RED_EYE.yPct}%`,
        ['--red-eye-r' as string]: String(r),
        ['--red-eye-g' as string]: String(g),
        ['--red-eye-b' as string]: String(b),
      }}
      aria-hidden
    >
      <span className="teaser-red-eye-glow__halo" />
      <span className="teaser-red-eye-glow__core" />
    </div>
  )
}
