import { useCallback, useRef, useState } from 'react'
import { CRT_LOOP_MS, CRT_STATIC_HOLD_MS } from './CRT'
import { GRAY_FOG_EARLY_MS } from './grayFogTiming'

export type CrtRevealPhase = 'static' | 'reveal'

/** CRT static → reveal cycle; optionally schedules GrayFog before reveal ends. */
export function useCrtRevealLoop(grayFogEnabled: boolean) {
  const [phase, setPhase] = useState<CrtRevealPhase>('reveal')
  const [introActive, setIntroActive] = useState(false)
  const [grayFogVisible, setGrayFogVisible] = useState(false)
  const [beatId, setBeatId] = useState(0)
  const revealTimerRef = useRef(0)
  const grayFogEarlyTimerRef = useRef(0)
  const loopTimerRef = useRef(0)
  const loopingRef = useRef(false)

  const playStaticBeat = useCallback(() => {
    setBeatId((n) => n + 1)
    setGrayFogVisible(false)
    setIntroActive(true)
    setPhase('static')
    window.clearTimeout(revealTimerRef.current)
    window.clearTimeout(grayFogEarlyTimerRef.current)
    if (grayFogEnabled) {
      grayFogEarlyTimerRef.current = window.setTimeout(() => {
        setGrayFogVisible(true)
      }, Math.max(0, CRT_STATIC_HOLD_MS - GRAY_FOG_EARLY_MS))
    }
    revealTimerRef.current = window.setTimeout(() => {
      setPhase('reveal')
      setIntroActive(false)
    }, CRT_STATIC_HOLD_MS)
  }, [grayFogEnabled])

  const stopLoop = useCallback(() => {
    window.clearInterval(loopTimerRef.current)
    window.clearTimeout(revealTimerRef.current)
    window.clearTimeout(grayFogEarlyTimerRef.current)
    loopingRef.current = false
    setPhase('reveal')
    setIntroActive(false)
    setGrayFogVisible(false)
  }, [])

  const startLoop = useCallback(() => {
    if (loopingRef.current) return
    loopingRef.current = true
    playStaticBeat()
    loopTimerRef.current = window.setInterval(playStaticBeat, CRT_LOOP_MS)
  }, [playStaticBeat])

  return {
    phase,
    introActive,
    grayFogVisible,
    beatId,
    playStaticBeat,
    startLoop,
    stopLoop,
    revealMs: CRT_LOOP_MS - CRT_STATIC_HOLD_MS,
  }
}
