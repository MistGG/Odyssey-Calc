import type { WikiDigimonDetail } from '../types/wikiApi'
import { buildSupportSkillEffects } from './supportEffects'
import {
  isDamageReductionLabel,
  isHealHpLabel,
  isMaxHpPctLabel,
  isShieldLabel,
  skillBuffUptime,
  tierListSkillLevel,
} from './tierScoreParsing'

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
    const uptime = skillBuffUptime(skill)
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
