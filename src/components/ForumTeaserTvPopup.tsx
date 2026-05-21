import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  FORUM_TEASER_IMAGE_URL,
  FORUM_TEASER_THREAD_URL,
  getForumTeaserIdentityKey,
  readCachedTeaserBlob,
  readForumTeaserPopupSeenIdentity,
  syncForumTeaserImage,
  writeForumTeaserPopupSeenIdentity,
} from '../lib/forumTeaserImage'

/** Wait after we know there is an unseen teaser before opening the flyout. */
const SHOW_DELAY_MS = 3000

/**
 * How long the TV overlay runs before the flyout reveals the image:
 * heavy static → bands → heavy → bands → heavy → quick canvas fade to clear.
 */
export const FORUM_TEASER_STATIC_HOLD_MS = 4800

/** Timeline fractions of {@link FORUM_TEASER_STATIC_HOLD_MS} (must match {@link TvStatic}). */
export const FORUM_TEASER_OVERLAY_T1 = 0.11
export const FORUM_TEASER_OVERLAY_T2 = 0.3
export const FORUM_TEASER_OVERLAY_T3 = 0.42
export const FORUM_TEASER_OVERLAY_T4 = 0.54
/** End of final full-static beat; canvas alpha fades to 0 until {@link FORUM_TEASER_OVERLAY_CANVAS_FADE_END}. */
export const FORUM_TEASER_OVERLAY_T5 = 0.64
export const FORUM_TEASER_OVERLAY_CANVAS_FADE_END = 0.78

export type ForumTeaserOverlaySegment = 'heavy' | 'bands' | 'fade'

export function getForumTeaserOverlaySegment(tMs: number, holdMs: number): ForumTeaserOverlaySegment {
  const T1 = holdMs * FORUM_TEASER_OVERLAY_T1
  const T2 = holdMs * FORUM_TEASER_OVERLAY_T2
  const T3 = holdMs * FORUM_TEASER_OVERLAY_T3
  const T4 = holdMs * FORUM_TEASER_OVERLAY_T4
  const T5 = holdMs * FORUM_TEASER_OVERLAY_T5
  if (tMs < T1 || (tMs >= T2 && tMs < T3) || (tMs >= T4 && tMs < T5)) return 'heavy'
  if ((tMs >= T1 && tMs < T2) || (tMs >= T3 && tMs < T4)) return 'bands'
  return 'fade'
}

/** True only during drift-band segments; off for final static, canvas fade, and clear tail so the image is still before reveal. */
export function getForumTeaserCrtImageFxActive(tMs: number, holdMs: number): boolean {
  return getForumTeaserOverlaySegment(tMs, holdMs) === 'bands'
}

type DriftBand = {
  /** Vertical offset at t=0 (px). */
  phase: number
  /** Downward drift in px / ms. */
  speed: number
  /** Gaussian σ for soft horizontal strip (px). */
  sigma: number
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / Math.max(1e-6, edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function createDriftBands(h: number): DriftBand[] {
  /** At least three horizontal interference strips. */
  const n = 3 + Math.floor(Math.random() * 2)
  const period = h + 18
  const out: DriftBand[] = []
  for (let i = 0; i < n; i += 1) {
    out.push({
      phase: ((i + 0.35 * Math.random()) / n) * period + Math.random() * 4,
      speed: 0.001 + Math.random() * 0.0012,
      sigma: 0.88 + Math.random() * 0.5,
    })
  }
  return out
}

/** 0 = transparent; ~1 = center of a drift band (soft). */
function bandMaskAtY(y: number, tMs: number, bands: readonly DriftBand[], period: number): number {
  let m = 0
  for (const b of bands) {
    const cy = (b.phase + tMs * b.speed) % period
    const d0 = y - cy
    const d1 = y - cy + period
    const d2 = y - cy - period
    const dist = Math.min(Math.abs(d0), Math.abs(d1), Math.abs(d2))
    const g = Math.exp(-(dist * dist) / (2 * b.sigma * b.sigma))
    m = Math.max(m, g)
  }
  return m
}

/** Full-screen dense static (heavy snow). */
function fillHeavyStatic(d: Uint8ClampedArray, w: number, h: number, globalMul: number): void {
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4
      const v = (Math.random() * 232) | 0
      const a = Math.round((218 + ((Math.random() * 38) | 0)) * globalMul)
      d[i] = v
      d[i + 1] = v
      d[i + 2] = v
      d[i + 3] = a
    }
  }
}

