import type { WikiSkill } from '../types/wikiApi'
import { skillDamageAtLevel, skillIsSupportOnly } from './skillDamage'
import { parseBuffNumericEffects, parseSupportEffects } from './supportEffects'

export type RotationEvent = {
  atSec: number
  skillId: string
  skillName: string
  iconId: string
  eventType: 'damage' | 'support' | 'auto'
  castTimeSec: number
  damage: number
  buffedBy: string[]
  totalBuffPct: number
  cumulativeDamage: number
}

export type RotationResult = {
  totalDamage: number
  dps: number
  casts: number
  durationSec: number
  attackBuffPct: number
  skillDamageBuffPct: number
  attackPowerFlat: number
  critRatePct: number
  critDamagePct: number
  totalDpsBuffPct: number
  events: RotationEvent[]
}

function effectiveCastTime(castTimeSec: number) {
  return Math.max(0.1, castTimeSec || 0)
}

function skillDamagePerCast(skill: WikiSkill, level: number, targets: number) {
  const base = skillDamageAtLevel(skill.base_dmg, skill.scaling, level, skill.max_level)
  const targetHits = skill.radius && skill.radius > 0 ? Math.max(1, targets) : 1
  return base * targetHits
}

type SupportBuffProfile = {
  skill: WikiSkill
  durationSec: number
  attackPct: number
  skillDamagePct: number
  flatAttack: number
  critRatePct: number
  critDamagePct: number
}

type ActiveBuff = {
  skillId: string
  skillName: string
  untilSec: number
  attackPct: number
  skillDamagePct: number
  flatAttack: number
  critRatePct: number
  critDamagePct: number
}

function critRateToChance(critRateStat: number) {
  if (!Number.isFinite(critRateStat) || critRateStat <= 0) return 0
  // Game-style stat scale: 1453 -> 1.453% crit chance.
  return Math.max(0, Math.min(1, critRateStat / 100000))
}

function expectedCritMultiplier(critChance: number, extraCritDamagePct: number) {
  const chance = Math.max(0, Math.min(1, critChance))
  const extra = Math.max(0, extraCritDamagePct) / 100
  return 1 + chance * (1 + extra)
}

function supportProfiles(
  supportSkills: WikiSkill[],
  levelBySkillId: Record<string, number>,
): SupportBuffProfile[] {
  return supportSkills
    .map((s) => {
      const L = Math.max(1, Math.floor(levelBySkillId[s.id] ?? 25))
      const effects = [
        ...parseSupportEffects(`${s.description} ${s.buff?.description ?? ''}`, L),
        ...parseBuffNumericEffects(s.buff, L),
      ]
      let attackPct = 0
      let skillDamagePct = 0
      let flatAttack = 0
      let critRatePct = 0
      let critDamagePct = 0
      for (const e of effects) {
        const label = e.label.toLowerCase()
        if (e.unit === '%' && /(\bskill damage\b|\bskill dmg\b)/.test(label)) {
          skillDamagePct += e.valueAtLevel
        } else if (e.unit === '%' && /(\bcritical damage\b|\bcrit damage\b|\bcd\b)/.test(label)) {
          critDamagePct += e.valueAtLevel
        } else if (e.unit === '%' && /(\bcritical rate\b|\bcrit rate\b|\bct\b)/.test(label)) {
          critRatePct += e.valueAtLevel
        } else if (e.unit === '%' && /\battack( power)?\b/.test(label)) {
          attackPct += e.valueAtLevel
        } else if (!e.unit && /\battack( power)?\b/.test(label)) {
          flatAttack += e.valueAtLevel
        }
      }
      return {
        skill: s,
        durationSec: s.buff?.duration ?? 0,
        attackPct,
        skillDamagePct,
        flatAttack,
        critRatePct,
        critDamagePct,
      }
    })
    .filter(
      (p) =>
        p.durationSec > 0 &&
        (p.attackPct > 0 ||
          p.skillDamagePct > 0 ||
          p.flatAttack > 0 ||
          p.critRatePct > 0 ||
          p.critDamagePct > 0),
    )
}

