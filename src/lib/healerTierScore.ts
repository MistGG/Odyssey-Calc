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

/** HP healed per cast for one parsed line (% of caster max HP, or flat HP). */
function healHpPerCast(e: ParsedSupportEffect, casterMaxHp: number): number {
  const v = e.valueAtLevel
  if (e.unit === '%') return Math.max(0, v / 100) * casterMaxHp
  return Math.max(0, v)
}

export type HealerTierScoreBreakdown = {
  /**
   * Modeled sustained healing: sum over skills of (HP healed per cast ÷ (cooldown + cast)).
   * Min interval 0.75s. Units: HP/s (same sustained spirit as the 180s DPS tier list window).
   */
  healSustainHps: number
  /** Damage reduction + shields/barriers only (second layer). */
  mitigationRaw: number
  /** Offensive support (ATK%, skill dmg, crit, ASPD, flat ATK) × uptime. */
  damageBuffRaw: number
  /** INT from combat stats (smallest layer). */
  intStat: number
  score: number
}

/**
 * Support/healer index dominated by modeled heal sustain (HP/s), then mitigation, buffs, INT.
 * Healing uses wiki cooldown+cast: each heal skill adds (heal per cast) / (cooldown + cast).
 */
export function computeHealerTierScore(detail: WikiDigimonDetail): HealerTierScoreBreakdown {
  const stats = detail.stats
  const hp = Math.max(1, stats?.hp ?? detail.hp ?? 1)
  const intStat = Math.max(0, stats?.int ?? 0)

  let healSustainHps = 0
  let mitigationRaw = 0
  let damageBuffRaw = 0

  for (const skill of detail.skills) {
    const level = tierListSkillLevel(skill)
    const effects = buildSupportSkillEffects(skill, level)
    const uptime = skillBuffUptime(skill)

    let healPerCast = 0
    for (const e of effects) {
      if (isHealHpLabel(e.label)) healPerCast += healHpPerCast(e, hp)
    }
    if (healPerCast > 0) {
      const periodSec = Math.max(0.75, skill.cooldown_sec + skill.cast_time_sec)
      healSustainHps += healPerCast / periodSec
    }

    for (const e of effects) {
      const lab = e.label
      const v = e.valueAtLevel
      const unit = e.unit

      if (isHealHpLabel(lab)) continue

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
    0.74 * Math.log1p(healSustainHps) +
    0.16 * Math.log1p(mitigationRaw) +
    0.07 * Math.log1p(damageBuffRaw) +
    0.03 * Math.log1p(intStat)

  return {
    healSustainHps,
    mitigationRaw,
    damageBuffRaw,
    intStat,
    score,
  }
}