/**
 * Only horizontal drift bands are drawn; every other pixel stays fully transparent (alpha 0)
 * so the image shows through clearly off-band.
 */
function fillBandsOnly(
  d: Uint8ClampedArray,
  w: number,
  h: number,
  tMs: number,
  bands: readonly DriftBand[],
  period: number,
  globalMul: number,
  peakAlpha: number,
): void {
  d.fill(0)
  const maskCut = 0.032
  for (let y = 0; y < h; y += 1) {
    const mask = bandMaskAtY(y, tMs, bands, period)
    if (mask < maskCut) continue
    for (let x = 0; x < w; x += 1) {
      const mx = mask * (0.94 + 0.06 * Math.sin(x * 0.19 + tMs * 0.0012))
      if (mx < maskCut) continue
      const i = (y * w + x) * 4
      const aFloat = Math.min(0.38, mx * peakAlpha) * globalMul
      const a = Math.round(aFloat * 255)
      if (a < 3) continue
      const gv = 218 + ((((x + y * 3 + ((tMs * 0.002) | 0)) % 5) + 5) % 5) - 2
      d[i] = gv
      d[i + 1] = gv
      d[i + 2] = gv
      d[i + 3] = a
    }
  }
}

function TvStatic({
  noiseActive,
  reducedMotion,
  holdMs,
}: {
  noiseActive: boolean
  reducedMotion: boolean
  holdMs: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const noiseRef = useRef(noiseActive)
  noiseRef.current = noiseActive

  useEffect(() => {
    if (!noiseActive || reducedMotion) return
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    const w = 88
    const h = 50
    c.width = w
    c.height = h

    const bands = createDriftBands(h)
    const period = h + 18

    const T1 = holdMs * FORUM_TEASER_OVERLAY_T1
    const T2 = holdMs * FORUM_TEASER_OVERLAY_T2
    const T3 = holdMs * FORUM_TEASER_OVERLAY_T3
    const T4 = holdMs * FORUM_TEASER_OVERLAY_T4
    const T5 = holdMs * FORUM_TEASER_OVERLAY_T5
    const fadeEnd = holdMs * FORUM_TEASER_OVERLAY_CANVAS_FADE_END

    const start = performance.now()
    let raf = 0
    let cancelled = false

    const loop = (now: number) => {
      if (cancelled || !noiseRef.current) return
      const t = now - start
      if (t >= holdMs) return

      const fadeOutMul = t < T5 ? 1 : 1 - smoothstep(T5, fadeEnd, t)

      const img = ctx.createImageData(w, h)
      const d = img.data

      if (t < T1) {
        fillHeavyStatic(d, w, h, fadeOutMul)
      } else if (t < T2) {
        fillBandsOnly(d, w, h, t, bands, period, fadeOutMul, 0.34)
      } else if (t < T3) {
        fillHeavyStatic(d, w, h, fadeOutMul)
      } else if (t < T4) {
        fillBandsOnly(d, w, h, t, bands, period, fadeOutMul, 0.34)
      } else {
        fillHeavyStatic(d, w, h, fadeOutMul)
      }

      ctx.putImageData(img, 0, 0)
      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [noiseActive, reducedMotion, holdMs])

  if (reducedMotion) return null
  return <canvas ref={ref} className="forum-teaser-static-canvas" aria-hidden width={88} height={50} />
}

export type ForumTeaserTvMediaProps = {
  imgSrc: string
  onImgError: () => void
  reducedMotion: boolean
  phase: 'static' | 'reveal'
  /** When false, overlay / CRT timing is paused (e.g. flyout closed). */
  overlayActive?: boolean
  staticHoldMs?: number
}

/** Teaser frame: image, TV static canvas, and CRT warp during band segments. */
export function ForumTeaserTvMedia({
  imgSrc,
  onImgError,
  reducedMotion,
  phase,
  overlayActive = true,
  staticHoldMs = FORUM_TEASER_STATIC_HOLD_MS,
}: ForumTeaserTvMediaProps) {
  const [crtImageFxActive, setCrtImageFxActive] = useState(false)
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const overlayRafRef = useRef(0)
  const overlayT0Ref = useRef<number | null>(null)
  const prevCrtFxRef = useRef<boolean | null>(null)

  useEffect(() => {
    if (!overlayActive || reducedMotion) {
      prevCrtFxRef.current = null
      setCrtImageFxActive(false)
      return
    }
    if (phase !== 'static') {
      prevCrtFxRef.current = null
      setCrtImageFxActive(false)
      return
    }

    overlayT0Ref.current = performance.now()
    prevCrtFxRef.current = null

    const tick = (now: number) => {
      if (overlayT0Ref.current == null) return
      if (phaseRef.current !== 'static') return
      const elapsed = now - overlayT0Ref.current
      if (elapsed >= staticHoldMs) {
        if (prevCrtFxRef.current !== false) {
          prevCrtFxRef.current = false
          setCrtImageFxActive(false)
        }
        return
      }
      const isCrtFx = getForumTeaserCrtImageFxActive(elapsed, staticHoldMs)
      if (prevCrtFxRef.current !== isCrtFx) {
        prevCrtFxRef.current = isCrtFx
        setCrtImageFxActive(isCrtFx)
      }
      overlayRafRef.current = requestAnimationFrame(tick)
    }

    overlayRafRef.current = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(overlayRafRef.current)
    }
  }, [overlayActive, phase, reducedMotion, staticHoldMs])

  return (
    <div
      className={`forum-teaser-frame${phase === 'static' ? ' forum-teaser-frame--static' : ''}${
        crtImageFxActive ? ' forum-teaser-frame--crt-image-fx' : ''
      }`}
    >
      <img
        src={imgSrc}
        alt=""
        className="forum-teaser-img"
        decoding="async"
        width={943}
        height={539}
        onError={onImgError}
      />
      {!reducedMotion ? (
        <TvStatic noiseActive={phase === 'static' && overlayActive} reducedMotion={reducedMotion} holdMs={staticHoldMs} />
      ) : null}
    </div>
  )
}

export function useForumTeaserReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const set = () => setReducedMotion(mq.matches)
    set()
    mq.addEventListener('change', set)
    return () => mq.removeEventListener('change', set)
  }, [])
  return reducedMotion
}

