import { useCallback, useEffect, useRef, useState } from 'react'
import { FORUM_TEASER_THREAD_URL, supportsEventCornerFog } from '../lib/forumTeaserImage'
import { ForumTeaserEventFog } from './ForumTeaserEventFog'
import {
  FORUM_TEASER_STATIC_HOLD_MS,
  ForumTeaserTvMedia,
  useForumTeaserImageSrc,
  useForumTeaserReducedMotion,
} from './ForumTeaserTvPopup'

/** Full TV intro cycle repeats every 15s while the embed is on screen. */
const EVENT_TEASER_LOOP_MS = 15_000
const EVENT_TEASER_REVEAL_MS = EVENT_TEASER_LOOP_MS - FORUM_TEASER_STATIC_HOLD_MS
/** Fog starts 0.7s before the static overlay ends. */
const EVENT_FOG_EARLY_MS = 700

/** Inline teaser on the event page: full TV static + CRT sequence, then clear image. */
export function ForumTeaserEventEmbed() {
  const reducedMotion = useForumTeaserReducedMotion()
  const { imgSrc, onImgError } = useForumTeaserImageSrc()
  const cornerFog = supportsEventCornerFog(imgSrc)
  const [phase, setPhase] = useState<'static' | 'reveal'>('reveal')
  const [introActive, setIntroActive] = useState(false)
  const [fogVisible, setFogVisible] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const revealTimerRef = useRef(0)
  const fogEarlyTimerRef = useRef(0)
  const loopTimerRef = useRef(0)
  const loopingRef = useRef(false)

  const playStaticBeat = useCallback(() => {
    setFogVisible(false)
    setIntroActive(true)
    setPhase('static')
    window.clearTimeout(revealTimerRef.current)
    window.clearTimeout(fogEarlyTimerRef.current)
    if (cornerFog) {
      fogEarlyTimerRef.current = window.setTimeout(() => {
        setFogVisible(true)
      }, Math.max(0, FORUM_TEASER_STATIC_HOLD_MS - EVENT_FOG_EARLY_MS))
    }
    revealTimerRef.current = window.setTimeout(() => {
      setPhase('reveal')
      setIntroActive(false)
    }, FORUM_TEASER_STATIC_HOLD_MS)
  }, [cornerFog])

  const stopLoop = useCallback(() => {
    window.clearInterval(loopTimerRef.current)
    window.clearTimeout(revealTimerRef.current)
    window.clearTimeout(fogEarlyTimerRef.current)
    loopingRef.current = false
    setPhase('reveal')
    setIntroActive(false)
    setFogVisible(false)
  }, [])

  const startLoop = useCallback(() => {
    if (loopingRef.current) return
    loopingRef.current = true
    playStaticBeat()
    loopTimerRef.current = window.setInterval(playStaticBeat, EVENT_TEASER_LOOP_MS)
  }, [playStaticBeat])

  useEffect(() => {
    if (reducedMotion) {
      stopLoop()
      return
    }

    const el = rootRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          startLoop()
        } else {
          stopLoop()
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.2 },
    )

    observer.observe(el)
    return () => {
      observer.disconnect()
      stopLoop()
    }
  }, [reducedMotion, startLoop, stopLoop])

  return (
    <div
      ref={rootRef}
      className={`forum-teaser-embedded${phase === 'reveal' ? ' forum-teaser-embedded--reveal' : ''}${
        cornerFog ? ' forum-teaser-embedded--corner-fog' : ''
      }${reducedMotion ? ' forum-teaser-embedded--reduced-motion' : ''}`}
      style={
        cornerFog
          ? ({ '--event-teaser-reveal-ms': `${EVENT_TEASER_REVEAL_MS}ms` } as React.CSSProperties)
          : undefined
      }
    >
      <a
        className="forum-teaser-media forum-teaser-media--event-stage"
        href={FORUM_TEASER_THREAD_URL}
        target="_blank"
        rel="noreferrer noopener"
        aria-label="Open teasers thread on the Digital Odyssey forums"
      >
        <ForumTeaserTvMedia
          imgSrc={imgSrc}
          onImgError={onImgError}
          reducedMotion={reducedMotion}
          phase={phase}
          overlayActive={introActive}
          staticHoldMs={FORUM_TEASER_STATIC_HOLD_MS}
        />
        {cornerFog && fogVisible && !reducedMotion ? <ForumTeaserEventFog /> : null}
      </a>
    </div>
  )
}
