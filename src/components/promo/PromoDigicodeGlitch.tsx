import { useEffect, useRef } from 'react'

/** Obfuscated payload — decoded only in memory for canvas paint. */
const ENC = [0x17, 0x1b, 0x09, 0x0e, 0x1f, 0x17, 0x15, 0x14] as const
const KEY = 0x5a

function reveal(): string {
  return String.fromCharCode(...ENC.map((b) => b ^ KEY))
}

/**
 * Digicode glyph line painted to canvas so Elements inspect
 * does not expose plaintext in the DOM.
 */
export function PromoDigicodeGlitch() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const text = reveal()
    let raf = 0
    let disposed = false
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const paint = (t: number) => {
      if (disposed) return

      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const cssW = canvas.clientWidth || 220
      const cssH = canvas.clientHeight || 36
      const w = Math.max(1, Math.round(cssW * dpr))
      const h = Math.max(1, Math.round(cssH * dpr))

      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, cssW, cssH)

      const fontSize = Math.max(16, Math.min(22, cssW * 0.095))
      ctx.font = `400 ${fontSize}px Digicode, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.letterSpacing = '0.1em'

      const x = cssW / 2
      const y = cssH / 2
      const jitter =
        !reduceMotion && t % 2800 > 2570
          ? ((t % 47) - 23) * 0.08
          : 0

      const draw = (fill: string, ox: number, oy: number, shadow?: string) => {
        ctx.save()
        ctx.fillStyle = fill
        if (shadow) {
          ctx.shadowColor = shadow
          ctx.shadowBlur = 10
        }
        ctx.fillText(text, x + ox + jitter, y + oy)
        ctx.restore()
      }

      draw('rgba(165, 243, 252, 0.95)', 0, 0, 'rgba(34, 211, 238, 0.45)')

      if (!reduceMotion) {
        const phaseA = (t / 24) % 100
        const phaseB = (t / 19) % 100
        const oxA = phaseA < 40 ? -2.2 : phaseA < 70 ? 1.6 : -1.2
        const oxB = phaseB < 35 ? 2 : phaseB < 65 ? -1.8 : 1.4

        ctx.save()
        ctx.beginPath()
        ctx.rect(0, 0, cssW, cssH * 0.42)
        ctx.clip()
        draw('#67e8f9', oxA, 0)
        ctx.restore()

        ctx.save()
        ctx.beginPath()
        ctx.rect(0, cssH * 0.48, cssW, cssH)
        ctx.clip()
        draw('#f0abfc', oxB, 0)
        ctx.restore()
      }

      if (!reduceMotion) raf = requestAnimationFrame(paint)
    }

    let cancelled = false
    void document.fonts.load(`400 20px Digicode`).finally(() => {
      if (cancelled) return
      raf = requestAnimationFrame(paint)
    })

    const onResize = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(paint)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelled = true
      disposed = true
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <div className="promo-digicode" aria-hidden>
      <canvas className="promo-digicode__canvas" ref={canvasRef} />
    </div>
  )
}