export function estimateSupportAttackBuffPct(supportSkills: WikiSkill[], level: number) {
  let total = 0
  for (const s of supportSkills) {
    const effects = parseSupportEffects(s.description, level)
    const attackPct = effects
      .filter(
        (e) =>
          e.unit === '%' &&
          /(increase|raise|boost).*\battack\b/i.test(e.label),
      )
      .reduce((sum, e) => sum + e.valueAtLevel, 0)
    if (attackPct <= 0) continue
    const duration = s.buff?.duration ?? 0
    const cooldown = s.cooldown_sec || 0
    const uptime = duration > 0 && cooldown > 0 ? Math.min(1, duration / cooldown) : 1
    total += attackPct * uptime
  }
  return total
}

function estimateSupportDpsBuffs(
  supportSkills: WikiSkill[],
  levelBySkillId: Record<string, number>,
  baseAttack: number,
  baseCritRateStat: number,
) {
  let attackPct = 0
  let skillDamagePct = 0
  let flatAttack = 0
  let critRatePct = 0
  let critDamagePct = 0
  for (const p of supportProfiles(supportSkills, levelBySkillId)) {
    const duration = p.durationSec
    const cooldown = p.skill.cooldown_sec || 0
    const uptime = duration > 0 && cooldown > 0 ? Math.min(1, duration / cooldown) : 1
    attackPct += p.attackPct * uptime
    skillDamagePct += p.skillDamagePct * uptime
    flatAttack += p.flatAttack * uptime
    critRatePct += p.critRatePct * uptime
    critDamagePct += p.critDamagePct * uptime
  }

  const baseCritRatePct = critRateToChance(baseCritRateStat) * 100
  const expectedCritPctBoost =
    (expectedCritMultiplier((baseCritRatePct + critRatePct) / 100, critDamagePct) - 1) * 100
  const flatAttackPct = baseAttack > 0 ? (flatAttack / baseAttack) * 100 : 0
  return {
    attackPct,
    skillDamagePct,
    flatAttack,
    critRatePct: baseCritRatePct + critRatePct,
    critDamagePct,
    totalDpsBuffPct: attackPct + skillDamagePct + flatAttackPct + expectedCritPctBoost,
  }
}

