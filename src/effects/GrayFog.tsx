import { useEffect, useRef } from 'react'
import { fogColorSpawn, lightenFogColor, type FogRgb } from './grayFogPalette'

type FogSide = 'bl' | 'br'

type FogLobe = {
  ox: number
  oy: number
  rMul: number
  alphaMul: number
}

type FogPuff = {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  alpha: number
  side: FogSide
  color: FogRgb
  laneY: number
  wobble: number
  lobes: FogLobe[]
  bornAt: number
}

const FOG_CENTER_X = 0.5
const FOG_SPEED = 0.24
const MAX_PUFFS = 28
const MAX_PUFFS_PER_SIDE = 14
const SPAWN_INTERVAL_MS = 1550
const SPAWN_ATTEMPTS = 12
const SPAWN_GAP_PAD = 0.14
const FOG_FADE_IN_MS = 900

/** Bottom band — fog stays low along the image floor. */
const BOTTOM_Y_MIN = 0.82
const BOTTOM_Y_MAX = 0.98
const BOTTOM_LANE_Y = 0.9

/** Fade out in the middle gap before left/right wisps meet. */
const BL_FADE_START = 0.28
const BL_FADE_END = 0.41
const BR_FADE_START = 0.72
const BR_FADE_END = 0.59

const BL_SPAWN_X = 0.06
const BR_SPAWN_X = 0.94

/** Minimum lighten/opacity at spawn (matches ~2s-in look without waiting to drift). */
const SPAWN_APPROACH_FLOOR = 0.56
const AGE_APPROACH_MS = 600

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / Math.max(1e-6, edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** 0 at corner spawn, 1 at the inner edge before the center dissolve gap. */
function centerApproachT(p: FogPuff): number {
  if (p.side === 'bl') {
    return smoothstep(BL_SPAWN_X, BL_FADE_START, p.x)
  }
  const raw = (BR_SPAWN_X - p.x) / (BR_SPAWN_X - BR_FADE_START)
  return smoothstep(0, 1, Math.min(1, Math.max(0, raw)))
}

function displayApproachT(p: FogPuff, now: number): number {
  const posT = centerApproachT(p)
  const ageT = smoothstep(0, AGE_APPROACH_MS, now - p.bornAt) * SPAWN_APPROACH_FLOOR
  return Math.min(1, Math.max(SPAWN_APPROACH_FLOOR, posT, ageT))
}

function randomCloudLobes(): FogLobe[] {
  const count = 5 + Math.floor(Math.random() * 2)
  const lobes: FogLobe[] = []
  for (let i = 0; i < count; i += 1) {
    lobes.push({
      ox: (Math.random() - 0.5) * 1.35,
      oy: (Math.random() - 0.5) * 0.65,
      rMul: 0.44 + Math.random() * 0.5,
      alphaMul: 0.52 + Math.random() * 0.32,
    })
  }
  return lobes
}

function puffReach(p: FogPuff): number {
  let reach = p.r * 0.58
  for (const l of p.lobes) {
    const off = Math.hypot(l.ox, l.oy) + l.rMul
    reach = Math.max(reach, p.r * off)
  }
  return reach + SPAWN_GAP_PAD
}

function spawnCornerPuff(side: FogSide): FogPuff {
  const towardCenter = side === 'bl' ? 1 : -1
  return {
    x: side === 'bl' ? 0.02 + Math.random() * 0.2 : 0.78 + Math.random() * 0.2,
    y: BOTTOM_LANE_Y + (Math.random() - 0.5) * 0.1,
    vx: towardCenter * (0.000042 + Math.random() * 0.000052) * FOG_SPEED,
    vy: (Math.random() - 0.5) * 0.000003 * FOG_SPEED,
    r: 0.28 + Math.random() * 0.22,
    alpha: 0.38 + Math.random() * 0.2,
    side,
    color: fogColorSpawn(side),
    laneY: BOTTOM_LANE_Y + (Math.random() - 0.5) * 0.08,
    wobble: Math.random() * Math.PI * 2,
    lobes: randomCloudLobes(),
    bornAt: 0,
  }
}

function puffOverlapsExisting(candidate: FogPuff, puffs: readonly FogPuff[]): boolean {
  for (const p of puffs) {
    if (p.side !== candidate.side) continue
    const dist = Math.hypot(candidate.x - p.x, candidate.y - p.y)
    const minDist = (puffReach(candidate) + puffReach(p)) * 1.08
    if (dist < minDist) return true
  }
  return false
}

function fogFadeIn(now: number, bornAt: number): number {
  const t = Math.min(1, Math.max(0, (now - bornAt) / FOG_FADE_IN_MS))
  return t * t * (3 - 2 * t)
}

/** Final dissolve in the middle gap (after brighten ramp peaks). */
function centerDissolveMul(p: FogPuff): number {
  if (p.side === 'bl') {
    if (p.x <= BL_FADE_START) return 1
    if (p.x >= BL_FADE_END) return 0
    const t = (p.x - BL_FADE_START) / (BL_FADE_END - BL_FADE_START)
    return 1 - t * t * (3 - 2 * t)
  }
  if (p.x >= BR_FADE_START) return 1
  if (p.x <= BR_FADE_END) return 0
  const t = (BR_FADE_START - p.x) / (BR_FADE_START - BR_FADE_END)
  return 1 - t * t * (3 - 2 * t)
}

function countSide(puffs: readonly FogPuff[], side: FogSide): number {
  let n = 0
  for (const p of puffs) {
    if (p.side === side) n += 1
  }
  return n
}

function trySpawnPuff(puffs: FogPuff[], side: FogSide, now: number): boolean {
  if (countSide(puffs, side) >= MAX_PUFFS_PER_SIDE) return false
  for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt += 1) {
    const candidate = spawnCornerPuff(side)
    if (!puffOverlapsExisting(candidate, puffs)) {
      candidate.bornAt = now
      puffs.push(candidate)
      return true
    }
  }
  return false
}

