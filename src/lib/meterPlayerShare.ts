import {
  DEFAULT_METER_SHARE_PUBLIC_ORIGIN,
  resolveAppSiteOrigin,
} from '../config/site'
import type { PlayerFavoriteDigimon } from './meterPlayerProfile'
import { proxiedWikiAssetUrl } from './wikiAssetProxy'

export const METER_PROFILE_SHARE_BUCKET = 'meter-profile-shares'

export type MeterProfileShareSnapshot = {
  displayName: string
  peakDps: number
  bestEntryCount: number
  dungeonCount: number
  favoriteDigimon: PlayerFavoriteDigimon | null
  /** Hall of Fame record-break count (strict inductions). */
  hallOfFameRecordCount?: number
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

/** App origin for profile deep links (e.g. share page redirect target). */
export function resolveMeterShareSiteOrigin(): string {
  return resolveAppSiteOrigin()
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
  fontScale = 0.9,
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
  ctx.font = `700 ${Math.round(radius * fontScale)}px "Exo 2", Segoe UI, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(initial, cx, cy)
  ctx.restore()
}

async function drawPortraitInRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  ringRadius: number,
  imageSize: number,
  portraitUrl: string | undefined,
  fallbackInitial: string,
): Promise<void> {
  ctx.save()
  const ringGrad = ctx.createRadialGradient(
    cx - ringRadius * 0.3,
    cy - ringRadius * 0.35,
    0,
    cx,
    cy,
    ringRadius,
  )
  ringGrad.addColorStop(0, 'rgba(56, 189, 248, 0.2)')
  ringGrad.addColorStop(1, 'rgba(2, 6, 23, 0.9)')
  ctx.beginPath()
  ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2)
  ctx.fillStyle = ringGrad
  ctx.fill()
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)'
  ctx.lineWidth = 4
  ctx.stroke()

  const half = imageSize / 2
  let drew = false
  if (portraitUrl?.trim()) {
    try {
      const img = await loadImageForCanvas(portraitUrl.trim())
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, half, 0, Math.PI * 2)
      ctx.clip()
      ctx.drawImage(img, cx - half, cy - half, imageSize, imageSize)
      ctx.restore()
      drew = true
    } catch {
      drew = false
    }
  }
  if (!drew) {
    drawDigimonInitialPortrait(ctx, cx, cy, half - 2, fallbackInitial, 0.75)
  }
  ctx.restore()
}

const HOF_GOLD = '#e5cc80'
const HOF_GOLD_LIGHT = '#f0ddb0'

function drawHallOfFameMedallion(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  count: number,
) {
  const r = 18
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  const grad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r)
  grad.addColorStop(0, '#fff3c4')
  grad.addColorStop(0.45, HOF_GOLD)
  grad.addColorStop(1, '#b8860b')
  ctx.fillStyle = grad
  ctx.fill()
  ctx.strokeStyle = HOF_GOLD_LIGHT
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.fillStyle = '#1a1204'
  ctx.font = '900 16px Segoe UI, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(count), cx, cy + 1)
  ctx.restore()
}

function drawHallOfFameCrestIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const s = size / 2
  ctx.save()
  ctx.translate(cx, cy)
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2
    const px = Math.cos(angle) * s
    const py = Math.sin(angle) * s
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  const grad = ctx.createLinearGradient(-s, -s, s, s)
  grad.addColorStop(0, '#fff3c4')
  grad.addColorStop(0.5, HOF_GOLD)
  grad.addColorStop(1, '#b8860b')
  ctx.fillStyle = grad
  ctx.fill()
  ctx.strokeStyle = 'rgba(240, 221, 176, 0.5)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(0, 0, s * 0.22, 0, Math.PI * 2)
  ctx.fillStyle = HOF_GOLD
  ctx.fill()
  ctx.restore()
}

function drawHallOfFameBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  recordCount: number,
) {
  roundRect(ctx, x, y, w, h, 10)
  const bg = ctx.createLinearGradient(x, y, x + w, y + h)
  bg.addColorStop(0, 'rgba(229, 204, 128, 0.16)')
  bg.addColorStop(0.4, 'rgba(184, 134, 11, 0.08)')
  bg.addColorStop(1, 'rgba(0, 0, 0, 0.35)')
  ctx.fillStyle = bg
  ctx.fill()
  ctx.strokeStyle = 'rgba(229, 204, 128, 0.45)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  const crestCx = x + 28
  const crestCy = y + h / 2
  drawHallOfFameCrestIcon(ctx, crestCx, crestCy, 34)

  const textX = x + 54
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = HOF_GOLD
  ctx.font = '800 11px Segoe UI, system-ui, sans-serif'
  ctx.fillText('HALL OF FAME', textX, y + 14)

  const label = recordCount === 1 ? 'Record break' : 'Record breaks'
  ctx.fillStyle = HOF_GOLD_LIGHT
  ctx.font = '900 28px Segoe UI, system-ui, sans-serif'
  ctx.fillText(String(recordCount), textX, y + 30)
  const countW = ctx.measureText(String(recordCount)).width
  ctx.fillStyle = '#cbd5e1'
  ctx.font = '700 18px Segoe UI, system-ui, sans-serif'
  ctx.fillText(label, textX + countW + 10, y + 38)
}

function drawProfileStatBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  valueColor: string,
) {
  roundRect(ctx, x, y, w, h, 10)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)'
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  const compact = h < 68
  const labelSize = compact ? 11 : 13
  const valueSize = compact ? 22 : 28
  const labelY = compact ? 10 : 12
  const valueY = compact ? 28 : 34

  ctx.fillStyle = '#94a3b8'
  ctx.font = `700 ${labelSize}px Segoe UI, system-ui, sans-serif`
  ctx.fillText(label.toUpperCase(), x + 14, y + labelY)

  ctx.fillStyle = valueColor
  ctx.font = `800 ${valueSize}px Segoe UI, system-ui, sans-serif`
  ctx.fillText(value, x + 14, y + valueY)
}

function drawProfileCardChrome(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  roundRect(ctx, x, y, w, h, 14)
  const cardGrad = ctx.createLinearGradient(x, y, x + w * 0.6, y + h)
  cardGrad.addColorStop(0, 'rgba(12, 28, 48, 0.96)')
  cardGrad.addColorStop(0.55, 'rgba(8, 14, 26, 0.98)')
  cardGrad.addColorStop(1, 'rgba(6, 10, 18, 0.99)')
  ctx.fillStyle = cardGrad
  ctx.fill()
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)'
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.save()
  roundRect(ctx, x, y, w, h, 14)
  ctx.clip()
  const sheen = ctx.createRadialGradient(
    x + w * 0.12,
    y,
    0,
    x + w * 0.12,
    y,
    w * 0.55,
  )
  sheen.addColorStop(0, 'rgba(56, 189, 248, 0.14)')
  sheen.addColorStop(1, 'transparent')
  ctx.fillStyle = sheen
  ctx.fillRect(x, y, w, h)
  ctx.restore()
}

export async function renderMeterProfileShareOgPng(
  snapshot: MeterProfileShareSnapshot,
  portraitUrl?: string,
  options?: { peakDpsColor?: string },
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = OG_WIDTH
  canvas.height = OG_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas_unavailable')

  drawSiteGridBackground(ctx)

  ctx.fillStyle = '#67e8f9'
  ctx.font = '700 24px "Exo 2", Segoe UI, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('ODYSSEY CALC · METER', OG_WIDTH / 2, 52)

  const cardX = 44
  const cardY = 88
  const cardW = OG_WIDTH - 88
  const cardH = OG_HEIGHT - cardY - 44
  drawProfileCardChrome(ctx, cardX, cardY, cardW, cardH)

  const pad = 28
  const innerX = cardX + pad
  const innerW = cardW - pad * 2
  const innerTop = cardY + pad
  const innerBottom = cardY + cardH - pad
  const contentH = innerBottom - innerTop

  const statColW = 220
  const statGap = 10
  const statX = innerX + innerW - statColW

  const ringR = 52
  const portraitSize = 92
  const leftColW = ringR * 2 + 16
  const heroCx = innerX + ringR + 8
  const heroCy = innerTop + contentH / 2

  const mainX = innerX + leftColW + 18
  const identityW = statX - mainX - 16

  const favH = 96
  const topBlockH = contentH - favH - 14
  const statH = (topBlockH - statGap * 2) / 3
  const statY0 = innerTop

  const hofCount = Math.max(0, snapshot.hallOfFameRecordCount ?? 0)

  const fallbackInitial = snapshot.favoriteDigimon
    ? digimonInitial(snapshot.favoriteDigimon.digimonName)
    : digimonInitial(snapshot.displayName)
  await drawPortraitInRing(
    ctx,
    heroCx,
    heroCy,
    ringR,
    portraitSize,
    portraitUrl,
    fallbackInitial,
  )

  if (hofCount > 0) {
    drawHallOfFameMedallion(ctx, heroCx + ringR * 0.62, heroCy + ringR * 0.62, hofCount)
  }

  const nameY = innerTop + 6
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#64748b'
  ctx.font = '700 14px Segoe UI, system-ui, sans-serif'
  ctx.fillText('TAMER', mainX, nameY)

  ctx.fillStyle = '#f8fafc'
  ctx.font = '800 40px "Exo 2", Segoe UI, system-ui, sans-serif'
  ctx.fillText(snapshot.displayName, mainX, nameY + 22)

  if (hofCount > 0) {
    const badgeH = 68
    const badgeY = nameY + 22 + 44 + 10
    drawHallOfFameBadge(ctx, mainX, badgeY, identityW, badgeH, hofCount)
  }

  const peakColor = options?.peakDpsColor ?? (snapshot.peakDps > 0 ? '#e2e8f0' : '#64748b')

  drawProfileStatBox(
    ctx,
    statX,
    statY0,
    statColW,
    statH,
    'Peak DPS',
    snapshot.peakDps > 0 ? formatInt(snapshot.peakDps) : '—',
    peakColor,
  )
  drawProfileStatBox(
    ctx,
    statX,
    statY0 + statH + statGap,
    statColW,
    statH,
    'Best entries',
    String(snapshot.bestEntryCount),
    '#e2e8f0',
  )
  drawProfileStatBox(
    ctx,
    statX,
    statY0 + (statH + statGap) * 2,
    statColW,
    statH,
    'Dungeons',
    String(snapshot.dungeonCount),
    '#e2e8f0',
  )

  const favX = mainX
  const favY = innerTop + topBlockH + 14
  const favW = identityW
  roundRect(ctx, favX, favY, favW, favH, 10)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)'
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.fillStyle = '#64748b'
  ctx.font = '700 12px Segoe UI, system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('FAVORITE DIGIMON', favX + 14, favY + 12)

  if (snapshot.favoriteDigimon) {
    const iconSize = 36
    const iconCx = favX + 14 + iconSize / 2
    const iconCy = favY + 38 + (favH - 38) / 2
    await drawPortraitInRing(
      ctx,
      iconCx,
      iconCy,
      iconSize / 2 + 3,
      iconSize,
      portraitUrl,
      digimonInitial(snapshot.favoriteDigimon.digimonName),
    )

    const textX = favX + 14 + iconSize + 12
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#f1f5f9'
    ctx.font = '800 22px "Exo 2", Segoe UI, system-ui, sans-serif'
    ctx.fillText(snapshot.favoriteDigimon.digimonName, textX, iconCy - 10)

    const parseLabel = `Top DPS in ${snapshot.favoriteDigimon.parseCount} parse${
      snapshot.favoriteDigimon.parseCount === 1 ? '' : 's'
    }`
    ctx.fillStyle = '#94a3b8'
    ctx.font = '500 16px Segoe UI, system-ui, sans-serif'
    ctx.fillText(parseLabel, textX, iconCy + 14)
  } else {
    ctx.fillStyle = '#64748b'
    ctx.font = '500 18px Segoe UI, system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('No parse data yet', favX + 14, favY + favH / 2 + 8)
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
  const hofCount = Math.max(0, snapshot.hallOfFameRecordCount ?? 0)
  const hofPart =
    hofCount > 0
      ? ` · ${hofCount} Hall of Fame record break${hofCount === 1 ? '' : 's'}`
      : ''
  const description = snapshot.favoriteDigimon
    ? `Peak ${formatInt(snapshot.peakDps)} DPS${hofPart} · Favorite ${snapshot.favoriteDigimon.digimonName} — Odyssey Calc`
    : `Peak ${formatInt(snapshot.peakDps)} DPS${hofPart} · ${snapshot.bestEntryCount} best parses — Odyssey Calc`

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
  <link rel="canonical" href="${escapeHtml(sharePageUrl)}" />
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
  <p><strong>Unofficial fan site.</strong> Odyssey Calc meter profile preview, not Digital Odyssey.</p>
  <p>Open <a href="${escapeHtml(appUrl)}">${escapeHtml(snapshot.displayName)}&apos;s meter profile</a> on Odyssey Calc.</p>
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
