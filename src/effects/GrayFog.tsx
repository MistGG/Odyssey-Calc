import { useEffect, useRef } from 'react'

type FogSide = 'bl' | 'br'
type FogMode = 'center' | 'bottom'

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
  tone: number
  mode: FogMode
  wobble: number
  lobes: FogLobe[]
  bornAt: number
}

const FOG_CENTER_X = 0.5
const FOG_CENTER_Y = 0.58
const FOG_SPEED = 0.15
const MAX_PUFFS = 34
const SPAWN_INTERVAL_MS = 1320
const SPAWN_ATTEMPTS = 14
const SPAWN_GAP_PAD = 0.068
const FOG_FADE_IN_MS = 1100
const BOTTOM_Y_MIN = 0.72
const BOTTOM_Y_MAX = 0.98

function toneForSide(side: FogSide): number {
  return side === 'bl' ? 68 + Math.random() * 18 : 62 + Math.random() * 16
}

function randomCloudLobes(): FogLobe[] {
  const count = 6 + Math.floor(Math.random() * 2)
  const lobes: FogLobe[] = []
  for (let i = 0; i < count; i += 1) {
    lobes.push({
      ox: (Math.random() - 0.5) * 1.35,
      oy: (Math.random() - 0.5) * 1.05,
      rMul: 0.38 + Math.random() * 0.48,
      alphaMul: 0.55 + Math.random() * 0.38,
    })
  }
  return lobes
}

function puffReach(p: FogPuff): number {
  let reach = p.r * 0.55
  for (const l of p.lobes) {
    const off = Math.hypot(l.ox, l.oy) + l.rMul
    reach = Math.max(reach, p.r * off)
  }
  return reach + SPAWN_GAP_PAD
}

function spawnBottomPuff(side: FogSide): FogPuff {
  const towardCenter = side === 'bl' ? 1 : -1
  return {
    x: side === 'bl' ? 0.02 + Math.random() * 0.28 : 0.7 + Math.random() * 0.28,
    y: 0.82 + Math.random() * 0.14,
    vx: towardCenter * (0.000015 + Math.random() * 0.000022) * FOG_SPEED,
    vy: (Math.random() - 0.5) * 0.000012 * FOG_SPEED,
    r: 0.14 + Math.random() * 0.16,
    alpha: 0.32 + Math.random() * 0.24,
    side,
    tone: toneForSide(side),
    mode: 'bottom',
    wobble: Math.random() * Math.PI * 2,
    lobes: randomCloudLobes(),
    bornAt: 0,
  }
}

function spawnCenterPuff(side: FogSide): FogPuff {
  if (side === 'bl') {
    return {
      x: 0.02 + Math.random() * 0.18,
      y: 0.84 + Math.random() * 0.12,
      vx: (0.000022 + Math.random() * 0.000028) * FOG_SPEED,
      vy: (-0.000012 - Math.random() * 0.000016) * FOG_SPEED,
      r: 0.15 + Math.random() * 0.17,
      alpha: 0.34 + Math.random() * 0.26,
      side,
      tone: toneForSide(side),
      mode: 'center',
      wobble: 0,
      lobes: randomCloudLobes(),
      bornAt: 0,
    }
  }
  return {
    x: 0.8 + Math.random() * 0.18,
    y: 0.84 + Math.random() * 0.12,
    vx: (-0.000022 - Math.random() * 0.000028) * FOG_SPEED,
    vy: (-0.000012 - Math.random() * 0.000016) * FOG_SPEED,
    r: 0.15 + Math.random() * 0.17,
    alpha: 0.34 + Math.random() * 0.26,
    side,
    tone: toneForSide(side),
    mode: 'center',
    wobble: 0,
    lobes: randomCloudLobes(),
    bornAt: 0,
  }
}

function spawnPuff(side: FogSide): FogPuff {
  return Math.random() < 0.58 ? spawnBottomPuff(side) : spawnCenterPuff(side)
}

function puffOverlapsExisting(candidate: FogPuff, puffs: readonly FogPuff[]): boolean {
  for (const p of puffs) {
    const dist = Math.hypot(candidate.x - p.x, candidate.y - p.y)
    const minDist = puffReach(candidate) + puffReach(p)
    if (dist < minDist) return true
  }
  return false
}

function fogFadeIn(now: number, bornAt: number): number {
  const t = Math.min(1, Math.max(0, (now - bornAt) / FOG_FADE_IN_MS))
  return t * t * (3 - 2 * t)
}