function fillCloudLobe(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  alpha: number,
  color: FogRgb,
) {
  const { r, g, b } = color
  const grad = ctx.createRadialGradient(x, y, 0, x, y, radius)
  const core = `rgba(${r}, ${g}, ${b}, ${alpha * 0.92})`
  const mid = `rgba(${Math.max(0, r - 4)}, ${Math.max(0, g - 5)}, ${Math.max(0, b - 6)}, ${alpha * 0.72})`
  const soft = `rgba(${Math.max(0, r - 10)}, ${Math.max(0, g - 12)}, ${Math.max(0, b - 14)}, ${alpha * 0.38})`
  const edge = `rgba(${Math.max(0, r - 16)}, ${Math.max(0, g - 18)}, ${Math.max(0, b - 20)}, 0)`
  grad.addColorStop(0, core)
  grad.addColorStop(0.2, mid)
  grad.addColorStop(0.52, soft)
  grad.addColorStop(1, edge)
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
}

function drawPuff(ctx: CanvasRenderingContext2D, w: number, h: number, p: FogPuff, now: number) {
  const approach = displayApproachT(p, now)
  const dissolve = centerDissolveMul(p)
  const fade = fogFadeIn(now, p.bornAt) * dissolve
  if (fade <= 0.001) return

  const litColor = lightenFogColor(p.color, approach)
  const opacityBoost = 0.78 + 0.28 * approach
  const px = p.x * w
  const py = p.y * h
  const baseR = p.r * Math.min(w, h)
  const a = p.alpha * fade * opacityBoost

  ctx.save()
  ctx.translate(px, py)
  for (const lobe of p.lobes) {
    fillCloudLobe(
      ctx,
      lobe.ox * baseR,
      lobe.oy * baseR,
      baseR * lobe.rMul,
      a * lobe.alphaMul,
      litColor,
    )
  }
  ctx.restore()
}

/** Drift along the bottom from a corner toward center; dissolve in the middle gap. */
function stepCornerPuff(p: FogPuff): boolean {
  const towardCenter = p.side === 'bl' ? 1 : -1
  const dx = FOG_CENTER_X - p.x

  p.wobble += 0.005 * FOG_SPEED
  p.vx += towardCenter * Math.abs(dx) * 0.00002 * FOG_SPEED
  p.vy += (p.laneY - p.y) * 0.00006 * FOG_SPEED
  p.vy += Math.sin(p.wobble) * 0.0000018 * FOG_SPEED

  const maxV = 0.00042 * FOG_SPEED
  if (p.side === 'bl' && p.vx > maxV) p.vx = maxV
  if (p.side === 'br' && p.vx < -maxV) p.vx = -maxV
  p.vx *= 0.9996
  p.vy *= 0.92

  p.x += p.vx
  p.y += p.vy

  if (p.y < BOTTOM_Y_MIN) {
    p.y = BOTTOM_Y_MIN
    p.vy = Math.abs(p.vy) * 0.25
  }
  if (p.y > BOTTOM_Y_MAX) {
    p.y = BOTTOM_Y_MAX
    p.vy = -Math.abs(p.vy) * 0.25
  }

  p.alpha *= 0.9996

  if (centerDissolveMul(p) <= 0.02) return false
  if (p.side === 'bl' && p.x >= BL_FADE_END) return false
  if (p.side === 'br' && p.x <= BR_FADE_END) return false
  if (p.alpha < 0.03) return false
  return true
}

/**
 * Reusable gray cloud fog overlay (canvas). Pair with {@link supportsGrayFog} gating.
 * Event embed also uses {@link TeaserRedEyeGlow} during the fog phase.
 */
export function GrayFog() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = 0
    let h = 0
    let raf = 0
    let cancelled = false
    const puffs: FogPuff[] = []
    let lastSpawnBl = 0
    let lastSpawnBr = 0

    const resize = () => {
      const rect = wrap.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = Math.max(1, Math.floor(rect.width))
      h = Math.max(1, Math.floor(rect.height))
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    resize()

    const boot = performance.now()
    for (let i = 0; i < 6; i += 1) {
      const side: FogSide = i % 2 === 0 ? 'bl' : 'br'
      if (trySpawnPuff(puffs, side, boot)) {
        puffs[puffs.length - 1]!.bornAt = boot - (6 - i) * 140
      }
    }

    const tick = (now: number) => {
      if (cancelled) return

      if (puffs.length < MAX_PUFFS) {
        if (now - lastSpawnBl >= SPAWN_INTERVAL_MS) {
          lastSpawnBl = now
          trySpawnPuff(puffs, 'bl', now)
        }
        if (now - lastSpawnBr >= SPAWN_INTERVAL_MS) {
          lastSpawnBr = now
          trySpawnPuff(puffs, 'br', now)
        }
      }

      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'soft-light'

      for (let i = puffs.length - 1; i >= 0; i -= 1) {
        const p = puffs[i]!
        if (!stepCornerPuff(p)) {
          puffs.splice(i, 1)
          continue
        }
        drawPuff(ctx, w, h, p, now)
      }

      ctx.globalCompositeOperation = 'source-over'
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return (
    <div ref={wrapRef} className="gray-fog" aria-hidden>
      <canvas ref={canvasRef} className="gray-fog__canvas" />
    </div>
  )
}
