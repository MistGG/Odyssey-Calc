/**
 * Decode full wiki portraits once, keep only tiny bitmap thumbs.
 * Full-resolution `<img>` tags at 16×16 CSS still decode multi‑MB bitmaps each —
 * with ~400 Digimon that balloons tab RAM into the GB range.
 */

const THUMB_CSS_PX = 16
const THUMB_CACHE_MAX = 500

type ThumbEntry = {
  url: string
  lastUsed: number
}

const thumbCache = new Map<string, ThumbEntry>()
const inflight = new Map<string, Promise<string | null>>()

function deviceThumbPx(): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  return Math.max(THUMB_CSS_PX, Math.round(THUMB_CSS_PX * Math.min(dpr, 2)))
}

function evictOldestThumbs() {
  if (thumbCache.size <= THUMB_CACHE_MAX) return
  const ranked = [...thumbCache.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)
  const drop = thumbCache.size - THUMB_CACHE_MAX
  for (let i = 0; i < drop; i++) {
    const key = ranked[i]?.[0]
    if (!key) break
    const entry = thumbCache.get(key)
    thumbCache.delete(key)
    if (entry?.url.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(entry.url)
      } catch {
        /* ignore */
      }
    }
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('thumb load failed'))
    img.src = src
  })
}

async function rasterizeThumb(src: string): Promise<string | null> {
  try {
    const img = await loadImage(src)
    const size = deviceThumbPx()
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'medium'
    // Cover-fit like CSS object-fit: cover
    const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight)
    const w = img.naturalWidth * scale
    const h = img.naturalHeight * scale
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.85),
    )
    if (!blob) {
      const fallback = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png'),
      )
      if (!fallback) return null
      return URL.createObjectURL(fallback)
    }
    return URL.createObjectURL(blob)
  } catch {
    return null
  }
}

/** Returns a blob: URL for a tiny thumb, or null if rasterize failed. */
export function getDigimonThumbUrl(fullSrc: string): Promise<string | null> {
  const existing = thumbCache.get(fullSrc)
  if (existing) {
    existing.lastUsed = Date.now()
    return Promise.resolve(existing.url)
  }
  const pending = inflight.get(fullSrc)
  if (pending) return pending

  const job = rasterizeThumb(fullSrc)
    .then((url) => {
      inflight.delete(fullSrc)
      if (!url) return null
      thumbCache.set(fullSrc, { url, lastUsed: Date.now() })
      evictOldestThumbs()
      return url
    })
    .catch(() => {
      inflight.delete(fullSrc)
      return null
    })

  inflight.set(fullSrc, job)
  return job
}
