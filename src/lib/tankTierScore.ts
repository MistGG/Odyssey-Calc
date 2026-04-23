import type { WikiDigimonDetail, WikiSkill } from '../types/wikiApi'
import { buildSupportSkillEffects } from './supportEffects'

/** Skill level assumed for tier list rows (matches tier list detail fetch). */
function tierListSkillLevel(skill: Pick<WikiSkill, 'max_level'>): number {
  return Math.max(1, Math.min(25, skill.max_level || 25))
}

/**
 * Rough uptime for buff-style effects: buff duration vs effective cooldown.
 * When duration is missing, assume partial coverage over the cooldown window.
 */
function mitigationUptime(skill: WikiSkill): number {
  const cd = Math.max(0.5, skill.cooldown_sec + skill.cast_time_sec)
  const dur =
    typeof skill.buff?.duration === 'number' && skill.buff.duration > 0
      ? skill.buff.duration
      : cd * 0.4
  return Math.min(1, dur / cd)
}

function isDamageReductionLabel(label: string): boolean {
  const l = label.toLowerCase()
  return (
    /damage reduction|dmg reduction/.test(l) ||
    /reduces\s+all\s+damage/.test(l) ||
    /reduces\s+damage\s+taken/.test(l)
  )
}

function isShieldLabel(label: string): boolean {
  return /\b(barrier|shield|aegis|ward)\b/i.test(label)
}

function isHealHpLabel(label: string): boolean {
  const l = label.toLowerCase()
  if (!/(recovers|restores|heals)/.test(l)) return false
  return /\bhp\b/.test(l) || /\bhealth\b/.test(l)
}

function isMaxHpPctLabel(label: string, unit: '%' | ''): boolean {
  return /\bmax\s*hp\b/i.test(label) && unit === '%'
}

export type TankTierScoreBreakdown = {
  /** Parsed mitigation kit (DR × uptime, shields, heals, Max HP%) — largest tier in composite. */
  mitigationRaw: number
  /** HP + weighted defense — middle tier. */
  coreRaw: number
  /** Block + evasion — smallest tier. */
  avoidanceRaw: number
  /** Higher = better tank index (heuristic). */
  score: number
}

/**
 * Heuristic tank index: ~55% mitigation kit (potency × uptime), ~30% core stats (HP + DEF),
 * ~15% avoidance (block + evasion). Intended for ranking only, not in-game EHP.
 */
export function computeTankTierScore(detail: WikiDigimonDetail): TankTierScoreBreakdown {
  const stats = detail.stats
  const hp = Math.max(1, stats?.hp ?? detail.hp ?? 1)
  const def = Math.max(0, stats?.defense ?? 0)
  const block = Math.max(0, stats?.block_rate ?? 0)
  const eva = Math.max(0, stats?.evasion ?? 0)

  let mitigationRaw = 0

  for (const skill of detail.skills) {
    const level = tierListSkillLevel(skill)
    const uptime = mitigationUptime(skill)
    const effects = buildSupportSkillEffects(skill, level)

    for (const e of effects) {
      const lab = e.label
      const v = e.valueAtLevel
      const unit = e.unit

      if (isDamageReductionLabel(lab)) {
        if (unit === '%') mitigationRaw += (v / 100) * uptime * 120
        else mitigationRaw += Math.max(0, v) * 0.02 * uptime
      } else if (isShieldLabel(lab)) {
        if (unit === '%') mitigationRaw += (v / 100) * uptime * 100
        else mitigationRaw += Math.min(3, (v / hp) * uptime * 28)
      } else if (isHealHpLabel(lab)) {
        if (unit === '%') mitigationRaw += (v / 100) * uptime * 90
        else mitigationRaw += Math.min(3, (v / hp) * uptime * 36)
      } else if (isMaxHpPctLabel(lab, unit)) {
        mitigationRaw += (v / 100) * uptime * 70
      }
    }
  }

  const coreRaw = hp + def * 6
  const avoidanceRaw = block * 1.15 + eva

  const score =
    0.55 * Math.log1p(mitigationRaw) +
    0.3 * Math.log1p(coreRaw / 1000) +
    0.15 * Math.log1p(avoidanceRaw)

  return { mitigationRaw, coreRaw, avoidanceRaw, score }
}
