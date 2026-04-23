import type { WikiSkill } from '../types/wikiApi'

/** Skill level assumed for tier list rows (matches tier list detail fetch). */
export function tierListSkillLevel(skill: Pick<WikiSkill, 'max_level'>): number {
  return Math.max(1, Math.min(25, skill.max_level || 25))
}

/**
 * Rough uptime for buff-style effects: buff duration vs effective cooldown.
 * When duration is missing, assume partial coverage over the cooldown window.
 */
export function skillBuffUptime(skill: WikiSkill): number {
  const cd = Math.max(0.5, skill.cooldown_sec + skill.cast_time_sec)
  const dur =
    typeof skill.buff?.duration === 'number' && skill.buff.duration > 0
      ? skill.buff.duration
      : cd * 0.4
  return Math.min(1, dur / cd)
}

/** Matches wiki DR lines and the canonical display label from `normalizeDamageReductionDisplayLabel`. */
export function isDamageReductionLabel(label: string): boolean {
  const l = label.trim().toLowerCase()
  if (l === 'damage reduction') return true
  return (
    /\bdmg\s*reduction\b/.test(l) ||
    /\bdamage\s+reduction\b/.test(l) ||
    /\breduces\s+all\s+damage\b/.test(l) ||
    /\breduces\s+damage\s+taken\b/.test(l) ||
    /\b(?:reduces|decreases)\s+incoming\s+damage\b/.test(l)
  )
}

export function isShieldLabel(label: string): boolean {
  return /\b(barrier|shield|aegis|ward)\b/i.test(label)
}

export function isHealHpLabel(label: string): boolean {
  if (label.trim().toLowerCase() === 'heal over time') return true
  const l = label.toLowerCase()
  if (!/(recovers|restores|heals|regenerat|over time)/.test(l)) return false
  return /\bhp\b/.test(l) || /\bhealth\b/.test(l) || /over time/.test(l)
}

/**
 * Tick count during buff (or cooldown fallback). Prefers `hotIntervalSec` from parsed regen lines;
 * otherwise parses `every Ns` from legacy display labels.
 */
export function healOverTimeTicksDuringBuff(
  e: { label: string; hotIntervalSec?: number },
  skill: WikiSkill,
): number {
  let interval: number | undefined
  if (typeof e.hotIntervalSec === 'number' && e.hotIntervalSec > 0) {
    interval = e.hotIntervalSec
  } else if (/over time/i.test(e.label)) {
    const m = e.label.match(/\bevery\s+(\d+(?:\.\d+)?)\s*s\b/i)
    if (m) interval = Number(m[1])
  }
  if (interval === undefined || !Number.isFinite(interval) || interval <= 0) return 1
  const intervalClamped = Math.max(0.5, interval)
  const dur =
    typeof skill.buff?.duration === 'number' && skill.buff.duration > 0
      ? skill.buff.duration
      : Math.max(1, skill.cooldown_sec)
  return Math.max(1, Math.floor(dur / intervalClamped))
}

export function isMaxHpPctLabel(label: string, unit: '%' | ''): boolean {
  return /\bmax\s*hp\b/i.test(label) && unit === '%'
}
