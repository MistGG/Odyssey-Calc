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
}

export function ForumTeaserTvFlyout({
  open,
  onDismiss,
  imgSrc,
  onImgError,
  reducedMotion,
  phase,
  staticHoldMs = CRT_STATIC_HOLD_MS,
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
          <CrtTeaserMedia
            imgSrc={imgSrc}
            onImgError={onImgError}
            reducedMotion={reducedMotion}
            phase={phase}
            overlayActive={open}
            staticHoldMs={staticHoldMs}
          />
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
      setPhase('static')
      setOpen(true)
      window.clearTimeout(revealTimerRef.current)
      if (reducedMotion) {
        setPhase('reveal')
      } else {
        revealTimerRef.current = window.setTimeout(() => setPhase('reveal'), CRT_STATIC_HOLD_MS)
      }
    }, SHOW_DELAY_MS)

    return () => {
      window.clearTimeout(scheduleTimerRef.current)
      window.clearTimeout(revealTimerRef.current)
    }
  }, [identityKey, pathname, reducedMotion])

  return (
    <ForumTeaserTvFlyout
      open={open}
      onDismiss={() => setOpen(false)}
      imgSrc={imgSrc}
      onImgError={onImgError}
      reducedMotion={reducedMotion}
      phase={phase}
      staticHoldMs={CRT_STATIC_HOLD_MS}
    />
  )
}
