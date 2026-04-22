import type { CSSProperties } from 'react'

/**
 * Circular portrait gradients by evolution stage — matches the main wiki `SC`
 * palette (Digital Odyssey Wiki).
 */
const ROOKIE_GRADIENT = 'linear-gradient(135deg,#16641e,#22a040)'
const ROOKIE_ACCENT = '#4ade80'

/**
 * Wiki `SC[stage].t` label colors — used for borders and small accents.
 */
export const DIGIMON_STAGE_ACCENT: Record<string, string> = {
  DigiTama: '#8888aa',
  'In-Training': '#8888aa',
  Baby: '#8888aa',
  Rookie: ROOKIE_ACCENT,
  'Rookie X': ROOKIE_ACCENT,
  Armor: '#fde68a',
  Champion: '#60a5fa',
  'Champion X': '#60a5fa',
  Ultimate: '#c084fc',
  'Ultimate X': '#c084fc',
  Mega: '#fbbf24',
  'Mega X': '#fbbf24',
  'Burst Mode': '#f87171',
  'Burst Mode X': '#f87171',
  Jogress: '#f0abfc',
  'Jogress X': '#f0abfc',
  Spirit: '#93c5fd',
  Extra: '#fbbf24',
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.trim().replace('#', '')
  if (h.length !== 6) return `rgba(148, 163, 184, ${alpha})`
  const r = Number.parseInt(h.slice(0, 2), 16)
  const g = Number.parseInt(h.slice(2, 4), 16)
  const b = Number.parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/** Solid accent for inline styles (e.g. borders without alpha). */
export function digimonStageAccentColor(stage: string | undefined): string {
  const k = stage?.trim() ?? ''
  return DIGIMON_STAGE_ACCENT[k] ?? ROOKIE_ACCENT
}

/** Semi-transparent border color for tier cards and similar. */
export function digimonStageBorderColor(stage: string | undefined, alpha = 0.52): string {
  return hexToRgba(digimonStageAccentColor(stage), alpha)
}

/** Tier list stage filter pills: wiki accent when a stage row is picked; cyan for All. */
const ALL_FILTER_ACTIVE_STYLE: CSSProperties = {
  borderColor: 'rgba(34, 211, 238, 0.55)',
  backgroundColor: 'rgba(14, 165, 233, 0.24)',
  color: '#22d3ee',
}

export function digimonStageTierFilterStyle(label: string, selected: boolean): CSSProperties {
  if (label === 'All') {
    if (!selected) return {}
    return ALL_FILTER_ACTIVE_STYLE
  }
  const accent = digimonStageAccentColor(label)
  if (selected) {
    return {
      borderColor: digimonStageBorderColor(label, 0.62),
      backgroundColor: hexToRgba(accent, 0.22),
      color: accent,
    }
  }
  return {
    borderColor: digimonStageBorderColor(label, 0.42),
    backgroundColor: 'rgba(30, 41, 59, 0.35)',
    color: 'var(--text-soft)',
  }
}

export const DIGIMON_STAGE_PORTRAIT_GRADIENT: Record<string, string> = {
  DigiTama: 'linear-gradient(135deg,#3a3a5e,#5a5a80)',
  'In-Training': 'linear-gradient(135deg,#3a3a5e,#5a5a80)',
  Baby: 'linear-gradient(135deg,#3a3a5e,#5a5a80)',
  Rookie: ROOKIE_GRADIENT,
  'Rookie X': ROOKIE_GRADIENT,
  Armor: 'linear-gradient(135deg,#78350f,#d97706)',
  Champion: 'linear-gradient(135deg,#0f2a7a,#1e5ac8)',
  'Champion X': 'linear-gradient(135deg,#0f2a7a,#1e5ac8)',
  Ultimate: 'linear-gradient(135deg,#4a0f8a,#7a28c8)',
  'Ultimate X': 'linear-gradient(135deg,#4a0f8a,#7a28c8)',
  Mega: 'linear-gradient(135deg,#7a3000,#c04a10)',
  'Mega X': 'linear-gradient(135deg,#7a3000,#c04a10)',
  'Burst Mode': 'linear-gradient(135deg,#7a1010,#c02020)',
  'Burst Mode X': 'linear-gradient(135deg,#7a1010,#c02020)',
  Jogress: 'linear-gradient(135deg,#3b0764,#7c3aed)',
  'Jogress X': 'linear-gradient(135deg,#3b0764,#7c3aed)',
  Spirit: 'linear-gradient(135deg,#0f2a7a,#3c78c8)',
  Extra: 'linear-gradient(135deg,#7a3000,#c04a10)',
}

export function digimonStagePortraitGradient(stage: string | undefined): string {
  const k = stage?.trim() ?? ''
  return DIGIMON_STAGE_PORTRAIT_GRADIENT[k] ?? ROOKIE_GRADIENT
}
