import { useCallback, useEffect, useRef, useState } from 'react'
import { FORUM_TEASER_THREAD_URL } from '../lib/forumTeaserImage'
import {
  FORUM_TEASER_STATIC_HOLD_MS,
  ForumTeaserTvMedia,
  useForumTeaserImageSrc,
  useForumTeaserReducedMotion,
} from './ForumTeaserTvPopup'

/** Full TV intro cycle repeats every 15s while the embed is on screen. */
const EVENT_TEASER_LOOP_MS = 15_000

/** Inline teaser on the event page: full TV static + CRT sequence, then clear image. */
export function ForumTeaserEventEmbed() {
  const reducedMotion = useForumTeaserReducedMotion()
  const { imgSrc, onImgError } = useForumTeaserImageSrc()
  const [phase, setPhase] = useState<'static' | 'reveal'>('reveal')
  const [introActive, setIntroActive] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const revealTimerRef = useRef(0)
  const loopTimerRef = useRef(0)
  const loopingRef = useRef(false)

  const playStaticBeat = useCallback(() => {
    setIntroActive(true)
    setPhase('static')
    window.clearTimeout(revealTimerRef.current)
    revealTimerRef.current = window.setTimeout(() => {
      setPhase('reveal')
      setIntroActive(false)
    }, FORUM_TEASER_STATIC_HOLD_MS)
  }, [])

  const stopLoop = useCallback(() => {
    window.clearInterval(loopTimerRef.current)
    window.clearTimeout(revealTimerRef.current)
    loopingRef.current = false
    setPhase('reveal')
    setIntroActive(false)
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
        reducedMotion ? ' forum-teaser-embedded--reduced-motion' : ''
      }`}
    >
      <a
        className="forum-teaser-media"
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
      </a>
    </div>
  )
}
