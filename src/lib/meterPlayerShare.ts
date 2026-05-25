import type { PlayerFavoriteDigimon } from './meterPlayerProfile'
import { proxiedWikiAssetUrl } from './wikiAssetProxy'

export const METER_PROFILE_SHARE_BUCKET = 'meter-profile-shares'

export type MeterProfileShareSnapshot = {
  displayName: string
  peakDps: number
  bestEntryCount: number
  dungeonCount: number
  favoriteDigimon: PlayerFavoriteDigimon | null
  /** Changes each generation so Discord treats the share URL as new (cache bust). */
  shareCacheKey?: string
}

export type MeterProfileShareRow = {
  player_key: string
  display_name: string
  snapshot: MeterProfileShareSnapshot
  generated_at: string
}

const OG_WIDTH = 1200
const OG_HEIGHT = 630
const HOUR_MS = 60 * 60 * 1000
const GRID_SIZE = 48

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

/** Supabase storage URL (internal; used by dev middleware + CI sync). */
export function meterProfileShareStoragePublicUrl(
  supabaseUrl: string,
  playerKey: string,
  file: 'index.html' | 'og.png',
): string {
  const base = supabaseUrl.replace(/\/$/, '')
  const folder = encodeURIComponent(meterProfileShareStorageFolder(playerKey))
  return `${base}/storage/v1/object/public/${METER_PROFILE_SHARE_BUCKET}/${folder}/${file}`
}

export function meterProfileShareStorageFolder(playerKey: string): string {
  return playerKey.trim().toLowerCase()
}

const DEFAULT_METER_SHARE_PUBLIC_ORIGIN = 'https://share.odyssey-calc.com'

/** Paths on share.odyssey-calc.com (Worker), not GitHub Pages. */
export function meterProfileSharePublicPagePath(playerKey: string): string {
  const key = encodeURIComponent(meterProfileShareStorageFolder(playerKey))
  return `/meter-player/${key}.html`
}

export function meterProfileSharePublicOgImagePath(playerKey: string): string {
  const key = encodeURIComponent(meterProfileShareStorageFolder(playerKey))
  return `/meter-player/${key}-og.png`
}

/** Dev-only: Vite serves /share/meter-player/ from Supabase when env unset. */
export function meterProfileShareDevPagePath(playerKey: string): string {
  const key = encodeURIComponent(meterProfileShareStorageFolder(playerKey))
  return `/share/meter-player/${key}.html`
}

export function meterProfileShareDevOgImagePath(playerKey: string): string {
  const key = encodeURIComponent(meterProfileShareStorageFolder(playerKey))
  return `/share/meter-player/${key}-og.png`
}

function useDevSharePaths(): boolean {
  if (typeof window === 'undefined') return false
  return (
    isLocalHostname(window.location.hostname) &&
    !(import.meta.env.VITE_METER_SHARE_PUBLIC_ORIGIN as string | undefined)?.trim()
  )
}

/** Origin for Discord share links (Cloudflare Worker custom domain). */
export function resolveMeterSharePublicOrigin(): string {
  const fromEnv = (import.meta.env.VITE_METER_SHARE_PUBLIC_ORIGIN as string | undefined)?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (useDevSharePaths()) return window.location.origin
  return DEFAULT_METER_SHARE_PUBLIC_ORIGIN
}

