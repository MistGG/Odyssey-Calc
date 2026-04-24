import type { WikiDigimonDetail } from '../types/wikiApi'
import { buildSupportSkillEffects, supportEffectStatBucket } from './supportEffects'
import type { TankTierCategoryScores } from './tierList'
import {
  healOverTimeTicksDuringBuff,
  isDamageReductionLabel,
  isHealHpLabel,
  isMaxHpPctLabel,
  isShieldLabel,
  skillBuffUptime,
  tierListSkillLevel,
} from './tierScoreParsing'
import type { ParsedSupportEffect } from './supportEffects'

/** Barrier HP per cast (% of max HP or flat), aligned with `healerTierScore` shield parsing. */
function shieldHpPerCast(e: ParsedSupportEffect, casterMaxHp: number): number {
  const v = e.valueAtLevel
  if (e.unit === '%') return Math.max(0, v / 100) * casterMaxHp
  return Math.max(0, v)
}

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
  /** Sort keys for tier sub-modes (overall = `score`). */
  categoryScores: TankTierCategoryScores
  /**
   * Wiki base stat + uptime-weighted skill contributions (matrix display).
   * `hp` includes temporary Max HP buffs and modeled self-shields (barrier per cast × buff uptime).
   */
  effectiveDisplay: {
    hp: number
    defense: number
    evasion: number
    block: number
  }
}

/**
 * Heuristic tank index: ~65% base HP, ~22% mitigation kit (potency × uptime), ~9% weighted defense,
 * ~4% avoidance. Intended for ranking only, not in-game EHP.
 *
 * Category scores add wiki base stat + uptime-weighted parsed buffs to the same stat (Max HP, DE,
 * Evasion, Block Rate), then `log1p(value/1000)` for sorting. Effective HP also adds self-shields:
 * sum of (barrier HP per skill cast, including HoT-style tick counts) × that skill’s buff uptime.
 */
export function computeTankTierScore(detail: WikiDigimonDetail): TankTierScoreBreakdown {
  const stats = detail.stats
  const hp = Math.max(1, stats?.hp ?? detail.hp ?? 1)
  const def = Math.max(0, stats?.defense ?? 0)
  const block = Math.max(0, stats?.block_rate ?? 0)
  const eva = Math.max(0, stats?.evasion ?? 0)

  let mitigationRaw = 0
  let hpBuffFromSkills = 0
  let shieldEhpFromSkills = 0
  let defBuffFromSkills = 0
  let evaBuffFromSkills = 0
  let blockBuffFromSkills = 0

  for (const skill of detail.skills) {
    const level = tierListSkillLevel(skill)
    const uptime = skillBuffUptime(skill)
    const effects = buildSupportSkillEffects(skill, level, hp)

    let shieldPerCast = 0
    for (const e of effects) {
      if (!isShieldLabel(e.label)) continue
      const ticks = healOverTimeTicksDuringBuff(e, skill)
      shieldPerCast += shieldHpPerCast(e, hp) * ticks
    }
    if (shieldPerCast > 0) {
      shieldEhpFromSkills += shieldPerCast * uptime
    }

    for (const e of effects) {
      const lab = e.label
      const v = e.valueAtLevel
      const unit = e.unit
      const bucket = supportEffectStatBucket(e)

      if (bucket.startsWith('max_hp|')) {
        if (unit === '%') hpBuffFromSkills += hp * (v / 100) * uptime
        else hpBuffFromSkills += Math.max(0, v) * uptime
      } else if (bucket.startsWith('def|')) {
        if (unit === '%') defBuffFromSkills += def * (v / 100) * uptime
        else defBuffFromSkills += Math.max(0, v) * uptime
      } else if (bucket.startsWith('eva|')) {
        if (unit === '%') evaBuffFromSkills += eva * (v / 100) * uptime
        else evaBuffFromSkills += Math.max(0, v) * uptime
      } else if (bucket.startsWith('block|')) {
        if (unit === '%') blockBuffFromSkills += block * (v / 100) * uptime
        else blockBuffFromSkills += Math.max(0, v) * uptime
      }

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

  const hpEffective = hp + hpBuffFromSkills + shieldEhpFromSkills

  const categoryScores: TankTierCategoryScores = {
    overall: score,
    hp: Math.log1p(hpEffective / 1000),
    defense: Math.log1p((def + defBuffFromSkills) / 1000),
    evasion: Math.log1p((eva + evaBuffFromSkills) / 1000),
    block: Math.log1p((block + blockBuffFromSkills) / 1000),
  }

  const effectiveDisplay = {
    hp: hpEffective,
    defense: def + defBuffFromSkills,
    evasion: eva + evaBuffFromSkills,
    block: block + blockBuffFromSkills,
  }

  return {
    hpRaw: hp,
    defenseRaw,
    mitigationRaw,
    avoidanceRaw,
    score,
    categoryScores,
    effectiveDisplay,
  }
}