function trySpawnPuff(puffs: FogPuff[], side: FogSide, now: number): boolean {
  for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt += 1) {
    const candidate = spawnPuff(side)
    if (!puffOverlapsExisting(candidate, puffs)) {
      candidate.bornAt = now
      puffs.push(candidate)
      return true
    }
  }
  return false
}

/** Soft circular lobe — no hard ellipse edges. */
function fillCloudLobe(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  alpha: number,
  tone: number,
) {
  const t = tone | 0
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius)
  const core = `rgba(${t}, ${t + 1}, ${t + 2}, ${alpha * 0.78})`
  const mid = `rgba(${t - 6}, ${t - 5}, ${t - 4}, ${alpha * 0.54})`
  const soft = `rgba(${t - 12}, ${t - 11}, ${t - 10}, ${alpha * 0.26})`
  const edge = `rgba(${t - 18}, ${t - 17}, ${t - 16}, 0)`
  g.addColorStop(0, core)
  g.addColorStop(0.22, mid)
  g.addColorStop(0.55, soft)
  g.addColorStop(1, edge)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
}

function drawPuff(ctx: CanvasRenderingContext2D, w: number, h: number, p: FogPuff, now: number) {
  const fade = fogFadeIn(now, p.bornAt)
  if (fade <= 0.001) return

  const px = p.x * w
  const py = p.y * h
  const baseR = p.r * Math.min(w, h)
  const a = p.alpha * fade

  ctx.save()
  ctx.translate(px, py)
  for (const lobe of p.lobes) {
    fillCloudLobe(
      ctx,
      lobe.ox * baseR,
      lobe.oy * baseR,
      baseR * lobe.rMul,
      a * lobe.alphaMul,
      p.tone,
    )
  }
  ctx.restore()
}

function stepBottomPuff(p: FogPuff) {
  const dx = FOG_CENTER_X - p.x
  p.wobble += 0.005 * FOG_SPEED
  p.vx += dx * 0.000007 * FOG_SPEED
  p.vy += Math.sin(p.wobble) * 0.000003 * FOG_SPEED
  p.vx *= 0.9996
  p.vy *= 0.9996
  p.x += p.vx
  p.y += p.vy
  if (p.y < BOTTOM_Y_MIN) {
    p.y = BOTTOM_Y_MIN
    p.vy = Math.abs(p.vy) * 0.35
  }
  if (p.y > BOTTOM_Y_MAX) {
    p.y = BOTTOM_Y_MAX
    p.vy = -Math.abs(p.vy) * 0.35
  }
  if (p.side === 'bl' && p.x > 0.46) p.vx *= 0.92
  if (p.side === 'br' && p.x < 0.54) p.vx *= 0.92
  p.alpha *= 0.99985
}

function stepCenterPuff(p: FogPuff) {
  const dx = FOG_CENTER_X - p.x
  const dy = FOG_CENTER_Y - p.y
  const dist = Math.hypot(dx, dy)
  p.vx += dx * 0.000014 * FOG_SPEED
  p.vy += dy * 0.000011 * FOG_SPEED
  p.vx *= 0.9994
  p.vy *= 0.9994
  p.x += p.vx
  p.y += p.vy
  if (dist < 0.12) p.alpha *= 0.985
  if (p.alpha < 0.035 || dist < 0.05) return false
  return true
}

/** Reusable gray cloud fog overlay (canvas). Pair with {@link supportsGrayFog} gating. */
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
    let lastSpawn = 0
    let spawnToggle: FogSide = 'bl'

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
    for (let i = 0; i < 10; i += 1) {
      if (trySpawnPuff(puffs, i % 2 === 0 ? 'bl' : 'br', boot)) {
        puffs[puffs.length - 1]!.bornAt = boot - (10 - i) * 120
      }
    }

    const tick = (now: number) => {
      if (cancelled) return

      if (puffs.length < MAX_PUFFS && now - lastSpawn >= SPAWN_INTERVAL_MS) {
        lastSpawn = now
        trySpawnPuff(puffs, spawnToggle, now)
        spawnToggle = spawnToggle === 'bl' ? 'br' : 'bl'
      }

      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'soft-light'

      for (let i = puffs.length - 1; i >= 0; i -= 1) {
        const p = puffs[i]!
        if (p.mode === 'bottom') {
          stepBottomPuff(p)
          if (p.alpha < 0.04) {
            puffs.splice(i, 1)
            continue
          }
        } else {
          if (!stepCenterPuff(p)) {
            puffs.splice(i, 1)
            continue
          }
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