export function simulateRotation(
  skills: WikiSkill[],
  levelBySkillId: Record<string, number>,
  durationSec: number,
  targets: number,
  baseAttack: number = 0,
  attackSpeed: number = 0,
  baseCritRateStat: number = 0,
): RotationResult {
  const damaging = skills.filter((s) => !skillIsSupportOnly(s.base_dmg, s.scaling))
  const support = skills.filter((s) => skillIsSupportOnly(s.base_dmg, s.scaling))
  const supportBuffs = supportProfiles(support, levelBySkillId)
  const skillLevel = (skill: WikiSkill) => {
    const requested = levelBySkillId[skill.id] ?? 25
    const cap = Math.max(1, Math.min(skill.max_level || 25, 25))
    return Math.max(1, Math.min(Math.floor(requested), cap))
  }
  if (damaging.length === 0) {
    const buffs = estimateSupportDpsBuffs(
      support,
      levelBySkillId,
      baseAttack,
      baseCritRateStat,
    )
    return {
      totalDamage: 0,
      dps: 0,
      casts: 0,
      durationSec,
      attackBuffPct: buffs.attackPct,
      skillDamageBuffPct: buffs.skillDamagePct,
      attackPowerFlat: buffs.flatAttack,
      critRatePct: buffs.critRatePct,
      critDamagePct: buffs.critDamagePct,
      totalDpsBuffPct: buffs.totalDpsBuffPct,
      events: [],
    }
  }

  const buffs = estimateSupportDpsBuffs(
    support,
    levelBySkillId,
    baseAttack,
    baseCritRateStat,
  )
  const readyAt = new Map<string, number>()
  const activeBuffs: ActiveBuff[] = []
  let t = 0
  let totalDamage = 0
  let casts = 0
  const events: RotationEvent[] = []
  let attackPctAtDamageCasts = 0
  let skillPctAtDamageCasts = 0
  let flatAtkAtDamageCasts = 0
  let critRateAtDamageCasts = 0
  let critDamageAtDamageCasts = 0
  let damageCastCount = 0
  const autoIntervalSec =
    attackSpeed > 0 ? Math.max(0.35, attackSpeed / 1000) : 1.5

  while (t < durationSec) {
    // remove expired windows
    for (let i = activeBuffs.length - 1; i >= 0; i -= 1) {
      if (activeBuffs[i].untilSec <= t) activeBuffs.splice(i, 1)
    }

    const availableSupport = supportBuffs.filter((p) => {
      const ready = (readyAt.get(p.skill.id) ?? 0) <= t
      const alreadyUp = activeBuffs.some((b) => b.skillId === p.skill.id && b.untilSec > t)
      return ready && !alreadyUp
    })

    if (availableSupport.length > 0) {
      availableSupport.sort((a, b) => {
        const aFlat = baseAttack > 0 ? (a.flatAttack / baseAttack) * 100 : 0
        const bFlat = baseAttack > 0 ? (b.flatAttack / baseAttack) * 100 : 0
        const aScore = a.attackPct + a.skillDamagePct + aFlat
        const bScore = b.attackPct + b.skillDamagePct + bFlat
        return bScore - aScore
      })
      const chosen = availableSupport[0]
      const castTime = effectiveCastTime(chosen.skill.cast_time_sec)
      casts += 1
      events.push({
        atSec: t,
        skillId: chosen.skill.id,
        skillName: chosen.skill.name,
        iconId: chosen.skill.icon_id,
        eventType: 'support',
        castTimeSec: castTime,
        damage: 0,
        buffedBy: [],
        totalBuffPct: 0,
        cumulativeDamage: totalDamage,
      })
      readyAt.set(chosen.skill.id, t + (chosen.skill.cooldown_sec || 0))
      const startAt = t + castTime
      activeBuffs.push({
        skillId: chosen.skill.id,
        skillName: chosen.skill.name,
        untilSec: startAt + chosen.durationSec,
        attackPct: chosen.attackPct,
        skillDamagePct: chosen.skillDamagePct,
        flatAttack: chosen.flatAttack,
        critRatePct: chosen.critRatePct,
        critDamagePct: chosen.critDamagePct,
      })
      t += castTime
      continue
    }

    const available = damaging.filter((s) => (readyAt.get(s.id) ?? 0) <= t)
    if (available.length === 0) {
      const next = Math.min(
        ...[...damaging, ...supportBuffs.map((p) => p.skill)].map(
          (s) => readyAt.get(s.id) ?? 0,
        ),
      )
      const nextReady = Number.isFinite(next) ? Math.min(durationSec, next) : durationSec
      if (nextReady <= t) break

      while (t + autoIntervalSec <= nextReady + 1e-9) {
        const activeAttackPct = activeBuffs.reduce((sum, b) => sum + b.attackPct, 0)
        const activeFlatAtk = activeBuffs.reduce((sum, b) => sum + b.flatAttack, 0)
        const activeCritRatePct = activeBuffs.reduce((sum, b) => sum + b.critRatePct, 0)
        const activeCritDamagePct = activeBuffs.reduce((sum, b) => sum + b.critDamagePct, 0)
        const critChance = Math.max(
          0,
          Math.min(1, critRateToChance(baseCritRateStat) + activeCritRatePct / 100),
        )
        const critMult = expectedCritMultiplier(critChance, activeCritDamagePct)
        const flatPct = baseAttack > 0 ? (activeFlatAtk / baseAttack) * 100 : 0
        const totalBuffPct = activeAttackPct + flatPct + (critMult - 1) * 100
        const autoBase = Math.max(0, baseAttack + activeFlatAtk)
        const autoDmg =
          autoBase * (1 + activeAttackPct / 100) * critMult * Math.max(1, targets)
        totalDamage += autoDmg
        damageCastCount += 1
        attackPctAtDamageCasts += activeAttackPct
        flatAtkAtDamageCasts += activeFlatAtk
        critRateAtDamageCasts += critChance * 100
        critDamageAtDamageCasts += activeCritDamagePct
        skillPctAtDamageCasts += 0
        casts += 1
        events.push({
          atSec: t,
          skillId: 'auto-attack',
          skillName: 'Auto Attack',
          iconId: '',
          eventType: 'auto',
          castTimeSec: autoIntervalSec,
          damage: autoDmg,
          buffedBy: activeBuffs.map((b) => b.skillName),
          totalBuffPct,
          cumulativeDamage: totalDamage,
        })
        t += autoIntervalSec
        for (let i = activeBuffs.length - 1; i >= 0; i -= 1) {
          if (activeBuffs[i].untilSec <= t) activeBuffs.splice(i, 1)
        }
      }
      t = Math.max(t, nextReady)
      continue
    }

    available.sort((a, b) => {
      const aScore =
        skillDamagePerCast(a, skillLevel(a), targets) / effectiveCastTime(a.cast_time_sec)
      const bScore =
        skillDamagePerCast(b, skillLevel(b), targets) / effectiveCastTime(b.cast_time_sec)
      return bScore - aScore
    })
    const chosen = available[0]
    const castTime = effectiveCastTime(chosen.cast_time_sec)
    const usedLevel = skillLevel(chosen)
    const activeAttackPct = activeBuffs.reduce((sum, b) => sum + b.attackPct, 0)
    const activeSkillPct = activeBuffs.reduce((sum, b) => sum + b.skillDamagePct, 0)
    const activeFlatAtk = activeBuffs.reduce((sum, b) => sum + b.flatAttack, 0)
    const activeCritRatePct = activeBuffs.reduce((sum, b) => sum + b.critRatePct, 0)
    const activeCritDamagePct = activeBuffs.reduce((sum, b) => sum + b.critDamagePct, 0)
    const critChance = Math.max(
      0,
      Math.min(1, critRateToChance(baseCritRateStat) + activeCritRatePct / 100),
    )
    const critMult = expectedCritMultiplier(critChance, activeCritDamagePct)
    const flatPct = baseAttack > 0 ? (activeFlatAtk / baseAttack) * 100 : 0
    const totalBuffPct = activeAttackPct + activeSkillPct + flatPct + (critMult - 1) * 100
    const dmg =
      skillDamagePerCast(chosen, usedLevel, targets) *
      (1 + (activeAttackPct + activeSkillPct + flatPct) / 100) *
      critMult
    totalDamage += dmg
    damageCastCount += 1
    attackPctAtDamageCasts += activeAttackPct
    skillPctAtDamageCasts += activeSkillPct
    flatAtkAtDamageCasts += activeFlatAtk
    critRateAtDamageCasts += critChance * 100
    critDamageAtDamageCasts += activeCritDamagePct
    casts += 1
    events.push({
      atSec: t,
      skillId: chosen.id,
      skillName: chosen.name,
      iconId: chosen.icon_id,
      eventType: 'damage',
      castTimeSec: castTime,
      damage: dmg,
      buffedBy: activeBuffs.map((b) => b.skillName),
      totalBuffPct,
      cumulativeDamage: totalDamage,
    })
    readyAt.set(chosen.id, t + (chosen.cooldown_sec || 0))
    t += castTime
  }

  return {
    totalDamage,
    dps: durationSec > 0 ? totalDamage / durationSec : 0,
    casts,
    durationSec,
    attackBuffPct:
      damageCastCount > 0 ? attackPctAtDamageCasts / damageCastCount : buffs.attackPct,
    skillDamageBuffPct:
      damageCastCount > 0 ? skillPctAtDamageCasts / damageCastCount : buffs.skillDamagePct,
    attackPowerFlat:
      damageCastCount > 0 ? flatAtkAtDamageCasts / damageCastCount : buffs.flatAttack,
    critRatePct:
      damageCastCount > 0 ? critRateAtDamageCasts / damageCastCount : buffs.critRatePct,
    critDamagePct:
      damageCastCount > 0 ? critDamageAtDamageCasts / damageCastCount : buffs.critDamagePct,
    totalDpsBuffPct:
      damageCastCount > 0
        ? (attackPctAtDamageCasts + skillPctAtDamageCasts) / damageCastCount +
          (baseAttack > 0 ? (flatAtkAtDamageCasts / damageCastCount / baseAttack) * 100 : 0) +
          ((expectedCritMultiplier(
            Math.max(0, Math.min(1, (critRateAtDamageCasts / damageCastCount) / 100)),
            critDamageAtDamageCasts / damageCastCount,
          ) -
            1) *
            100)
        : buffs.totalDpsBuffPct,
    events,
  }
}

