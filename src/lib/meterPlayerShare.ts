import type { PlayerFavoriteDigimon } from './meterPlayerProfile'

export const METER_PROFILE_SHARE_BUCKET = 'meter-profile-shares'

export type MeterProfileShareSnapshot = {
  displayName: string
  peakDps: number
  bestEntryCount: number
  dungeonCount: number
  favoriteDigimon: PlayerFavoriteDigimon | null
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

export function meterProfileShareStorageFolder(playerKey: string): string {
  return playerKey.trim().toLowerCase()
}

export function meterProfileSharePageUrl(supabaseUrl: string, playerKey: string): string {
  const base = supabaseUrl.replace(/\/$/, '')
  const folder = encodeURIComponent(meterProfileShareStorageFolder(playerKey))
  return `${base}/storage/v1/object/public/${METER_PROFILE_SHARE_BUCKET}/${folder}/index.html`
}

export function meterProfileShareOgImageUrl(supabaseUrl: string, playerKey: string): string {
  const base = supabaseUrl.replace(/\/$/, '')
  const folder = encodeURIComponent(meterProfileShareStorageFolder(playerKey))
  return `${base}/storage/v1/object/public/${METER_PROFILE_SHARE_BUCKET}/${folder}/og.png`
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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image_load_failed'))
    img.src = src
  })
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

  const bg = ctx.createLinearGradient(0, 0, OG_WIDTH, OG_HEIGHT)
  bg.addColorStop(0, '#0f172a')
  bg.addColorStop(1, '#020617')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, OG_WIDTH, OG_HEIGHT)

  ctx.fillStyle = 'rgba(56, 189, 248, 0.12)'
  ctx.beginPath()
  ctx.ellipse(200, 80, 280, 180, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#67e8f9'
  ctx.font = '700 26px Segoe UI, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('ODYSSEY CALC · METER', OG_WIDTH / 2, 72)

  ctx.fillStyle = '#f8fafc'
  ctx.font = '800 56px Segoe UI, system-ui, sans-serif'
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

  if (portraitUrl) {
    try {
      const img = await loadImage(portraitUrl)
      const size = 200
      const ix = OG_WIDTH / 2 - size / 2
      const iy = cardY + 36
      ctx.save()
      ctx.beginPath()
      ctx.arc(ix + size / 2, iy + size / 2, size / 2, 0, Math.PI * 2)
      ctx.closePath()
      ctx.clip()
      ctx.drawImage(img, ix, iy, size, size)
      ctx.restore()
      ctx.strokeStyle = 'rgba(96, 165, 250, 0.65)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(ix + size / 2, iy + size / 2, size / 2, 0, Math.PI * 2)
      ctx.stroke()
    } catch {
      ctx.fillStyle = '#64748b'
      ctx.font = '500 20px Segoe UI, system-ui, sans-serif'
      ctx.fillText('Portrait preview', OG_WIDTH / 2, cardY + cardH / 2)
    }
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
  const { snapshot, ogImageUrl, appUrl } = options
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
      background: #0f172a; color: #e2e8f0; font-family: system-ui, sans-serif; }
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
