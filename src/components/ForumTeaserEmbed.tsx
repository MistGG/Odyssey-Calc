import { useEffect, useRef, type CSSProperties } from 'react'
import {
  CrtTeaserMedia,
  GrayFog,
  TeaserMarsmonEffects,
  TeaserRedEyeGlow,
  supportsMarsmonTeaserAmbience,
  useCrtRevealLoop,
  useTeaserImageSrc,
  useTeaserReducedMotion,
  useTeaserRedEyeIgnition,
} from '../effects'
import { FORUM_TEASER_THREAD_URL } from '../lib/forumTeaserImage'
import {
  archiveTeaserHasSavedEffectStack,
  liveTeaserHasSavedEffectStack,
} from '../lib/teaserEffectsPolicy'

export type ForumTeaserEmbedProps = {
  /** Direct image URL (archive) or omit for live forum teaser sync. */
  imageUrl?: string
  /** Imgur id for effect gating; archive entries with fullEffects pass this explicitly. */
  imgurId?: string
  /** Saved CRT + fog + eye stack (archive rows). */
  fullEffects?: boolean
  /** Event page: image only (no CRT, fog, red eye, or Marsmon ambience). */
  plainOnly?: boolean
  linkHref?: string
}

function PlainTeaserImage({
  imgSrc,
  onImgError,
  marsmonAmbience = false,
  reducedMotion = false,
}: {
  imgSrc: string
  onImgError: () => void
  marsmonAmbience?: boolean
  reducedMotion?: boolean
}) {
  return (
    <div className="forum-teaser-frame forum-teaser-frame--plain">
      <div className="forum-teaser-zoom">
        <img
          src={imgSrc}
          alt=""
          className="forum-teaser-img"
          decoding="async"
          width={1402}
          height={677}
          onError={onImgError}
        />
        {marsmonAmbience ? (
          <TeaserMarsmonEffects enabled={!reducedMotion} />
        ) : null}
      </div>
    </div>
  )
}

/**
 * Forum teaser stage. Live unknown images are plain; archive / saved ids get the full stack.
 */
export function ForumTeaserEmbed({
  imageUrl,
  imgurId,
  fullEffects = false,
  plainOnly = false,
  linkHref = FORUM_TEASER_THREAD_URL,
}: ForumTeaserEmbedProps) {
  const reducedMotion = useTeaserReducedMotion()
  const { imgSrc, onImgError } = useTeaserImageSrc(imageUrl)
  const effectsEnabled = plainOnly
    ? false
    : imgurId != null
      ? archiveTeaserHasSavedEffectStack(imgurId, fullEffects)
      : liveTeaserHasSavedEffectStack(imgSrc)
  const marsmonAmbience =
    !plainOnly &&
    !effectsEnabled &&
    supportsMarsmonTeaserAmbience(imgurId, imgSrc, imageUrl)

  const { phase, introActive, grayFogVisible, beatId, startLoop, stopLoop, revealMs } =
    useCrtRevealLoop(effectsEnabled)
  const fogPhase = effectsEnabled && (phase === 'reveal' || grayFogVisible)
  const redEyeEnabled = effectsEnabled
  const redEyeIgnition = useTeaserRedEyeIgnition(fogPhase, beatId, redEyeEnabled)
  const mechanoApproach = redEyeIgnition === 'awakened' && phase === 'reveal'
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!effectsEnabled || reducedMotion) {
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
  }, [effectsEnabled, reducedMotion, startLoop, stopLoop])

  return (
    <div
      ref={rootRef}
      className={`forum-teaser-embedded${effectsEnabled && phase === 'reveal' ? ' forum-teaser-embedded--reveal' : ''}${
        effectsEnabled ? ' forum-teaser-embedded--gray-fog' : ''
      }${marsmonAmbience ? ' forum-teaser-embedded--marsmon' : ''}${
        reducedMotion ? ' forum-teaser-embedded--reduced-motion' : ''
      }`}
      style={
        effectsEnabled
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
        {effectsEnabled ? (
          <>
            <CrtTeaserMedia
              imgSrc={imgSrc}
              onImgError={onImgError}
              reducedMotion={reducedMotion}
              phase={phase}
              overlayActive={introActive}
              mechanoApproach={mechanoApproach}
              stageOverlay={
                redEyeEnabled && !reducedMotion && fogPhase ? (
                  <TeaserRedEyeGlow fogPhase={fogPhase} beatId={beatId} enabled={redEyeEnabled} />
                ) : null
              }
            />
            {!reducedMotion && fogPhase ? <GrayFog /> : null}
          </>
        ) : (
          <PlainTeaserImage
            imgSrc={imgSrc}
            onImgError={onImgError}
            marsmonAmbience={marsmonAmbience}
            reducedMotion={reducedMotion}
          />
        )}
      </a>
    </div>
  )
}

