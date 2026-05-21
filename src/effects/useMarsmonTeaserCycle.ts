import { useEffect, useRef, useState } from 'react'
import {
  MARSMON_POST_REVEAL_HOLD_MS,
  MARSMON_REPLAY_RESET_MS,
  MARSMON_SUN_BURST_MS,
  MARSMON_SUN_FADEOUT_MS,
  type MarsmonTeaserCyclePhase,
  marsmonRuneRevealEndMs,
} from './marsmonTeaserCycle'

export function useMarsmonTeaserCycle(enabled: boolean) {
  const [cycleKey, setCycleKey] = useState(0)
  const [phase, setPhase] = useState<MarsmonTeaserCyclePhase>('runes')
  const timersRef = useRef<number[]>([])

  useEffect(() => {
    if (!enabled) {
      timersRef.current.forEach((id) => window.clearTimeout(id))
      timersRef.current = []
      setPhase('runes')
      return
    }

    let cancelled = false

    const clearTimers = () => {
      timersRef.current.forEach((id) => window.clearTimeout(id))
      timersRef.current = []
    }

    const runCycle = () => {
      if (cancelled) return
      clearTimers()
      setPhase('runes')

      const revealEnd = marsmonRuneRevealEndMs()
      const sunburstAt = revealEnd + MARSMON_POST_REVEAL_HOLD_MS
      const fadeoutAt = sunburstAt + MARSMON_SUN_BURST_MS
      const resetAt = fadeoutAt + MARSMON_SUN_FADEOUT_MS
      const nextCycleAt = resetAt + MARSMON_REPLAY_RESET_MS

      timersRef.current.push(
        window.setTimeout(() => {
          if (!cancelled) setPhase('hold')
        }, revealEnd),
      )

      timersRef.current.push(
        window.setTimeout(() => {
          if (!cancelled) setPhase('sunburst')
        }, sunburstAt),
      )

      timersRef.current.push(
        window.setTimeout(() => {
          if (!cancelled) setPhase('fadeout')
        }, fadeoutAt),
      )

      timersRef.current.push(
        window.setTimeout(() => {
          if (!cancelled) {
            setPhase('reset')
            setCycleKey((k) => k + 1)
          }
        }, resetAt),
      )

      timersRef.current.push(
        window.setTimeout(() => {
          if (!cancelled) runCycle()
        }, nextCycleAt),
      )
    }

    runCycle()

    return () => {
      cancelled = true
      clearTimers()
    }
  }, [enabled])

  return { cycleKey, phase }
}
