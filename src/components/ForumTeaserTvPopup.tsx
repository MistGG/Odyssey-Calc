import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  CRT_STATIC_HOLD_MS,
  CrtTeaserMedia,
  useTeaserImageSrc,
  useTeaserReducedMotion,
} from '../effects/CRT'
import {
  FORUM_TEASER_THREAD_URL,
  getForumTeaserIdentityKey,
  readForumTeaserPopupSeenIdentity,
  writeForumTeaserPopupSeenIdentity,
} from '../lib/forumTeaserImage'
import { liveTeaserHasSavedEffectStack } from '../lib/teaserEffectsPolicy'
import { supportsMarsmonTeaserAmbience, TeaserMarsmonEffects } from '../effects'

/** Wait after we know there is an unseen teaser before opening the flyout. */
const SHOW_DELAY_MS = 3000

/** @deprecated Use {@link CRT_STATIC_HOLD_MS} from `../effects/CRT`. */
export const FORUM_TEASER_STATIC_HOLD_MS = CRT_STATIC_HOLD_MS

/** @deprecated Use {@link CrtTeaserMedia} from `../effects/CRT`. */
export const ForumTeaserTvMedia = CrtTeaserMedia

export const useForumTeaserReducedMotion = useTeaserReducedMotion
export const useForumTeaserImageSrc = useTeaserImageSrc

export type ForumTeaserTvFlyoutProps = {
  open: boolean
  onDismiss: () => void
  imgSrc: string
  onImgError: () => void
  reducedMotion: boolean
  phase: 'static' | 'reveal'
  staticHoldMs?: number
  /** CRT static intro; false = plain image only (new/unconfigured teasers). */
  effectsEnabled?: boolean
  marsmonAmbience?: boolean
}

export function ForumTeaserTvFlyout({
  open,
  onDismiss,
  imgSrc,
  onImgError,
  reducedMotion,
  phase,
  staticHoldMs = CRT_STATIC_HOLD_MS,
  effectsEnabled = true,
  marsmonAmbience = false,
}: ForumTeaserTvFlyoutProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onDismiss])

  if (!open) return null

  return (
    <aside
      className={`forum-teaser-flyout forum-teaser-flyout--br${
        phase === 'reveal' ? ' forum-teaser-flyout--reveal' : ''
      }${reducedMotion ? ' forum-teaser-flyout--reduced-motion' : ''}`}
      role="dialog"
      aria-label="New Teaser"
    >
      <div className="forum-teaser-inner">
        <div className="forum-teaser-head">
          <span className="forum-teaser-title">New Teaser</span>
          <button type="button" className="forum-teaser-dismiss" onClick={onDismiss} aria-label="Dismiss">
            ×
          </button>
        </div>
        <a
          className="forum-teaser-media"
          href={FORUM_TEASER_THREAD_URL}
          target="_blank"
          rel="noreferrer noopener"
          aria-label="Open teasers thread on the Digital Odyssey forums"
        >
          {effectsEnabled ? (
            <CrtTeaserMedia
              imgSrc={imgSrc}
              onImgError={onImgError}
              reducedMotion={reducedMotion}
              phase={phase}
              overlayActive={open}
              staticHoldMs={staticHoldMs}
            />
          ) : (
            <div className="forum-teaser-frame forum-teaser-frame--plain">
              <div className="forum-teaser-zoom">
                <img
                  src={imgSrc}
                  alt=""
                  className="forum-teaser-img"
                  decoding="async"
                  width={943}
                  height={539}
                  onError={onImgError}
                />
                {marsmonAmbience ? (
                  <TeaserMarsmonEffects enabled={!reducedMotion} />
                ) : null}
              </div>
            </div>
          )}
        </a>
      </div>
    </aside>
  )
}

export function ForumTeaserTvPopup() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<'static' | 'reveal'>('static')
  const [identityKey, setIdentityKey] = useState('')
  const reducedMotion = useTeaserReducedMotion()
  const { imgSrc, onImgError, refreshTeaserImage } = useTeaserImageSrc()
  const effectsEnabled = liveTeaserHasSavedEffectStack(imgSrc)
  const marsmonAmbience = !effectsEnabled && supportsMarsmonTeaserAmbience(null, imgSrc)
  const revealTimerRef = useRef<number>(0)
  const scheduleTimerRef = useRef<number>(0)

  const bumpIdentity = useCallback(async () => {
    await refreshTeaserImage()
    setIdentityKey(getForumTeaserIdentityKey())
  }, [refreshTeaserImage])

  useEffect(() => {
    void bumpIdentity()
  }, [bumpIdentity])

  useEffect(() => {
    const id = window.setInterval(() => {
      void bumpIdentity()
    }, 30 * 60 * 1000)
    return () => clearInterval(id)
  }, [bumpIdentity])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      void bumpIdentity()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [bumpIdentity])

  useEffect(() => {
    window.clearTimeout(scheduleTimerRef.current)
    window.clearTimeout(revealTimerRef.current)
    setOpen(false)

    if (pathname === '/auth' || pathname === '/event') return
    if (!identityKey) return
    if (readForumTeaserPopupSeenIdentity() === identityKey) return

    scheduleTimerRef.current = window.setTimeout(() => {
      if (readForumTeaserPopupSeenIdentity() === identityKey) return
      writeForumTeaserPopupSeenIdentity(identityKey)
      setOpen(true)
      window.clearTimeout(revealTimerRef.current)
      if (!effectsEnabled || reducedMotion) {
        setPhase('reveal')
      } else {
        setPhase('static')
        revealTimerRef.current = window.setTimeout(() => setPhase('reveal'), CRT_STATIC_HOLD_MS)
      }
    }, SHOW_DELAY_MS)

    return () => {
      window.clearTimeout(scheduleTimerRef.current)
      window.clearTimeout(revealTimerRef.current)
    }
  }, [identityKey, pathname, reducedMotion, effectsEnabled])

  return (
    <ForumTeaserTvFlyout
      open={open}
      onDismiss={() => setOpen(false)}
      imgSrc={imgSrc}
      onImgError={onImgError}
      reducedMotion={reducedMotion}
      phase={phase}
      staticHoldMs={CRT_STATIC_HOLD_MS}
      effectsEnabled={effectsEnabled}
      marsmonAmbience={marsmonAmbience}
    />
  )
}
