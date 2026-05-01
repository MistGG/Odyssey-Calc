import type { WikiDigimonDetail } from '../types/wikiApi'
import { wikiIntSkillDamageMultiplier } from './dpsSim'
import { buildSupportSkillEffects, type ParsedSupportEffect } from './supportEffects'
import type { HealerTierCategoryScores } from './tierList'
import {
  healOverTimeTicksDuringBuff,
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

/** Sum of %-points × uptime (and flat ATK scaled) for matrix display; not the same units as `damageBuffRaw`. */
function damageBuffDisplayPctFromEffect(e: ParsedSupportEffect, uptime: number): number {
  const label = e.label.toLowerCase()
  const v = e.valueAtLevel
  const u = e.unit
  if (u === '%' && /(\bskill damage\b|\bskill dmg\b)/.test(label)) return v * uptime
  if (u === '%' && /(\bcritical damage\b|\bcrit damage\b|\bcd\b)/.test(label)) return v * uptime
  if (u === '%' && /(\bcritical rate\b|\bcrit rate\b|\bct\b)/.test(label)) return v * uptime
  if (u === '%' && /\battack speed\b/.test(label)) return v * uptime
  if (
    u === '%' &&
    /\battack( power)?\b/.test(label) &&
    !/\battack speed\b/.test(label)
  ) {
    return v * uptime
  }
  if (
    u === '' &&
    /\battack( power)?\b/.test(label) &&
    !/\battack speed\b/.test(label)
  ) {
    return Math.max(0, v) * 0.02 * uptime
  }
  return 0
}

/** HP healed per cast for one parsed line (% of caster max HP, or flat HP). */
function healHpPerCast(e: ParsedSupportEffect, casterMaxHp: number): number {
  const v = e.valueAtLevel
  if (e.unit === '%') return Math.max(0, v / 100) * casterMaxHp
  return Math.max(0, v)
}

/** Barrier HP per cast (% of max HP or flat), aligned with heal parsing. */
function shieldHpPerCast(e: ParsedSupportEffect, casterMaxHp: number): number {
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
  /** Damage reduction + shields/barriers (combined, for the general composite). */
  mitigationRaw: number
  /** Shield contribution only (for shielding sub-mode). */
  shieldMitRaw: number
  /** Damage reduction contribution only. */
  drMitRaw: number
  /** Offensive support (ATK%, skill dmg, crit, ASPD, flat ATK) × uptime. */
  damageBuffRaw: number
  /** INT from combat stats (smallest layer). */
  intStat: number
  /** Modeled shield absorption rate (barrier HP per second). */
  shieldSustainHps: number
  /**
   * Matrix “Buffing” cell: sum over offensive buff lines of (wiki value × uptime). %-buffs use value as %-points;
   * flat ATK uses `value * 0.02 * uptime`. Not party DPS%; see tier list Healer explainer.
   */
  buffDmgGainDisplay: number
  score: number
  categoryScores: HealerTierCategoryScores
}

/**
 * Support/healer index dominated by modeled heal sustain (HP/s), then mitigation, buffs, INT.
 * Healing uses wiki cooldown+cast: each heal skill adds (heal per cast) / (cooldown + cast).
 */
export function computeHealerTierScore(detail: WikiDigimonDetail): HealerTierScoreBreakdown {
  const stats = detail.stats
  const hp = Math.max(1, stats?.hp ?? detail.hp ?? 1)
  const intStat = Math.max(0, stats?.int ?? 0)
  /** 100 wiki INT → +1% healing amplification (same ratio as skill damage % in DPS sim). */
  const healAmpMult = wikiIntSkillDamageMultiplier(intStat)

  let healSustainHps = 0
  let shieldSustainHps = 0
  let mitigationRaw = 0
  let shieldMitRaw = 0
  let drMitRaw = 0
  let damageBuffRaw = 0
  let buffDmgGainDisplay = 0

  for (const skill of detail.skills) {
    const level = tierListSkillLevel(skill)
    const effects = buildSupportSkillEffects(skill, level, hp)
    const uptime = skillBuffUptime(skill)

    let healPerCast = 0
    for (const e of effects) {
      if (!isHealHpLabel(e.label)) continue
      const ticks = healOverTimeTicksDuringBuff(e, skill)
      healPerCast += healHpPerCast(e, hp) * ticks
    }
    if (healPerCast > 0) {
      const periodSec = Math.max(0.75, skill.cooldown_sec + skill.cast_time_sec)
      healSustainHps += (healPerCast * healAmpMult) / periodSec
    }

    let shieldPerCast = 0
    for (const e of effects) {
      if (!isShieldLabel(e.label)) continue
      const ticks = healOverTimeTicksDuringBuff(e, skill)
      shieldPerCast += shieldHpPerCast(e, hp) * ticks
    }
    if (shieldPerCast > 0) {
      const periodSec = Math.max(0.75, skill.cooldown_sec + skill.cast_time_sec)
      shieldSustainHps += shieldPerCast / periodSec
    }

    for (const e of effects) {
      const lab = e.label
      const v = e.valueAtLevel
      const unit = e.unit

      if (isHealHpLabel(lab)) continue

      if (isDamageReductionLabel(lab)) {
        if (unit === '%') {
          const add = (v / 100) * uptime * 120
          mitigationRaw += add
          drMitRaw += add
        } else {
          const add = Math.max(0, v) * 0.02 * uptime
          mitigationRaw += add
          drMitRaw += add
        }
        continue
      }

      if (isShieldLabel(lab)) {
        if (unit === '%') {
          const add = (v / 100) * uptime * 100
          mitigationRaw += add
          shieldMitRaw += add
        } else {
          const add = Math.min(3, (v / hp) * uptime * 28)
          mitigationRaw += add
          shieldMitRaw += add
        }
        continue
      }

      const db = damageBuffRawFromEffect(e, uptime)
      if (db > 0) damageBuffRaw += db
      buffDmgGainDisplay += damageBuffDisplayPctFromEffect(e, uptime)
    }
  }

  const score =
    0.74 * Math.log1p(healSustainHps) +
    0.16 * Math.log1p(mitigationRaw) +
    0.07 * Math.log1p(damageBuffRaw) +
    0.03 * Math.log1p(intStat)

  const categoryScores: HealerTierCategoryScores = {
    general: score,
    healing: Math.log1p(Math.max(0, healSustainHps)),
    /** Matrix “Shielding (SPS)” sorts by this; must match `shieldSustainHps` shown in the UI (not `shieldMitRaw`). */
    shielding: Math.log1p(Math.max(0, shieldSustainHps)),
    buffing: Math.log1p(Math.max(0, damageBuffRaw)),
    int: Math.log1p(Math.max(0, intStat)),
  }

  return {
    healSustainHps,
    shieldSustainHps,
    mitigationRaw,
    shieldMitRaw,
    drMitRaw,
    damageBuffRaw,
    buffDmgGainDisplay,
    intStat,
    score,
    categoryScores,
  }
}