/** New key on each generate/refresh — appended to share URLs for Discord cache busting. */
export function createMeterProfileShareCacheKey(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export function resolveMeterProfileShareCacheKey(
  snapshot: Pick<MeterProfileShareSnapshot, 'shareCacheKey'> | null | undefined,
  generatedAt?: string,
): string | undefined {
  const fromSnapshot = snapshot?.shareCacheKey?.trim()
  if (fromSnapshot) return fromSnapshot
  if (!generatedAt) return undefined
  const t = Date.parse(generatedAt)
  if (Number.isNaN(t)) return undefined
  return t.toString(36)
}

export function withMeterProfileShareCacheQuery(url: string, cacheKey: string | undefined): string {
  if (!cacheKey) return url
  try {
    const u = new URL(url)
    u.searchParams.set('d', cacheKey)
    return u.href
  } catch {
    const sep = url.includes('?') ? '&' : '?'
    return `${url}${sep}d=${encodeURIComponent(cacheKey)}`
  }
}

function meterProfileSharePageUrlBase(playerKey: string): string {
  const origin = resolveMeterSharePublicOrigin().replace(/\/$/, '')
  const path = useDevSharePaths()
    ? meterProfileShareDevPagePath(playerKey)
    : meterProfileSharePublicPagePath(playerKey)

  if (typeof window !== 'undefined' && useDevSharePaths()) {
    const { hostname, protocol, port } = window.location
    const devPort = port === '4173' ? '5173' : port || '5173'
    return `${protocol}//${hostname}:${devPort}${path}`
  }

  return `${origin}${path}`
}

function meterProfileShareOgImageUrlBase(playerKey: string): string {
  const origin = resolveMeterSharePublicOrigin().replace(/\/$/, '')
  const path = useDevSharePaths()
    ? meterProfileShareDevOgImagePath(playerKey)
    : meterProfileSharePublicOgImagePath(playerKey)

  if (typeof window !== 'undefined' && useDevSharePaths()) {
    const { hostname, protocol, port } = window.location
    const devPort = port === '4173' ? '5173' : port || '5173'
    return `${protocol}//${hostname}:${devPort}${path}`
  }

  return `${origin}${path}`
}

/** Public Discord / Open Graph page URL (share.odyssey-calc.com, not Supabase). */
export function meterProfileSharePageUrl(playerKey: string, cacheKey?: string): string {
  return withMeterProfileShareCacheQuery(meterProfileSharePageUrlBase(playerKey), cacheKey)
}

export function meterProfileShareOgImageUrl(playerKey: string, cacheKey?: string): string {
  return withMeterProfileShareCacheQuery(meterProfileShareOgImageUrlBase(playerKey), cacheKey)
}

export function resolveMeterShareSiteOrigin(): string {
  if (typeof window === 'undefined') {
    return (
      (import.meta.env.VITE_SITE_ORIGIN as string | undefined)?.trim() ||
      'https://mistgg.github.io/Odyssey-Calc'
    )
  }
  const base = import.meta.env.BASE_URL || '/'
  const root = base.endsWith('/') && base.length > 1 ? base.slice(0, -1) : base === '/' ? '' : base
  return `${window.location.origin}${root}`
}

export function meterProfileAppUrl(siteOrigin: string, playerKey: string): string {
  const base = siteOrigin.replace(/\/$/, '')
  const hash = `/meter/player/${encodeURIComponent(meterProfileShareStorageFolder(playerKey))}`
  return `${base}/#${hash}`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatInt(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function digimonInitial(name: string): string {
  const ch = name.trim().charAt(0)
  return ch ? ch.toUpperCase() : '?'
}

async function loadImageForCanvas(src: string): Promise<HTMLImageElement> {
  const fetchUrl = proxiedWikiAssetUrl(src)
  const res = await fetch(fetchUrl)
  if (!res.ok) throw new Error('image_fetch_failed')
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('image_decode_failed'))
      img.src = objectUrl
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function drawSiteGridBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#030712'
  ctx.fillRect(0, 0, OG_WIDTH, OG_HEIGHT)

  const glow1 = ctx.createRadialGradient(
    OG_WIDTH * 0.5,
    -OG_HEIGHT * 0.15,
    0,
    OG_WIDTH * 0.5,
    -OG_HEIGHT * 0.15,
    OG_WIDTH * 0.7,
  )
  glow1.addColorStop(0, 'rgba(14, 165, 233, 0.18)')
  glow1.addColorStop(0.5, 'transparent')
  ctx.fillStyle = glow1
  ctx.fillRect(0, 0, OG_WIDTH, OG_HEIGHT)

  const glow2 = ctx.createRadialGradient(
    OG_WIDTH,
    OG_HEIGHT * 0.5,
    0,
    OG_WIDTH,
    OG_HEIGHT * 0.5,
    OG_WIDTH * 0.45,
  )
  glow2.addColorStop(0, 'rgba(99, 102, 241, 0.08)')
  glow2.addColorStop(0.45, 'transparent')
  ctx.fillStyle = glow2
  ctx.fillRect(0, 0, OG_WIDTH, OG_HEIGHT)

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.03)'
  ctx.lineWidth = 1
  for (let x = 0; x <= OG_WIDTH; x += GRID_SIZE) {
    ctx.beginPath()
    ctx.moveTo(x + 0.5, 0)
    ctx.lineTo(x + 0.5, OG_HEIGHT)
    ctx.stroke()
  }
  for (let y = 0; y <= OG_HEIGHT; y += GRID_SIZE) {
    ctx.beginPath()
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(OG_WIDTH, y + 0.5)
    ctx.stroke()
  }

  const mask = ctx.createRadialGradient(
    OG_WIDTH * 0.5,
    0,
    0,
    OG_WIDTH * 0.5,
    0,
    OG_WIDTH * 0.55,
  )
  mask.addColorStop(0.2, 'rgba(3, 7, 18, 0)')
  mask.addColorStop(0.7, 'rgba(3, 7, 18, 0.85)')
  ctx.fillStyle = mask
  ctx.fillRect(0, 0, OG_WIDTH, OG_HEIGHT)
}

function drawDigimonInitialPortrait(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  initial: string,
) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.closePath()
  const grad = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius)
  grad.addColorStop(0, '#1e293b')
  grad.addColorStop(1, '#0f172a')
  ctx.fillStyle = grad
  ctx.fill()
  ctx.strokeStyle = 'rgba(96, 165, 250, 0.65)'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.fillStyle = 'rgba(34, 211, 238, 0.85)'
  ctx.font = `700 ${Math.round(radius * 0.9)}px "Exo 2", Segoe UI, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(initial, cx, cy)
  ctx.restore()
}

export async function renderMeterProfileShareOgPng(
  snapshot: MeterProfileShareSnapshot,
  portraitUrl?: string,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = OG_WIDTH
  canvas.height = OG_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas_unavailable')

  drawSiteGridBackground(ctx)

  ctx.fillStyle = '#67e8f9'
  ctx.font = '700 26px "Exo 2", Segoe UI, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('ODYSSEY CALC · METER', OG_WIDTH / 2, 72)

  ctx.fillStyle = '#f8fafc'
  ctx.font = '800 56px "Exo 2", Segoe UI, system-ui, sans-serif'
  ctx.fillText(snapshot.displayName, OG_WIDTH / 2, 150)

  const favoriteLine = snapshot.favoriteDigimon
    ? `Favorite: ${snapshot.favoriteDigimon.digimonName}`
    : 'Favorite digimon'
  ctx.fillStyle = '#94a3b8'
  ctx.font = '600 28px Segoe UI, system-ui, sans-serif'
  ctx.fillText(favoriteLine, OG_WIDTH / 2, 200)

  const stats = `Peak ${formatInt(snapshot.peakDps)} DPS · ${snapshot.bestEntryCount} bests · ${snapshot.dungeonCount} dungeons`
  ctx.font = '500 24px Segoe UI, system-ui, sans-serif'
  ctx.fillText(stats, OG_WIDTH / 2, 244)

  const cardX = 120
  const cardY = 290
  const cardW = OG_WIDTH - 240
  const cardH = 280
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'
  ctx.strokeStyle = 'rgba(96, 165, 250, 0.45)'
  ctx.lineWidth = 2
  roundRect(ctx, cardX, cardY, cardW, cardH, 18)
  ctx.fill()
  ctx.stroke()

  const size = 200
  const ix = OG_WIDTH / 2
  const iy = cardY + 36 + size / 2
  const radius = size / 2
  let drewPortrait = false

  if (portraitUrl?.trim()) {
    try {
      const img = await loadImageForCanvas(portraitUrl.trim())
      ctx.save()
      ctx.beginPath()
      ctx.arc(ix, iy, radius, 0, Math.PI * 2)
      ctx.closePath()
      ctx.clip()
      ctx.drawImage(img, ix - radius, iy - radius, size, size)
      ctx.restore()
      ctx.strokeStyle = 'rgba(96, 165, 250, 0.65)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(ix, iy, radius, 0, Math.PI * 2)
      ctx.stroke()
      drewPortrait = true
    } catch {
      drewPortrait = false
    }
  }

  if (!drewPortrait) {
    const initial = snapshot.favoriteDigimon
      ? digimonInitial(snapshot.favoriteDigimon.digimonName)
      : digimonInitial(snapshot.displayName)
    drawDigimonInitialPortrait(ctx, ix, iy, radius, initial)
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('png_export_failed'))),
      'image/png',
    )
  })
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

export function buildMeterProfileShareHtml(options: {
  snapshot: MeterProfileShareSnapshot
  sharePageUrl: string
  ogImageUrl: string
  appUrl: string
}): string {
  const { snapshot, sharePageUrl, ogImageUrl, appUrl } = options
  const title = `${snapshot.displayName} — Meter profile`
  const description = snapshot.favoriteDigimon
    ? `Peak ${formatInt(snapshot.peakDps)} DPS · Favorite ${snapshot.favoriteDigimon.digimonName} — Odyssey Calc`
    : `Peak ${formatInt(snapshot.peakDps)} DPS · ${snapshot.bestEntryCount} best parses — Odyssey Calc`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Odyssey Calc" />
  <meta property="og:url" content="${escapeHtml(sharePageUrl)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${escapeHtml(ogImageUrl)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}" />
  <meta http-equiv="refresh" content="0;url=${escapeHtml(appUrl)}" />
  <link rel="canonical" href="${escapeHtml(appUrl)}" />
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center;
      font-family: system-ui, sans-serif; color: #e2e8f0;
      background: #030712;
      background-image:
        linear-gradient(rgba(56, 189, 248, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(56, 189, 248, 0.03) 1px, transparent 1px);
      background-size: 48px 48px; }
    a { color: #7dd3fc; }
  </style>
</head>
<body>
  <p>Redirecting to <a href="${escapeHtml(appUrl)}">${escapeHtml(snapshot.displayName)}</a>…</p>
  <script>location.replace(${JSON.stringify(appUrl)});</script>
</body>
</html>`
}

export function shareCooldownRemainingMs(generatedAtIso: string, nowMs = Date.now()): number {
  const generated = Date.parse(generatedAtIso)
  if (Number.isNaN(generated)) return 0
  const remaining = generated + HOUR_MS - nowMs
  return Math.max(0, remaining)
}

export function canRefreshMeterProfileShare(generatedAtIso: string | null | undefined): boolean {
  if (!generatedAtIso) return true
  return shareCooldownRemainingMs(generatedAtIso) <= 0
}

export function formatShareCooldown(ms: number): string {
  if (ms <= 0) return ''
  const totalMin = Math.ceil(ms / 60_000)
  if (totalMin < 60) return `${totalMin} min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}
