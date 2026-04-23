import type { WikiDigimonDetail } from '../types/wikiApi'
import { buildSupportSkillEffects, type ParsedSupportEffect } from './supportEffects'
import {
  isDamageReductionLabel,
  isHealHpLabel,
  isShieldLabel,
  skillBuffUptime,
  tierListSkillLevel,
} from './tierScoreParsing'

/**
 * Potency × uptime for party-oriented damage buffs (aligned with DPS sim support parsing).
 */
function damageBuffRawFromEffect(e: ParsedSupportEffect, uptime: number): number {
  const label = e.label.toLowerCase()
  const v = e.valueAtLevel
  const u = e.unit
  let pts = 0
  if (u === '%' && /(\bskill damage\b|\bskill dmg\b)/.test(label)) pts += v * 1.05
  else if (u === '%' && /(\bcritical damage\b|\bcrit damage\b|\bcd\b)/.test(label)) pts += v * 0.88
  else if (u === '%' && /(\bcritical rate\b|\bcrit rate\b|\bct\b)/.test(label)) pts += v * 0.92
  else if (u === '%' && /\battack speed\b/.test(label)) pts += v * 0.78
  else if (
    u === '%' &&
    /\battack( power)?\b/.test(label) &&
    !/\battack speed\b/.test(label)
  ) {
    pts += v * 1.0
  } else if (
    u === '' &&
    /\battack( power)?\b/.test(label) &&
    !/\battack speed\b/.test(label)
  ) {
    pts += Math.max(0, v) * 0.02
  }
  return pts * uptime
}

export type HealerTierScoreBreakdown = {
  /** Parsed HP healing (% and flat), × uptime — dominant layer. */
  healingRaw: number
  /** Damage reduction + shields/barriers only (second layer). */
  mitigationRaw: number
  /** Offensive support (ATK%, skill dmg, crit, ASPD, flat ATK) × uptime. */
  damageBuffRaw: number
  /** INT from combat stats (smallest layer). */
  intStat: number
  score: number
}

/**
 * Heuristic support/healer index: healing highest, then DR + shields, then damage buffs, then INT.
 * log1p layers keep stat ranges comparable. Not a model of throughput, HPS, or overheal.
 */
export function computeHealerTierScore(detail: WikiDigimonDetail): HealerTierScoreBreakdown {
  const stats = detail.stats
  const hp = Math.max(1, stats?.hp ?? detail.hp ?? 1)
  const intStat = Math.max(0, stats?.int ?? 0)

  let healingRaw = 0
  let mitigationRaw = 0
  let damageBuffRaw = 0

  for (const skill of detail.skills) {
    const level = tierListSkillLevel(skill)
    const uptime = skillBuffUptime(skill)
    const effects = buildSupportSkillEffects(skill, level)

    for (const e of effects) {
      const lab = e.label
      const v = e.valueAtLevel
      const unit = e.unit

      if (isHealHpLabel(lab)) {
        if (unit === '%') healingRaw += (v / 100) * uptime * 160
        else healingRaw += Math.min(4, (v / hp) * uptime * 52)
        continue
      }

      if (isDamageReductionLabel(lab)) {
        if (unit === '%') mitigationRaw += (v / 100) * uptime * 120
        else mitigationRaw += Math.max(0, v) * 0.02 * uptime
        continue
      }

      if (isShieldLabel(lab)) {
        if (unit === '%') mitigationRaw += (v / 100) * uptime * 100
        else mitigationRaw += Math.min(3, (v / hp) * uptime * 28)
        continue
      }

      const db = damageBuffRawFromEffect(e, uptime)
      if (db > 0) damageBuffRaw += db
    }
  }

  const score =
    0.5 * Math.log1p(healingRaw) +
    0.28 * Math.log1p(mitigationRaw) +
    0.12 * Math.log1p(damageBuffRaw) +
    0.1 * Math.log1p(intStat)

  return { healingRaw, mitigationRaw, damageBuffRaw, intStat, score }
}