export function useForumTeaserImageSrc() {
  const [imgSrc, setImgSrc] = useState(FORUM_TEASER_IMAGE_URL)
  const blobUrlRef = useRef<string | null>(null)

  const disposeBlobUrl = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
  }, [])

  const applyBlobToSrc = useCallback(async () => {
    const blob = await readCachedTeaserBlob()
    if (!blob || blob.size === 0) {
      disposeBlobUrl()
      setImgSrc(FORUM_TEASER_IMAGE_URL)
      return
    }
    disposeBlobUrl()
    const u = URL.createObjectURL(blob)
    blobUrlRef.current = u
    setImgSrc(u)
  }, [disposeBlobUrl])

  const refreshTeaserImage = useCallback(async () => {
    await applyBlobToSrc()
    const changed = await syncForumTeaserImage()
    if (changed) await applyBlobToSrc()
  }, [applyBlobToSrc])

  const onImgError = useCallback(() => {
    disposeBlobUrl()
    setImgSrc(FORUM_TEASER_IMAGE_URL)
  }, [disposeBlobUrl])

  useEffect(() => {
    void refreshTeaserImage()
  }, [refreshTeaserImage])

  useEffect(() => () => disposeBlobUrl(), [disposeBlobUrl])

  return { imgSrc, onImgError, refreshTeaserImage }
}

export type ForumTeaserTvFlyoutProps = {
  open: boolean
  onDismiss: () => void
  imgSrc: string
  onImgError: () => void
  reducedMotion: boolean
  phase: 'static' | 'reveal'
  staticHoldMs?: number
}

/** Presentational flyout (fixed bottom-right). Used by {@link ForumTeaserTvPopup}. */
export function ForumTeaserTvFlyout({
  open,
  onDismiss,
  imgSrc,
  onImgError,
  reducedMotion,
  phase,
  staticHoldMs = FORUM_TEASER_STATIC_HOLD_MS,
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
          <ForumTeaserTvMedia
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
  const reducedMotion = useForumTeaserReducedMotion()
  const { imgSrc, onImgError, refreshTeaserImage } = useForumTeaserImageSrc()
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
    // Once per teaser file (Last-Modified / ETag); new forum image → new identity → plays again.
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
        revealTimerRef.current = window.setTimeout(() => setPhase('reveal'), FORUM_TEASER_STATIC_HOLD_MS)
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
      staticHoldMs={FORUM_TEASER_STATIC_HOLD_MS}
    />
  )
}
