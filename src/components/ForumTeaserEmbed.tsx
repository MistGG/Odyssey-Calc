import { useEffect, useRef, type CSSProperties } from 'react'
import {
  CrtTeaserMedia,
  GrayFog,
  supportsGrayFog,
  supportsGrayFogForImgurId,
  TeaserRedEyeGlow,
  useCrtRevealLoop,
  useTeaserImageSrc,
  useTeaserReducedMotion,
} from '../effects'
import { FORUM_TEASER_THREAD_URL } from '../lib/forumTeaserImage'

export type ForumTeaserEmbedProps = {
  /** Direct image URL (archive) or omit for live forum teaser sync. */
  imageUrl?: string
  /** Imgur id for effect gating; archive entries with fullEffects pass this explicitly. */
  imgurId?: string
  /** Force GrayFog + red eye regardless of live forum URL. */
  fullEffects?: boolean
  linkHref?: string
}

/**
 * CRT teaser stage with optional GrayFog + red eye. Used on Event and Teasers pages.
 */
export function ForumTeaserEmbed({
  imageUrl,
  imgurId,
  fullEffects = false,
  linkHref = FORUM_TEASER_THREAD_URL,
}: ForumTeaserEmbedProps) {
  const reducedMotion = useTeaserReducedMotion()
  const { imgSrc, onImgError } = useTeaserImageSrc(imageUrl)
  const grayFogEnabled =
    fullEffects || (imgurId ? supportsGrayFogForImgurId(imgurId) : supportsGrayFog(imgSrc))
  const redEyeEnabled = grayFogEnabled

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
        href={linkHref}
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
            {redEyeEnabled ? (
              <TeaserRedEyeGlow fogPhase beatId={beatId} enabled={redEyeEnabled} />
            ) : null}
          </>
        ) : null}
      </a>
    </div>
  )
}
