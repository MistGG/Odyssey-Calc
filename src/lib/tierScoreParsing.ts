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

export function isDamageReductionLabel(label: string): boolean {
  const l = label.toLowerCase()
  return (
    /damage reduction|dmg reduction/.test(l) ||
    /reduces\s+all\s+damage/.test(l) ||
    /reduces\s+damage\s+taken/.test(l) ||
    /incoming\s+damage/.test(l)
  )
}

export function isShieldLabel(label: string): boolean {
  return /\b(barrier|shield|aegis|ward)\b/i.test(label)
}

export function isHealHpLabel(label: string): boolean {
  const l = label.toLowerCase()
  if (!/(recovers|restores|heals)/.test(l)) return false
  return /\bhp\b/.test(l) || /\bhealth\b/.test(l)
}

export function isMaxHpPctLabel(label: string, unit: '%' | ''): boolean {
  return /\bmax\s*hp\b/i.test(label) && unit === '%'
}
