/**
 * Fog colors sampled from the forum teaser (6v7FJWV) dark / ground-mist regions.
 * Corners & ground fog ~rgb(20–35, 26–46, 30–54); mid haze ~rgb(40–53, 52–69, 60–80).
 */
export type FogRgb = { r: number; g: number; b: number }

function pick(range: readonly [number, number]): number {
  const [lo, hi] = range
  return lo + Math.random() * (hi - lo)
}

/** Near-black ground mist (15th percentile, corner samples). */
export function fogColorDark(): FogRgb {
  return {
    r: pick([16, 30]),
    g: pick([22, 40]),
    b: pick([26, 46]),
  }
}

/** Body of existing ground fog (35th–50th percentile). */
export function fogColorMid(): FogRgb {
  return {
    r: pick([24, 36]),
    g: pick([34, 48]),
    b: pick([40, 56]),
  }
}

/** Lighter atmospheric haze lifted from mid-frame mist (50th–65th). */
export function fogColorMist(): FogRgb {
  return {
    r: pick([36, 52]),
    g: pick([48, 66]),
    b: pick([56, 78]),
  }
}

/** Lighter haze at the center approach (lifted from teaser mid-frame mist). */
export const FOG_LIGHT_AT_CENTER: FogRgb = { r: 72, g: 92, b: 104 }

export function lightenFogColor(base: FogRgb, approach: number): FogRgb {
  const t = approach * approach * (3 - 2 * approach)
  const peak = FOG_LIGHT_AT_CENTER
  return {
    r: Math.round(base.r + (peak.r - base.r) * t),
    g: Math.round(base.g + (peak.g - base.g) * t),
    b: Math.round(base.b + (peak.b - base.b) * t),
  }
}

/** Spawn tint — mid/mist only so corners are not near-black on birth. */
export function fogColorSpawn(side: 'bl' | 'br'): FogRgb {
  const base = Math.random() < 0.25 ? fogColorMid() : fogColorMist()
  return lightenFogColor(fogColorForSide(side, base), 0.38)
}

/** Slight cool bias on the left vs right spawn side. */
export function fogColorForSide(side: 'bl' | 'br', base = fogColorMid()): FogRgb {
  if (side === 'bl') {
    return { r: Math.max(0, base.r - 2), g: base.g, b: Math.min(255, base.b + 3) }
  }
  return { r: Math.min(255, base.r + 1), g: base.g, b: Math.max(0, base.b - 2) }
}
