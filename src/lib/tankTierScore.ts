import type { WikiDigimonDetail } from '../types/wikiApi'
import { buildSupportSkillEffects } from './supportEffects'
import {
  healOverTimeTicksDuringBuff,
  isDamageReductionLabel,
  isHealHpLabel,
  isMaxHpPctLabel,
  isShieldLabel,
  skillBuffUptime,
  tierListSkillLevel,
} from './tierScoreParsing'

export type TankTierScoreBreakdown = {
  /** Base max HP from wiki stats — dominant layer (~65% of composite). */
  hpRaw: number
  /** Weighted defense (def × 6) for log scaling — small stat layer. */
  defenseRaw: number
  /** Parsed mitigation kit (DR × uptime, shields, heals, Max HP%) — second layer (~22%). */
  mitigationRaw: number
  /** Block + evasion — smallest layer. */
  avoidanceRaw: number
  /** Higher = better tank index (heuristic). */
  score: number
}

/**
 * Heuristic tank index: ~65% base HP, ~22% mitigation kit (potency × uptime), ~9% weighted defense,
 * ~4% avoidance. Intended for ranking only, not in-game EHP.
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
    const effects = buildSupportSkillEffects(skill, level, hp)

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
        const ticks = healOverTimeTicksDuringBuff(e, skill)
        if (unit === '%') mitigationRaw += (v / 100) * uptime * 90 * ticks
        else mitigationRaw += Math.min(3, (v / hp) * uptime * 36) * ticks
      } else if (isMaxHpPctLabel(lab, unit)) {
        mitigationRaw += (v / 100) * uptime * 70
      }
    }
  }

  const defenseRaw = def * 6
  const avoidanceRaw = block * 1.15 + eva

  const score =
    0.65 * Math.log1p(hp / 1000) +
    0.22 * Math.log1p(mitigationRaw) +
    0.09 * Math.log1p(defenseRaw / 1000) +
    0.04 * Math.log1p(avoidanceRaw)

  return { hpRaw: hp, defenseRaw, mitigationRaw, avoidanceRaw, score }
}
