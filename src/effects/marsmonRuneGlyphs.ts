/** Per-glyph layout for 6JQlbLZ — uniform tiles, word gaps, no overlap. */

export type MarsmonRuneGlyph = {
  char: string
  xPct: number
  yPct: number
  wPct: number
  hPct: number
  flipIndex: number
}

export const MARSMON_RUNE_FLIP_BASE_MS = 2000
export const MARSMON_RUNE_FLIP_STAGGER_MS = 115

const TILE_EDGE_GAP_PCT = 0.1
/** Extra space between words (visible word break). */
const WORD_GAP_PCT = 1.35

export const MARSMON_RUNE_TILE_W_PCT = 4.85
export const MARSMON_RUNE_TILE_H_PCT = 5.55

const MIN_LETTER_GAP = MARSMON_RUNE_TILE_W_PCT + TILE_EDGE_GAP_PCT
const MIN_WORD_GAP = MIN_LETTER_GAP + WORD_GAP_PCT

const X_NUDGE_LEFT = 3.25

/** Row centers — keep these fixed when tuning tile size. */
const Y_LINE1 = 6.13
const Y_LINE2 = 13.49
const Y_LINE3 = 20.79

const X_SHIFT_LEFT = 8

const TEASER_ART_H_PX = 677

function yDownPx(px: number): number {
  return +((px / TEASER_ART_H_PX) * 100).toFixed(2)
}

type WordSpec = {
  text: string
  xStart: number
  xEnd: number
  /** Nudge this word left (% width). */
  xShiftLeft?: number
}

type LineSpec = {
  yPct: number
  words: readonly WordSpec[]
  /** Extra shift left (% width) for this row only. */
  xShiftLeft?: number
  /** Extra shift right (% width) for this row only. */
  xShiftRight?: number
  /** Extra shift down (% height) for this row only. */
  yShiftDown?: number
}

function shiftX(x: number): number {
  return +(x - X_NUDGE_LEFT).toFixed(2)
}

function centersInSpan(charCount: number, xStart: number, xEnd: number): number[] {
  if (charCount <= 0) return []
  const start = shiftX(xStart)
  const end = shiftX(xEnd)
  if (charCount === 1) return [+((start + end) / 2).toFixed(2)]

  const span = end - start
  const needed = (charCount - 1) * MIN_LETTER_GAP

  if (needed <= span) {
    const offset = (span - needed) / 2
    return Array.from({ length: charCount }, (_, i) =>
      +(start + offset + i * MIN_LETTER_GAP).toFixed(2),
    )
  }

  return Array.from({ length: charCount }, (_, i) =>
    +(start + (span * i) / (charCount - 1)).toFixed(2),
  )
}

function buildLine(line: LineSpec, startFlip: number): MarsmonRuneGlyph[] {
  const out: MarsmonRuneGlyph[] = []
  let flip = startFlip
  let lastCenter: number | null = null

  for (const word of line.words) {
    let xs = centersInSpan(word.text.length, word.xStart, word.xEnd)

    if (lastCenter !== null && xs.length > 0) {
      const minFirst = lastCenter + MIN_WORD_GAP
      if (xs[0] < minFirst) {
        const delta = minFirst - xs[0]
        xs = xs.map((x) => +(x + delta).toFixed(2))
      }
    }

    const wordShiftLeft = word.xShiftLeft ?? 0
    if (wordShiftLeft > 0) {
      xs = xs.map((x) => +(x - wordShiftLeft).toFixed(2))
    }

    const chars = [...word.text]
    const xShiftLeft = line.xShiftLeft ?? 0
    const xShiftRight = line.xShiftRight ?? 0
    const yShiftDown = line.yShiftDown ?? 0
    chars.forEach((char, i) => {
      out.push({
        char,
        xPct: +(xs[i] - xShiftLeft + xShiftRight).toFixed(2),
        yPct: +(line.yPct + yShiftDown).toFixed(2),
        wPct: MARSMON_RUNE_TILE_W_PCT,
        hPct: MARSMON_RUNE_TILE_H_PCT,
        flipIndex: flip++,
      })
    })

    if (xs.length > 0) lastCenter = xs[xs.length - 1]
  }

  return out
}

/** Rune cluster bounds on art — xEnd includes room before next word. */
const LINES: LineSpec[] = [
  {
    yPct: Y_LINE1,
    xShiftLeft: X_SHIFT_LEFT,
    yShiftDown: 1,
    words: [
      { text: 'HE', xStart: 14.16, xEnd: 19.29 },
      { text: 'SEES', xStart: 23.43, xEnd: 38.2 },
      { text: 'HE', xStart: 40.55, xEnd: 46.2 },
      { text: 'CONQUERS', xStart: 47.11, xEnd: 77.43 },
    ],
  },
  {
    yPct: Y_LINE2,
    xShiftLeft: X_SHIFT_LEFT,
    yShiftDown: 1 + yDownPx(3),
    words: [
      { text: 'HONEY', xStart: 21.79, xEnd: 38.5 },
      { text: 'THE', xStart: 40.19, xEnd: 50.2 },
      { text: 'CROWDS', xStart: 51.5, xEnd: 70.08, xShiftLeft: 1 },
    ],
  },
  {
    yPct: Y_LINE3,
    xShiftLeft: X_SHIFT_LEFT,
    xShiftRight: 20,
    yShiftDown: 3 + yDownPx(2),
    words: [
      { text: 'WERE', xStart: 23.5, xEnd: 36.2 },
      { text: 'GOING', xStart: 37.77, xEnd: 55.5 },
      { text: 'BONKERS', xStart: 58.2, xEnd: 81.49 },
    ],
  },
]

const g1 = buildLine(LINES[0], 0)
const g2 = buildLine(LINES[1], g1.length)
const g3 = buildLine(LINES[2], g1.length + g2.length)

export const MARSMON_RUNE_GLYPHS: MarsmonRuneGlyph[] = [...g1, ...g2, ...g3]
