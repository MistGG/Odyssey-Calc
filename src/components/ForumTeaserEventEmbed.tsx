import { useEffect, useRef, type CSSProperties } from 'react'
import { FORUM_TEASER_THREAD_URL } from '../lib/forumTeaserImage'
import {
  CrtTeaserMedia,
  GrayFog,
  TeaserRedEyeGlow,
  supportsGrayFog,
  useCrtRevealLoop,
  useTeaserImageSrc,
  useTeaserReducedMotion,
} from '../effects'

/** Inline teaser: {@link CrtTeaserMedia} loop; {@link GrayFog} only when {@link supportsGrayFog} is true. */
export function ForumTeaserEventEmbed() {
  const reducedMotion = useTeaserReducedMotion()
  const { imgSrc, onImgError } = useTeaserImageSrc()
  const grayFogEnabled = supportsGrayFog(imgSrc)
  const { phase, introActive, grayFogVisible, beatId, startLoop, stopLoop, revealMs } =
    useCrtRevealLoop(grayFogEnabled)
  const rootRef = useRef<HTMLDivElement>(null)

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
        grayFogEnabled ? ' forum-teaser-embedded--gray-fog' : ''
      }${reducedMotion ? ' forum-teaser-embedded--reduced-motion' : ''}`}
      style={
        grayFogEnabled
          ? ({ '--event-teaser-reveal-ms': `${revealMs}ms` } as CSSProperties)
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
        <CrtTeaserMedia
          imgSrc={imgSrc}
          onImgError={onImgError}
          reducedMotion={reducedMotion}
          phase={phase}
          overlayActive={introActive}
        />
        {grayFogEnabled && !reducedMotion && (phase === 'reveal' || grayFogVisible) ? (
          <>
            <GrayFog />
            <TeaserRedEyeGlow fogPhase beatId={beatId} enabled={grayFogEnabled} />
          </>
        ) : null}
      </a>
    </div>
  )
}
