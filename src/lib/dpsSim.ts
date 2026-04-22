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

type DamageHold = { skillId: string; until: number }

function critRateToChance(critRateStat: number) {
  if (!Number.isFinite(critRateStat) || critRateStat <= 0) return 0
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

type SimCtx = {
  damaging: WikiSkill[]
  supportBuffs: SupportBuffProfile[]
  durationSec: number
  targets: number
  baseAttack: number
  baseCritRateStat: number
  autoIntervalSec: number
  skillLevel: (skill: WikiSkill) => number
}

type SimMutable = {
  t: number
  totalDamage: number
  casts: number
  readyAt: Map<string, number>
  activeBuffs: ActiveBuff[]
  events: RotationEvent[]
  attackPctAtDamageCasts: number
  skillPctAtDamageCasts: number
  flatAtkAtDamageCasts: number
  critRateAtDamageCasts: number
  critDamageAtDamageCasts: number
  damageCastCount: number
}

function cloneSim(m: SimMutable): SimMutable {
  return {
    t: m.t,
    totalDamage: m.totalDamage,
    casts: m.casts,
    readyAt: new Map(m.readyAt),
    activeBuffs: m.activeBuffs.map((b) => ({ ...b })),
    events: [],
    attackPctAtDamageCasts: m.attackPctAtDamageCasts,
    skillPctAtDamageCasts: m.skillPctAtDamageCasts,
    flatAtkAtDamageCasts: m.flatAtkAtDamageCasts,
    critRateAtDamageCasts: m.critRateAtDamageCasts,
    critDamageAtDamageCasts: m.critDamageAtDamageCasts,
    damageCastCount: m.damageCastCount,
  }
}

function purgeExpiredBuffs(m: SimMutable, t: number) {
  for (let i = m.activeBuffs.length - 1; i >= 0; i -= 1) {
    if (m.activeBuffs[i].untilSec <= t) m.activeBuffs.splice(i, 1)
  }
}

function sortDamageByDpct(ctx: SimCtx, skills: WikiSkill[]) {
  return [...skills].sort((a, b) => {
    const aScore =
      skillDamagePerCast(a, ctx.skillLevel(a), ctx.targets) / effectiveCastTime(a.cast_time_sec)
    const bScore =
      skillDamagePerCast(b, ctx.skillLevel(b), ctx.targets) / effectiveCastTime(b.cast_time_sec)
    return bScore - aScore
  })
}

function availableDamaging(ctx: SimCtx, m: SimMutable, hold: DamageHold | null) {
  let list = ctx.damaging.filter((s) => (m.readyAt.get(s.id) ?? 0) <= m.t)
  if (hold && m.t < hold.until) {
    const filtered = list.filter((s) => s.id !== hold.skillId)
    if (filtered.length > 0) list = filtered
  }
  return sortDamageByDpct(ctx, list)
}

function castDamageSkill(ctx: SimCtx, m: SimMutable, skill: WikiSkill, recordEvents: boolean) {
  const castTime = effectiveCastTime(skill.cast_time_sec)
  const usedLevel = ctx.skillLevel(skill)
  const activeAttackPct = m.activeBuffs.reduce((sum, b) => sum + b.attackPct, 0)
  const activeSkillPct = m.activeBuffs.reduce((sum, b) => sum + b.skillDamagePct, 0)
  const activeFlatAtk = m.activeBuffs.reduce((sum, b) => sum + b.flatAttack, 0)
  const activeCritRatePct = m.activeBuffs.reduce((sum, b) => sum + b.critRatePct, 0)
  const activeCritDamagePct = m.activeBuffs.reduce((sum, b) => sum + b.critDamagePct, 0)
  const critChance = Math.max(
    0,
    Math.min(1, critRateToChance(ctx.baseCritRateStat) + activeCritRatePct / 100),
  )
  const critMult = expectedCritMultiplier(critChance, activeCritDamagePct)
  const flatPct = ctx.baseAttack > 0 ? (activeFlatAtk / ctx.baseAttack) * 100 : 0
  const totalBuffPct = activeAttackPct + activeSkillPct + flatPct + (critMult - 1) * 100
  const dmg =
    skillDamagePerCast(skill, usedLevel, ctx.targets) *
    (1 + (activeAttackPct + activeSkillPct + flatPct) / 100) *
    critMult

  m.totalDamage += dmg
  m.damageCastCount += 1
  m.attackPctAtDamageCasts += activeAttackPct
  m.skillPctAtDamageCasts += activeSkillPct
  m.flatAtkAtDamageCasts += activeFlatAtk
  m.critRateAtDamageCasts += critChance * 100
  m.critDamageAtDamageCasts += activeCritDamagePct
  m.casts += 1
  if (recordEvents) {
    m.events.push({
      atSec: m.t,
      skillId: skill.id,
      skillName: skill.name,
      iconId: skill.icon_id,
      eventType: 'damage',
      castTimeSec: castTime,
      damage: dmg,
      buffedBy: m.activeBuffs.map((b) => b.skillName),
      totalBuffPct,
      cumulativeDamage: m.totalDamage,
    })
  }
  m.readyAt.set(skill.id, m.t + (skill.cooldown_sec || 0))
  m.t += castTime
}

function castSupportProfile(_ctx: SimCtx, m: SimMutable, chosen: SupportBuffProfile, recordEvents: boolean) {
  const castTime = effectiveCastTime(chosen.skill.cast_time_sec)
  m.casts += 1
  if (recordEvents) {
    m.events.push({
      atSec: m.t,
      skillId: chosen.skill.id,
      skillName: chosen.skill.name,
      iconId: chosen.skill.icon_id,
      eventType: 'support',
      castTimeSec: castTime,
      damage: 0,
      buffedBy: [],
      totalBuffPct: 0,
      cumulativeDamage: m.totalDamage,
    })
  }
  m.readyAt.set(chosen.skill.id, m.t + (chosen.skill.cooldown_sec || 0))
  const startAt = m.t + castTime
  m.activeBuffs.push({
    skillId: chosen.skill.id,
    skillName: chosen.skill.name,
    untilSec: startAt + chosen.durationSec,
    attackPct: chosen.attackPct,
    skillDamagePct: chosen.skillDamagePct,
    flatAttack: chosen.flatAttack,
    critRatePct: chosen.critRatePct,
    critDamagePct: chosen.critDamagePct,
  })
  m.t += castTime
}

/**
 * Greedy timeline without lookahead: supports > damage (DPCT, optional ban) > autos / jump.
 * Stops when t >= wallTime or duration ends.
 */
function runGreedyUntilWall(
  ctx: SimCtx,
  m: SimMutable,
  wallTime: number,
  damageBan: DamageHold | null,
  recordEvents: boolean,
) {
  const wall = Math.min(wallTime, ctx.durationSec)
  while (m.t < wall - 1e-9 && m.t < ctx.durationSec - 1e-9) {
    purgeExpiredBuffs(m, m.t)

    const availableSupport = ctx.supportBuffs.filter((p) => {
      const ready = (m.readyAt.get(p.skill.id) ?? 0) <= m.t
      const alreadyUp = m.activeBuffs.some((b) => b.skillId === p.skill.id && b.untilSec > m.t)
      return ready && !alreadyUp
    })

    if (availableSupport.length > 0) {
      availableSupport.sort((a, b) => {
        const aFlat = ctx.baseAttack > 0 ? (a.flatAttack / ctx.baseAttack) * 100 : 0
        const bFlat = ctx.baseAttack > 0 ? (b.flatAttack / ctx.baseAttack) * 100 : 0
        const aScore = a.attackPct + a.skillDamagePct + aFlat
        const bScore = b.attackPct + b.skillDamagePct + bFlat
        return bScore - aScore
      })
      castSupportProfile(ctx, m, availableSupport[0], recordEvents)
      continue
    }

    let available = ctx.damaging.filter((s) => (m.readyAt.get(s.id) ?? 0) <= m.t)
    if (damageBan && m.t < damageBan.until) {
      const filtered = available.filter((s) => s.id !== damageBan.skillId)
      if (filtered.length > 0) available = filtered
    }
    available = sortDamageByDpct(ctx, available)

    const rawReadyDamage = sortDamageByDpct(
      ctx,
      ctx.damaging.filter((s) => (m.readyAt.get(s.id) ?? 0) <= m.t),
    )
    if (
      available.length === 0 &&
      rawReadyDamage.length > 0 &&
      damageBan &&
      m.t < damageBan.until
    ) {
      const holdEnd = Math.min(damageBan.until, wall)
      while (m.t + ctx.autoIntervalSec <= holdEnd + 1e-9 && m.t < wall - 1e-9) {
        const activeAttackPct = m.activeBuffs.reduce((sum, b) => sum + b.attackPct, 0)
        const activeFlatAtk = m.activeBuffs.reduce((sum, b) => sum + b.flatAttack, 0)
        const activeCritRatePct = m.activeBuffs.reduce((sum, b) => sum + b.critRatePct, 0)
        const activeCritDamagePct = m.activeBuffs.reduce((sum, b) => sum + b.critDamagePct, 0)
        const critChance = Math.max(
          0,
          Math.min(1, critRateToChance(ctx.baseCritRateStat) + activeCritRatePct / 100),
        )
        const critMult = expectedCritMultiplier(critChance, activeCritDamagePct)
        const flatPct = ctx.baseAttack > 0 ? (activeFlatAtk / ctx.baseAttack) * 100 : 0
        const totalBuffPct = activeAttackPct + flatPct + (critMult - 1) * 100
        const autoBase = Math.max(0, ctx.baseAttack + activeFlatAtk)
        const autoDmg =
          autoBase * (1 + activeAttackPct / 100) * critMult * Math.max(1, ctx.targets)
        m.totalDamage += autoDmg
        m.damageCastCount += 1
        m.attackPctAtDamageCasts += activeAttackPct
        m.flatAtkAtDamageCasts += activeFlatAtk
        m.critRateAtDamageCasts += critChance * 100
        m.critDamageAtDamageCasts += activeCritDamagePct
        m.skillPctAtDamageCasts += 0
        m.casts += 1
        if (recordEvents) {
          m.events.push({
            atSec: m.t,
            skillId: 'auto-attack',
            skillName: 'Auto Attack',
            iconId: '',
            eventType: 'auto',
            castTimeSec: ctx.autoIntervalSec,
            damage: autoDmg,
            buffedBy: m.activeBuffs.map((b) => b.skillName),
            totalBuffPct,
            cumulativeDamage: m.totalDamage,
          })
        }
        m.t += ctx.autoIntervalSec
        purgeExpiredBuffs(m, m.t)
      }
      m.t = Math.min(Math.max(m.t, holdEnd), wall)
      continue
    }

    if (available.length === 0) {
      const next = Math.min(
        ...[...ctx.damaging, ...ctx.supportBuffs.map((p) => p.skill)].map(
          (s) => m.readyAt.get(s.id) ?? 0,
        ),
      )
      const nextReady = Number.isFinite(next) ? Math.min(ctx.durationSec, next) : ctx.durationSec
      if (nextReady <= m.t) break

      while (m.t + ctx.autoIntervalSec <= nextReady + 1e-9 && m.t < wall - 1e-9) {
        const activeAttackPct = m.activeBuffs.reduce((sum, b) => sum + b.attackPct, 0)
        const activeFlatAtk = m.activeBuffs.reduce((sum, b) => sum + b.flatAttack, 0)
        const activeCritRatePct = m.activeBuffs.reduce((sum, b) => sum + b.critRatePct, 0)
        const activeCritDamagePct = m.activeBuffs.reduce((sum, b) => sum + b.critDamagePct, 0)
        const critChance = Math.max(
          0,
          Math.min(1, critRateToChance(ctx.baseCritRateStat) + activeCritRatePct / 100),
        )
        const critMult = expectedCritMultiplier(critChance, activeCritDamagePct)
        const flatPct = ctx.baseAttack > 0 ? (activeFlatAtk / ctx.baseAttack) * 100 : 0
        const totalBuffPct = activeAttackPct + flatPct + (critMult - 1) * 100
        const autoBase = Math.max(0, ctx.baseAttack + activeFlatAtk)
        const autoDmg =
          autoBase * (1 + activeAttackPct / 100) * critMult * Math.max(1, ctx.targets)
        m.totalDamage += autoDmg
        m.damageCastCount += 1
        m.attackPctAtDamageCasts += activeAttackPct
        m.flatAtkAtDamageCasts += activeFlatAtk
        m.critRateAtDamageCasts += critChance * 100
        m.critDamageAtDamageCasts += activeCritDamagePct
        m.skillPctAtDamageCasts += 0
        m.casts += 1
        if (recordEvents) {
          m.events.push({
            atSec: m.t,
            skillId: 'auto-attack',
            skillName: 'Auto Attack',
            iconId: '',
            eventType: 'auto',
            castTimeSec: ctx.autoIntervalSec,
            damage: autoDmg,
            buffedBy: m.activeBuffs.map((b) => b.skillName),
            totalBuffPct,
            cumulativeDamage: m.totalDamage,
          })
        }
        m.t += ctx.autoIntervalSec
        purgeExpiredBuffs(m, m.t)
      }
      m.t = Math.max(m.t, Math.min(nextReady, wall))
      continue
    }

    const chosen = available[0]
    castDamageSkill(ctx, m, chosen, recordEvents)
  }
}

const LOOKAHEAD_SEC = 12
const LOOKAHEAD_MAX_FRACTION = 0.35

function branchDamageGain(
  ctx: SimCtx,
  base: SimMutable,
  wallTime: number,
  firstCast: WikiSkill | null,
  damageBan: DamageHold | null,
): number {
  const shadow = cloneSim(base)
  if (firstCast) castDamageSkill(ctx, shadow, firstCast, false)
  runGreedyUntilWall(ctx, shadow, wallTime, damageBan, false)
  return shadow.totalDamage - base.totalDamage
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
  const autoIntervalSec = attackSpeed > 0 ? Math.max(0.35, attackSpeed / 1000) : 1.5

  const ctx: SimCtx = {
    damaging,
    supportBuffs,
    durationSec,
    targets,
    baseAttack,
    baseCritRateStat,
    autoIntervalSec,
    skillLevel,
  }

  const m: SimMutable = {
    t: 0,
    totalDamage: 0,
    casts: 0,
    readyAt: new Map(),
    activeBuffs: [],
    events: [],
    attackPctAtDamageCasts: 0,
    skillPctAtDamageCasts: 0,
    flatAtkAtDamageCasts: 0,
    critRateAtDamageCasts: 0,
    critDamageAtDamageCasts: 0,
    damageCastCount: 0,
  }

  let damageHold: DamageHold | null = null

  while (m.t < durationSec - 1e-9) {
    if (damageHold && m.t >= damageHold.until) damageHold = null

    purgeExpiredBuffs(m, m.t)

    const availableSupport = supportBuffs.filter((p) => {
      const ready = (m.readyAt.get(p.skill.id) ?? 0) <= m.t
      const alreadyUp = m.activeBuffs.some((b) => b.skillId === p.skill.id && b.untilSec > m.t)
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
      castSupportProfile(ctx, m, availableSupport[0], true)
      continue
    }

    const available = availableDamaging(ctx, m, damageHold)
    const rawReadyDamage = sortDamageByDpct(
      ctx,
      ctx.damaging.filter((s) => (m.readyAt.get(s.id) ?? 0) <= m.t),
    )
    if (
      available.length === 0 &&
      rawReadyDamage.length > 0 &&
      damageHold &&
      m.t < damageHold.until
    ) {
      const holdEnd = Math.min(damageHold.until, durationSec)
      while (m.t + autoIntervalSec <= holdEnd + 1e-9 && m.t < durationSec - 1e-9) {
        const activeAttackPct = m.activeBuffs.reduce((sum, b) => sum + b.attackPct, 0)
        const activeFlatAtk = m.activeBuffs.reduce((sum, b) => sum + b.flatAttack, 0)
        const activeCritRatePct = m.activeBuffs.reduce((sum, b) => sum + b.critRatePct, 0)
        const activeCritDamagePct = m.activeBuffs.reduce((sum, b) => sum + b.critDamagePct, 0)
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
        m.totalDamage += autoDmg
        m.damageCastCount += 1
        m.attackPctAtDamageCasts += activeAttackPct
        m.flatAtkAtDamageCasts += activeFlatAtk
        m.critRateAtDamageCasts += critChance * 100
        m.critDamageAtDamageCasts += activeCritDamagePct
        m.skillPctAtDamageCasts += 0
        m.casts += 1
        m.events.push({
          atSec: m.t,
          skillId: 'auto-attack',
          skillName: 'Auto Attack',
          iconId: '',
          eventType: 'auto',
          castTimeSec: autoIntervalSec,
          damage: autoDmg,
          buffedBy: m.activeBuffs.map((b) => b.skillName),
          totalBuffPct,
          cumulativeDamage: m.totalDamage,
        })
        m.t += autoIntervalSec
        purgeExpiredBuffs(m, m.t)
      }
      m.t = Math.min(Math.max(m.t, holdEnd), durationSec)
      continue
    }

    if (available.length === 0) {
      const next = Math.min(
        ...[...damaging, ...supportBuffs.map((p) => p.skill)].map((s) => m.readyAt.get(s.id) ?? 0),
      )
      const nextReady = Number.isFinite(next) ? Math.min(durationSec, next) : durationSec
      if (nextReady <= m.t) break

      while (m.t + autoIntervalSec <= nextReady + 1e-9) {
        const activeAttackPct = m.activeBuffs.reduce((sum, b) => sum + b.attackPct, 0)
        const activeFlatAtk = m.activeBuffs.reduce((sum, b) => sum + b.flatAttack, 0)
        const activeCritRatePct = m.activeBuffs.reduce((sum, b) => sum + b.critRatePct, 0)
        const activeCritDamagePct = m.activeBuffs.reduce((sum, b) => sum + b.critDamagePct, 0)
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
        m.totalDamage += autoDmg
        m.damageCastCount += 1
        m.attackPctAtDamageCasts += activeAttackPct
        m.flatAtkAtDamageCasts += activeFlatAtk
        m.critRateAtDamageCasts += critChance * 100
        m.critDamageAtDamageCasts += activeCritDamagePct
        m.skillPctAtDamageCasts += 0
        m.casts += 1
        m.events.push({
          atSec: m.t,
          skillId: 'auto-attack',
          skillName: 'Auto Attack',
          iconId: '',
          eventType: 'auto',
          castTimeSec: autoIntervalSec,
          damage: autoDmg,
          buffedBy: m.activeBuffs.map((b) => b.skillName),
          totalBuffPct,
          cumulativeDamage: m.totalDamage,
        })
        m.t += autoIntervalSec
        purgeExpiredBuffs(m, m.t)
      }
      m.t = Math.max(m.t, nextReady)
      continue
    }

    const primary = available[0]
    const secondary = available[1]

    let chosen: WikiSkill = primary

    {
      const horizon = Math.min(
        LOOKAHEAD_SEC,
        Math.max(0, durationSec - m.t) * LOOKAHEAD_MAX_FRACTION,
      )
      const branchWall = Math.min(durationSec, m.t + Math.max(0.5, horizon))

      const gPrimary = branchDamageGain(ctx, m, branchWall, primary, null)
      const gSecondary = secondary ? branchDamageGain(ctx, m, branchWall, secondary, null) : -Infinity
      const gDefer = branchDamageGain(ctx, m, branchWall, null, {
        skillId: primary.id,
        until: branchWall,
      })

      let best = gPrimary
      let pick: 'primary' | 'secondary' | 'hold' = 'primary'
      if (gSecondary > best + 1e-6) {
        best = gSecondary
        pick = 'secondary'
      }
      if (gDefer > best + 1e-6) {
        best = gDefer
        pick = 'hold'
      }

      if (pick === 'secondary' && secondary) {
        chosen = secondary
      } else if (pick === 'hold') {
        if (secondary && gDefer >= gSecondary - 1e-6) {
          chosen = secondary
        } else {
          damageHold = { skillId: primary.id, until: branchWall }
          continue
        }
      }
    }

    castDamageSkill(ctx, m, chosen, true)
  }

  return {
    totalDamage: m.totalDamage,
    dps: durationSec > 0 ? m.totalDamage / durationSec : 0,
    casts: m.casts,
    durationSec,
    attackBuffPct:
      m.damageCastCount > 0 ? m.attackPctAtDamageCasts / m.damageCastCount : buffs.attackPct,
    skillDamageBuffPct:
      m.damageCastCount > 0 ? m.skillPctAtDamageCasts / m.damageCastCount : buffs.skillDamagePct,
    attackPowerFlat:
      m.damageCastCount > 0 ? m.flatAtkAtDamageCasts / m.damageCastCount : buffs.flatAttack,
    critRatePct:
      m.damageCastCount > 0 ? m.critRateAtDamageCasts / m.damageCastCount : buffs.critRatePct,
    critDamagePct:
      m.damageCastCount > 0 ? m.critDamageAtDamageCasts / m.damageCastCount : buffs.critDamagePct,
    totalDpsBuffPct:
      m.damageCastCount > 0
        ? (m.attackPctAtDamageCasts + m.skillPctAtDamageCasts) / m.damageCastCount +
          (baseAttack > 0 ? (m.flatAtkAtDamageCasts / m.damageCastCount / baseAttack) * 100 : 0) +
          ((expectedCritMultiplier(
            Math.max(0, Math.min(1, (m.critRateAtDamageCasts / m.damageCastCount) / 100)),
            m.critDamageAtDamageCasts / m.damageCastCount,
          ) -
            1) *
            100)
        : buffs.totalDpsBuffPct,
    events: m.events,
  }
}
