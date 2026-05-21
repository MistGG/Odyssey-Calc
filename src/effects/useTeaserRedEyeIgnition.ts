import { useEffect, useRef, useState } from 'react'
import { CRT_LOOP_MS } from './CRT'
import { TEASER_RED_EYE } from './teaserRedEyeConfig'

export type TeaserRedEyeIgnition = 'off' | 'struggle' | 'active' | 'awakened'

const MID_CYCLE_AT_MS = CRT_LOOP_MS / 2

/** Red-eye state machine shared by {@link TeaserRedEyeGlow} and the mechano approach beat. */
export function useTeaserRedEyeIgnition(
  fogPhase: boolean,
  beatId: number,
  enabled = true,
): TeaserRedEyeIgnition {
  const [ignition, setIgnition] = useState<TeaserRedEyeIgnition>('off')
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
        if (fogPhaseRef.current) setIgnition('awakened')
      }, TEASER_RED_EYE.midCycleStruggleMs)
    }, MID_CYCLE_AT_MS)

    return () => {
      window.clearTimeout(midTimer)
      window.clearTimeout(midEndTimer)
    }
  }, [beatId, enabled])

  return ignition
}
