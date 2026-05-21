import { useEffect, useRef, useState } from 'react'
import { CRT_LOOP_MS } from './CRT'
import { TEASER_RED_EYE } from './teaserRedEyeConfig'

export type TeaserRedEyeGlowProps = {
  /** True while GrayFog is on screen (reveal + early static tail). */
  fogPhase: boolean
  /** Increments each CRT loop beat (for mid-cycle eye pulse). */
  beatId: number
  /** Off when the forum teaser image changes (see {@link supportsTeaserRedEyeGlow}). */
  enabled?: boolean
}

type Ignition = 'off' | 'struggle' | 'active'

const MID_CYCLE_AT_MS = CRT_LOOP_MS / 2

/**
 * Red eye ignition overlay for the 6v7FJWV teaser — flickers during fog, then holds steady.
 * Pair with {@link GrayFog} on the event embed.
 */
export function TeaserRedEyeGlow({ fogPhase, beatId, enabled = true }: TeaserRedEyeGlowProps) {
  const [ignition, setIgnition] = useState<Ignition>('off')
  const fogPhaseRef = useRef(fogPhase)
  const ignitionCycleRef = useRef(0)

  fogPhaseRef.current = fogPhase
  const active = enabled && fogPhase

  useEffect(() => {
    if (!active) {
      setIgnition('off')
      return
    }

    const cycle = (ignitionCycleRef.current += 1)
    setIgnition('struggle')

    const activeTimer = window.setTimeout(() => {
      if (ignitionCycleRef.current === cycle) setIgnition('active')
    }, TEASER_RED_EYE.ignitionMs)

    return () => {
      window.clearTimeout(activeTimer)
    }
  }, [active])

  useEffect(() => {
    if (!enabled || beatId === 0) return

    let midEndTimer = 0
    const midTimer = window.setTimeout(() => {
      if (!fogPhaseRef.current) return
      setIgnition('struggle')
      midEndTimer = window.setTimeout(() => {
        if (fogPhaseRef.current) setIgnition('active')
      }, TEASER_RED_EYE.midCycleStruggleMs)
    }, MID_CYCLE_AT_MS)

    return () => {
      window.clearTimeout(midTimer)
      window.clearTimeout(midEndTimer)
    }
  }, [beatId, enabled])

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
