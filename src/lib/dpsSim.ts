import type { WikiSkill } from '../types/wikiApi'
import { skillDamageAtLevel, skillIsSupportOnly } from './skillDamage'
import {
  digimonRoleWikiSkills,
  isHybridStanceSkillId,
  normalizeWikiRole,
  type HybridStance,
} from './digimonRoleSkills'
import {
  buildSupportSkillEffects,
  parseSupportEffectsFromSkill,
} from './supportEffects'

/** One line in a timeline buff tooltip (how that +% was derived). */
export type BuffContribution = {
  key: string
  /** Short label on the chip, e.g. ATK, Skill, Flat, Crit, Hit */
  label: string
  /**
   * Shown as +valuePct% on the chip. Always from active buffs only — wiki base stats are never
   * added here (flat uses wiki attack only as a divisor to express buff flat as a comparable %;
   * crit uses wiki crit only inside a subtracted baseline, not as a + row).
   */
  valuePct: number
  /** Full breakdown; joined for native `title` tooltip */
  detailLines: string[]
}

export type RotationEvent = {
  atSec: number
  skillId: string
  skillName: string
  iconId: string
  eventType: 'damage' | 'support' | 'auto'
  castTimeSec: number
  damage: number
  buffedBy: string[]
  /** Sum of buff-only % contributions for this hit: atk + skill + flat-as-%; autos also add marginal crit from buffs. */
  totalBuffPct: number
  /** Per-category numbers from active buffs only; see `buildBuffContributionsForDamage`. */
  buffContributions?: BuffContribution[]
  cumulativeDamage: number
  /** When present, this auto attack was animation-cancelled into the named skill. */
  cancelledBySkillName?: string
  /** True when this damage event is the skill cast used to cancel the preceding auto attack. */
  cancelledFromAuto?: boolean
}

export type RotationResult = {
  totalDamage: number
  dps: number
  casts: number
  durationSec: number
  attackBuffPct: number
  skillDamageBuffPct: number
  attackPowerFlat: number
  /** Mean total crit chance (wiki + buff) × 100 at each auto hit. */
  critRatePct: number
  /** Mean buff crit damage % at each auto hit. */
  critDamagePct: number
  /** Blended buff % summary; crit term is weighted by auto damage share. */
  totalDpsBuffPct: number
  /** Sum of damage from auto-attack events (excludes skills). */
  autoDamageTotal: number
  /** Count of auto-attack hits in the window. */
  autoAttackHits: number
  /** Mean damage per auto hit (0 if no autos). */
  autoDamageAvg: number
  /** Auto damage divided by sim duration (contribution to sustained DPS). */
  autoDps: number
  events: RotationEvent[]
}

/** Default window for `simulateRotation` in Lab and tier list (same sim). */
export const DEFAULT_ROTATION_SIM_DURATION_SEC = 180
export const MIN_ROTATION_SIM_DURATION_SEC = 10
export const MAX_ROTATION_SIM_DURATION_SEC = 600

export function clampRotationDurationSec(durationSec: number): number {
  const parsed = Number.isFinite(durationSec) ? Math.floor(durationSec) : DEFAULT_ROTATION_SIM_DURATION_SEC
  return Math.max(
    MIN_ROTATION_SIM_DURATION_SEC,
    Math.min(MAX_ROTATION_SIM_DURATION_SEC, parsed),
  )
}

/**
 * Bump when DPS-tier scoring inputs change (rotation sim and/or AoE DPS heuristics).
 * Tier list entries store this on refresh; a mismatch re-queues rows on incremental update.
 */
export const TIER_DPS_SIM_REVISION = 13

/**
 * Earliest time strictly after `m.t` when any of `skills` becomes ready (cooldown end).
 * If every skill is already due (`readyAt <= m.t`), returns `cap` so the caller can idle
 * forward with autos until the window end — never use `Math.min` of past ready times,
 * which can be `<= m.t` and incorrectly abort the sim early.
 */
function nextSkillReadyAfter(m: { t: number; readyAt: Map<string, number> }, skills: WikiSkill[], cap: number) {
  let best = cap
  for (const s of skills) {
    const r = m.readyAt.get(s.id) ?? 0
    if (r > m.t + 1e-9 && r < best) best = r
  }
  return best
}

function effectiveCastTime(castTimeSec: number) {
  return Math.max(0.1, castTimeSec || 0)
}

function skillDamagePerCast(
  skill: WikiSkill,
  level: number,
  targets: number,
  _baseAttack: number,
  _perfectAtClone: boolean,
) {
  const base = skillDamageAtLevel(skill.base_dmg, skill.scaling, level, skill.max_level)
  const targetHits = skill.radius && skill.radius > 0 ? Math.max(1, targets) : 1
  void _baseAttack
  void _perfectAtClone
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
  atkSpeedPct: number
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
  atkSpeedPct: number
}

type DamageHold = { skillId: string; until: number }

function critRateToChance(critRateStat: number) {
  if (!Number.isFinite(critRateStat) || critRateStat <= 0) return 0
  return Math.max(0, Math.min(1, critRateStat / 100000))
}

/**
 * Bonus damage when a hit crits (before crit-damage buffs), as a fraction of non-crit damage.
 * Baseline crit bonus: +100% (crit hit = 2.0× non-crit before buff crit damage).
 */
const BASE_CRIT_DAMAGE_BONUS = 1.0

/**
 * Expected damage multiplier vs always non-crit: E = (1 − p) + p × (1 + BASE × cdMult)
 * where cdMult = (1 + buffCritDamage/100). Buff crit damage scales the crit bonus multiplicatively.
 */
function expectedCritMultiplier(critChance: number, buffCritDamagePct: number) {
  const chance = Math.max(0, Math.min(1, critChance))
  const critDamageMultiplier = 1 + Math.max(0, buffCritDamagePct) / 100
  return 1 + chance * BASE_CRIT_DAMAGE_BONUS * critDamageMultiplier
}

/**
 * Expected damage % from crit multiplier: buff crit rate/CD vs the same Digimon with wiki crit
 * chance and no buff crit damage. Wiki values are not “added”; they define the subtracted baseline.
 */
function buffCritMarginalDamagePct(
  baseCritRateStat: number,
  activeCritRatePct: number,
  activeCritDamagePct: number,
): number {
  const baseP = critRateToChance(baseCritRateStat)
  const multBase = expectedCritMultiplier(baseP, 0)
  const pBuffed = Math.max(0, Math.min(1, baseP + activeCritRatePct / 100))
  const multBuffed = expectedCritMultiplier(pBuffed, activeCritDamagePct)
  return Math.max(0, (multBuffed - multBase) * 100)
}

function supportProfiles(
  supportSkills: WikiSkill[],
  levelBySkillId: Record<string, number>,
): SupportBuffProfile[] {
  return supportSkills
    .map((s) => {
      const L = Math.max(1, Math.floor(levelBySkillId[s.id] ?? 25))
      const effects = buildSupportSkillEffects(s, L)
      let attackPct = 0
      let skillDamagePct = 0
      let flatAttack = 0
      let critRatePct = 0
      let critDamagePct = 0
      let atkSpeedPct = 0
      for (const e of effects) {
        const label = e.label.toLowerCase()
        if (e.unit === '%' && /(\bskill damage\b|\bskill dmg\b)/.test(label)) {
          skillDamagePct += e.valueAtLevel
        } else if (e.unit === '%' && /(\bcritical damage\b|\bcrit damage\b|\bcd\b)/.test(label)) {
          critDamagePct += e.valueAtLevel
        } else if (e.unit === '%' && /(\bcritical rate\b|\bcrit rate\b|\bct\b)/.test(label)) {
          critRatePct += e.valueAtLevel
        } else if (e.unit === '%' && /\battack speed\b/.test(label)) {
          atkSpeedPct += e.valueAtLevel
        } else if (
          e.unit === '%' &&
          /\battack( power)?\b/.test(label) &&
          !/\battack speed\b/.test(label)
        ) {
          attackPct += e.valueAtLevel
        } else if (!e.unit && /\battack( power)?\b/.test(label) && !/\battack speed\b/.test(label)) {
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
        atkSpeedPct,
      }
    })
    .filter(
      (p) =>
        p.durationSec > 0 &&
        (p.attackPct > 0 ||
          p.skillDamagePct > 0 ||
          p.flatAttack > 0 ||
          p.critRatePct > 0 ||
          p.critDamagePct > 0 ||
          p.atkSpeedPct > 0),
    )
}

export function estimateSupportAttackBuffPct(supportSkills: WikiSkill[], level: number) {
  let total = 0
  for (const s of supportSkills) {
    const effects = parseSupportEffectsFromSkill(s, level)
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
  const expectedCritPctBoost = buffCritMarginalDamagePct(baseCritRateStat, critRatePct, critDamagePct)
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
  forceAutoCrit: boolean
  perfectAtClone: boolean
  autoAttackAnimationCancel: boolean
  /** Auto-attack interval from wiki atk_speed stat only (no temporary buffs). */
  baseAutoIntervalSec: number
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
  damageCastCount: number
  autoDamageTotal: number
  autoHitCount: number
  /** Sum of total crit chance (0–1) on each auto hit — skills cannot crit. */
  autoHitCritChanceSum: number
  /** Sum of buff crit damage % on each auto hit. */
  autoHitCritBuffDamSum: number
}

/** Practical midpoint in the observed ~200–500ms cancel window. */
export const AUTO_ANIM_CANCEL_OVERLAP_SEC = 0.3
const AUTO_ANIM_CANCEL_MAX_WINDOW_SEC = 0.5

function autoIntervalFor(ctx: SimCtx, m: SimMutable): number {
  const atkSpdPct = m.activeBuffs.reduce((sum, b) => sum + (b.atkSpeedPct ?? 0), 0)
  const mult = 1 + Math.max(-0.85, atkSpdPct) / 100
  return Math.max(0.15, ctx.baseAutoIntervalSec / mult)
}

const BUFF_SPLIT_EPS = 1e-3

/**
 * Per-category contributions for one damage/auto hit — **active buffs only**.
 * Wiki Digimon stats are never summed into these +% chips: flat uses wiki attack only as a
 * denominator for “buff flat as %”; crit uses wiki crit only to compute a subtracted baseline
 * so the Crit chip is extra from buff crit rate/CD only (autos only — damage skills never crit).
 * Omits attack-speed-only buffs (cadence).
 */
function buildBuffContributionsForDamage(
  ctx: SimCtx,
  m: SimMutable,
  includeSkillPct: boolean,
  canCrit: boolean,
): BuffContribution[] {
  const out: BuffContribution[] = []
  const activeAttackPct = m.activeBuffs.reduce((sum, b) => sum + b.attackPct, 0)
  const activeSkillPct = m.activeBuffs.reduce((sum, b) => sum + b.skillDamagePct, 0)
  const activeFlatAtk = m.activeBuffs.reduce((sum, b) => sum + b.flatAttack, 0)
  const activeCritRatePct = m.activeBuffs.reduce((sum, b) => sum + b.critRatePct, 0)
  const activeCritDamagePct = m.activeBuffs.reduce((sum, b) => sum + b.critDamagePct, 0)
  const critChance = ctx.forceAutoCrit && canCrit
    ? 1
    : Math.max(0, Math.min(1, critRateToChance(ctx.baseCritRateStat) + activeCritRatePct / 100))
  const critMult = expectedCritMultiplier(critChance, activeCritDamagePct)
  const flatPct = ctx.baseAttack > 0 ? (activeFlatAtk / ctx.baseAttack) * 100 : 0
  const baseCritP = critRateToChance(ctx.baseCritRateStat)
  const buffCritMarginalPct = buffCritMarginalDamagePct(
    ctx.baseCritRateStat,
    activeCritRatePct,
    activeCritDamagePct,
  )

  if (activeAttackPct > BUFF_SPLIT_EPS) {
    const detailLines: string[] = [
      `Total attack % from active buffs: +${activeAttackPct.toFixed(2)}%.`,
      includeSkillPct
        ? canCrit
          ? 'Applied only on the AT term: (base AT + flat AT) × (1 + AT% ÷ 100), then multiplied by crit term if this skill can crit.'
          : 'Applied only on the AT term: (base AT + flat AT) × (1 + AT% ÷ 100) for this skill hit.'
        : 'Used inside (1 + attack% ÷ 100) for autos, before the crit multiplier.',
    ]
    for (const b of m.activeBuffs) {
      if (b.attackPct > BUFF_SPLIT_EPS) {
        detailLines.push(`${b.skillName}: +${b.attackPct.toFixed(2)}% attack`)
      }
    }
    out.push({ key: 'atk', label: 'ATK', valuePct: activeAttackPct, detailLines })
  }

  if (includeSkillPct && activeSkillPct > BUFF_SPLIT_EPS) {
    const detailLines: string[] = [
      `Total skill damage % from active buffs: +${activeSkillPct.toFixed(2)}%.`,
      'Applied only on base skill term: (clone-adjusted base skill) × (1 + skill damage% ÷ 100).',
    ]
    for (const b of m.activeBuffs) {
      if (b.skillDamagePct > BUFF_SPLIT_EPS) {
        detailLines.push(`${b.skillName}: +${b.skillDamagePct.toFixed(2)}% skill damage`)
      }
    }
    out.push({ key: 'skill', label: 'Skill', valuePct: activeSkillPct, detailLines })
  }

  if (flatPct > BUFF_SPLIT_EPS) {
    const detailLines: string[] = [
      `Total flat attack from buffs: ${activeFlatAtk.toFixed(0)}`,
      `The +% chip is buff flat only, expressed as % of wiki attack (${ctx.baseAttack}) so it lines up with attack/skill % — wiki attack is not added as a buff.`,
      `Equivalent %: (${activeFlatAtk.toFixed(0)} ÷ ${ctx.baseAttack}) × 100 = ${flatPct.toFixed(2)}%`,
    ]
    for (const b of m.activeBuffs) {
      if (b.flatAttack > BUFF_SPLIT_EPS) {
        detailLines.push(`${b.skillName}: +${b.flatAttack.toFixed(0)} flat attack`)
      }
    }
    out.push({ key: 'flat', label: 'Flat', valuePct: flatPct, detailLines })
  }

  if (canCrit && buffCritMarginalPct > BUFF_SPLIT_EPS) {
    const multBase = expectedCritMultiplier(baseCritP, 0)
    const detailLines: string[] = [
      includeSkillPct
        ? 'The +% chip is extra expected damage from buff crit rate and/or buff crit damage on the AT term for this crit-capable skill.'
        : 'The +% chip is extra expected damage from buff crit rate and/or buff crit damage on auto attacks.',
      'Your Digimon wiki crit_rate is used only to form a baseline multiplier that is subtracted out — it is not part of this +%.',
    ]
    if (activeCritRatePct > BUFF_SPLIT_EPS) {
      detailLines.push(
        `Buff crit rate % (UI values) sum to +${activeCritRatePct.toFixed(2)}%; each +1% adds 0.01 to crit chance p before the 0–1 cap.`,
      )
      for (const b of m.activeBuffs) {
        if (b.critRatePct > BUFF_SPLIT_EPS) {
          detailLines.push(`${b.skillName}: +${b.critRatePct.toFixed(2)}% crit rate`)
        }
      }
    }
    if (activeCritDamagePct > BUFF_SPLIT_EPS) {
      detailLines.push(`Total buff crit damage %: +${activeCritDamagePct.toFixed(2)}%`)
      for (const b of m.activeBuffs) {
        if (b.critDamagePct > BUFF_SPLIT_EPS) {
          detailLines.push(`${b.skillName}: +${b.critDamagePct.toFixed(2)}% crit damage`)
        }
      }
    }
    detailLines.push(
      `Expected mult with buffs ${critMult.toFixed(4)} vs baseline (wiki crit, base +${(BASE_CRIT_DAMAGE_BONUS * 100).toFixed(0)}% crit damage on crits, no buff crit damage) ${multBase.toFixed(4)} → buff marginal (mult_with − mult_baseline) × 100 = ${buffCritMarginalPct.toFixed(2)}%.`,
    )
    out.push({ key: 'crit', label: 'Crit', valuePct: buffCritMarginalPct, detailLines })
  }

  return out
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
    damageCastCount: m.damageCastCount,
    autoHitCritChanceSum: m.autoHitCritChanceSum,
    autoHitCritBuffDamSum: m.autoHitCritBuffDamSum,
    autoDamageTotal: m.autoDamageTotal,
    autoHitCount: m.autoHitCount,
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
      skillDamagePerCast(a, ctx.skillLevel(a), ctx.targets, ctx.baseAttack, ctx.perfectAtClone) /
      effectiveCastTime(a.cast_time_sec)
    const bScore =
      skillDamagePerCast(b, ctx.skillLevel(b), ctx.targets, ctx.baseAttack, ctx.perfectAtClone) /
      effectiveCastTime(b.cast_time_sec)
    return bScore - aScore
  })
}

function availableDamaging(ctx: SimCtx, m: SimMutable, hold: DamageHold | null) {
  let list = ctx.damaging.filter((s) => (m.readyAt.get(s.id) ?? 0) <= m.t)
  if (hold && m.t < hold.until) {
    // Always omit the held skill. If nothing else is ready, return [] so the main
    // loop can auto-attack / jump time instead of spinning on "defer" forever.
    list = list.filter((s) => s.id !== hold.skillId)
  }
  return sortDamageByDpct(ctx, list)
}

function parseSkillCritFlag(value: unknown): boolean | undefined {
  if (value === true || value === 1) return true
  if (value === false || value === 0) return false
  if (typeof value === 'string') {
    const norm = value.trim().toLowerCase()
    if (norm === 'true' || norm === '1' || norm === 'yes') return true
    if (norm === 'false' || norm === '0' || norm === 'no') return false
  }
  return undefined
}

/**
 * Prefer wiki `can_crit` when present.
 * Safe fallback: any damage skill (non-support-only) is treated as crit-capable.
 */
function skillCanCrit(skill: WikiSkill): boolean {
  const raw = skill as WikiSkill & Record<string, unknown>
  const parsed = parseSkillCritFlag(raw.can_crit ?? raw.canCrit ?? raw.can_critical)
  if (parsed !== undefined) return parsed
  return !skillIsSupportOnly(skill.base_dmg, skill.scaling)
}

/** Expected damage for one cast of `skill` with current buffs (no side effects). */
type DamageSkillHitSnapshot = {
  dmg: number
  totalBuffPct: number
  critCapable: boolean
}

function computeDamageSkillHitSnapshot(ctx: SimCtx, m: SimMutable, skill: WikiSkill): DamageSkillHitSnapshot {
  const usedLevel = ctx.skillLevel(skill)
  const activeAttackPct = m.activeBuffs.reduce((sum, b) => sum + b.attackPct, 0)
  const activeSkillPct = m.activeBuffs.reduce((sum, b) => sum + b.skillDamagePct, 0)
  const activeFlatAtk = m.activeBuffs.reduce((sum, b) => sum + b.flatAttack, 0)
  const activeCritRatePct = m.activeBuffs.reduce((sum, b) => sum + b.critRatePct, 0)
  const activeCritDamagePct = m.activeBuffs.reduce((sum, b) => sum + b.critDamagePct, 0)

  const baseSkillDamage = skillDamagePerCast(skill, usedLevel, ctx.targets, ctx.baseAttack, ctx.perfectAtClone)
  const cloneMultiplier = ctx.perfectAtClone ? 1.3 : 1
  const baseSkillTerm = baseSkillDamage * cloneMultiplier * (1 + activeSkillPct / 100)

  const atkBuffed = Math.max(0, ctx.baseAttack + activeFlatAtk) * (1 + activeAttackPct / 100)
  const critCapable = skillCanCrit(skill)
  const naturalP = naturalAutoCritChance(ctx.baseCritRateStat, activeCritRatePct)
  const critChance = ctx.forceAutoCrit && critCapable ? 1 : naturalP
  const critMult = critCapable ? expectedCritMultiplier(critChance, activeCritDamagePct) : 1
  const targetHits = skill.radius && skill.radius > 0 ? Math.max(1, ctx.targets) : 1
  const atkTerm = atkBuffed * critMult * targetHits
  const dmg = baseSkillTerm + atkTerm

  const baselineAtkTerm = Math.max(0, ctx.baseAttack) * targetHits
  const baselineDmg = baseSkillDamage + baselineAtkTerm
  const totalBuffPct = baselineDmg > 0 ? Math.max(0, ((dmg - baselineDmg) / baselineDmg) * 100) : 0
  return { dmg, totalBuffPct, critCapable }
}

function computeDamageSkillHit(ctx: SimCtx, m: SimMutable, skill: WikiSkill): number {
  return computeDamageSkillHitSnapshot(ctx, m, skill).dmg
}

type AutoHitSnapshot = {
  dmg: number
  totalBuffPct: number
  step: number
  activeAttackPct: number
  activeFlatAtk: number
  critChance: number
  activeCritDamagePct: number
}

/** Wiki stat + buff crit rate % → auto crit chance (0–1). */
function naturalAutoCritChance(baseCritRateStat: number, activeCritRatePctFromBuffs: number): number {
  return Math.max(
    0,
    Math.min(1, critRateToChance(baseCritRateStat) + activeCritRatePctFromBuffs / 100),
  )
}

/**
 * `'damage'` applies `forceAutoCrit` (100% crit autos). `'planning'` always uses natural p so
 * skill-vs-auto and lookahead match the non-forced sim (otherwise inflated rAuto lowers total DPS).
 */
function computeAutoHit(ctx: SimCtx, m: SimMutable, purpose: 'damage' | 'planning'): AutoHitSnapshot {
  const step = autoIntervalFor(ctx, m)
  const activeAttackPct = m.activeBuffs.reduce((sum, b) => sum + b.attackPct, 0)
  const activeFlatAtk = m.activeBuffs.reduce((sum, b) => sum + b.flatAttack, 0)
  const activeCritRatePct = m.activeBuffs.reduce((sum, b) => sum + b.critRatePct, 0)
  const activeCritDamagePct = m.activeBuffs.reduce((sum, b) => sum + b.critDamagePct, 0)
  const naturalP = naturalAutoCritChance(ctx.baseCritRateStat, activeCritRatePct)
  const critChance = ctx.forceAutoCrit && purpose === 'damage' ? 1 : naturalP
  const critMult = expectedCritMultiplier(critChance, activeCritDamagePct)
  const flatPct = ctx.baseAttack > 0 ? (activeFlatAtk / ctx.baseAttack) * 100 : 0
  const totalBuffPct =
    activeAttackPct +
    flatPct +
    buffCritMarginalDamagePct(ctx.baseCritRateStat, activeCritRatePct, activeCritDamagePct)
  const autoBase = Math.max(0, ctx.baseAttack + activeFlatAtk)
  const dmg = autoBase * (1 + activeAttackPct / 100) * critMult * Math.max(1, ctx.targets)
  return {
    dmg,
    totalBuffPct,
    step,
    activeAttackPct,
    activeFlatAtk,
    critChance,
    activeCritDamagePct,
  }
}

function performAutoAttack(ctx: SimCtx, m: SimMutable, recordEvents: boolean) {
  const snap = computeAutoHit(ctx, m, 'damage')
  m.totalDamage += snap.dmg
  m.autoDamageTotal += snap.dmg
  m.autoHitCount += 1
  m.damageCastCount += 1
  m.attackPctAtDamageCasts += snap.activeAttackPct
  m.flatAtkAtDamageCasts += snap.activeFlatAtk
  m.autoHitCritChanceSum += snap.critChance
  m.autoHitCritBuffDamSum += snap.activeCritDamagePct
  m.skillPctAtDamageCasts += 0
  m.casts += 1
  if (recordEvents) {
    m.events.push({
      atSec: m.t,
      skillId: 'auto-attack',
      skillName: 'Auto Attack',
      iconId: '',
      eventType: 'auto',
      castTimeSec: snap.step,
      damage: snap.dmg,
      buffedBy: m.activeBuffs.map((b) => b.skillName),
      totalBuffPct: snap.totalBuffPct,
      buffContributions:
        m.activeBuffs.length > 0 ? buildBuffContributionsForDamage(ctx, m, false, true) : undefined,
      cumulativeDamage: m.totalDamage,
    })
  }
  m.t += snap.step
  purgeExpiredBuffs(m, m.t)
}

/**
 * Auto attack animation cancel model:
 * - only valid when a real damage skill is cast right after the auto
 * - skill begins after ~300ms overlap window (inside observed 200–500ms range)
 * - next auto must still wait for the skill cast to finish
 */
function performAutoIntoSkillCancel(
  ctx: SimCtx,
  m: SimMutable,
  skill: WikiSkill,
  recordEvents: boolean,
) {
  const snap = computeAutoHit(ctx, m, 'damage')
  m.totalDamage += snap.dmg
  m.autoDamageTotal += snap.dmg
  m.autoHitCount += 1
  m.damageCastCount += 1
  m.attackPctAtDamageCasts += snap.activeAttackPct
  m.flatAtkAtDamageCasts += snap.activeFlatAtk
  m.autoHitCritChanceSum += snap.critChance
  m.autoHitCritBuffDamSum += snap.activeCritDamagePct
  m.skillPctAtDamageCasts += 0
  m.casts += 1
  const readyAt = m.readyAt.get(skill.id) ?? 0
  const waitUntilSkillReady = Math.max(0, readyAt - (m.t + AUTO_ANIM_CANCEL_OVERLAP_SEC))
  if (recordEvents) {
    m.events.push({
      atSec: m.t,
      skillId: 'auto-attack',
      skillName: 'Auto Attack',
      iconId: '',
      eventType: 'auto',
      castTimeSec: AUTO_ANIM_CANCEL_OVERLAP_SEC + waitUntilSkillReady,
      damage: snap.dmg,
      buffedBy: m.activeBuffs.map((b) => b.skillName),
      totalBuffPct: snap.totalBuffPct,
      buffContributions:
        m.activeBuffs.length > 0 ? buildBuffContributionsForDamage(ctx, m, false, true) : undefined,
      cumulativeDamage: m.totalDamage,
      cancelledBySkillName: skill.name,
    })
  }
  m.t += AUTO_ANIM_CANCEL_OVERLAP_SEC + waitUntilSkillReady
  purgeExpiredBuffs(m, m.t)
  castDamageSkill(ctx, m, skill, recordEvents, true)
}

function castDamageSkill(
  ctx: SimCtx,
  m: SimMutable,
  skill: WikiSkill,
  recordEvents: boolean,
  cancelledFromAuto: boolean = false,
) {
  const castTime = effectiveCastTime(skill.cast_time_sec)
  const activeAttackPct = m.activeBuffs.reduce((sum, b) => sum + b.attackPct, 0)
  const activeSkillPct = m.activeBuffs.reduce((sum, b) => sum + b.skillDamagePct, 0)
  const activeFlatAtk = m.activeBuffs.reduce((sum, b) => sum + b.flatAttack, 0)
  const hit = computeDamageSkillHitSnapshot(ctx, m, skill)
  const dmg = hit.dmg

  m.totalDamage += dmg
  m.damageCastCount += 1
  m.attackPctAtDamageCasts += activeAttackPct
  m.skillPctAtDamageCasts += activeSkillPct
  m.flatAtkAtDamageCasts += activeFlatAtk
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
      totalBuffPct: hit.totalBuffPct,
      buffContributions:
        m.activeBuffs.length > 0 ? buildBuffContributionsForDamage(ctx, m, true, hit.critCapable) : undefined,
      cumulativeDamage: m.totalDamage,
      cancelledFromAuto,
    })
  }
  m.readyAt.set(skill.id, m.t + (skill.cooldown_sec || 0))
  m.t += castTime
}

function soonReadyDamageWithinCancelWindow(
  ctx: SimCtx,
  m: SimMutable,
  hold: DamageHold | null,
): WikiSkill | null {
  const autoNow = computeAutoHit(ctx, m, 'planning')
  let best: WikiSkill | null = null
  let bestScore = -Infinity
  for (const s of ctx.damaging) {
    if (hold && m.t < hold.until && hold.skillId === s.id) continue
    const dt = (m.readyAt.get(s.id) ?? 0) - m.t
    if (dt <= 0 || dt > AUTO_ANIM_CANCEL_MAX_WINDOW_SEC + 1e-9) continue
    const castT = effectiveCastTime(s.cast_time_sec)
    const skillStartDt = Math.max(AUTO_ANIM_CANCEL_OVERLAP_SEC, dt)
    const shadow = cloneSim(m)
    shadow.t = m.t + skillStartDt
    purgeExpiredBuffs(shadow, shadow.t)
    const skillDmgAtStart = computeDamageSkillHit(ctx, shadow, s)
    // Cancel value uses auto hit now + skill at actual start time (with buff timing).
    const score = (autoNow.dmg + skillDmgAtStart) / (skillStartDt + castT)
    if (score > bestScore) {
      bestScore = score
      best = s
    }
  }
  return best
}

function castSupportProfile(
  _ctx: SimCtx,
  m: SimMutable,
  chosen: SupportBuffProfile,
  recordEvents: boolean,
  cancelledFromAuto: boolean = false,
) {
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
      cancelledFromAuto,
    })
  }
  m.readyAt.set(chosen.skill.id, m.t + (chosen.skill.cooldown_sec || 0))
  const startAt = m.t + castTime
  if (isHybridStanceSkillId(chosen.skill.id)) {
    m.activeBuffs = m.activeBuffs.filter((b) => !isHybridStanceSkillId(b.skillId))
  }
  m.activeBuffs.push({
    skillId: chosen.skill.id,
    skillName: chosen.skill.name,
    untilSec: startAt + chosen.durationSec,
    attackPct: chosen.attackPct,
    skillDamagePct: chosen.skillDamagePct,
    flatAttack: chosen.flatAttack,
    critRatePct: chosen.critRatePct,
    critDamagePct: chosen.critDamagePct,
    atkSpeedPct: chosen.atkSpeedPct,
  })
  m.t += castTime
}

function performAutoIntoSupportCancel(
  ctx: SimCtx,
  m: SimMutable,
  chosen: SupportBuffProfile,
  recordEvents: boolean,
) {
  const snap = computeAutoHit(ctx, m, 'damage')
  m.totalDamage += snap.dmg
  m.autoDamageTotal += snap.dmg
  m.autoHitCount += 1
  m.damageCastCount += 1
  m.attackPctAtDamageCasts += snap.activeAttackPct
  m.flatAtkAtDamageCasts += snap.activeFlatAtk
  m.autoHitCritChanceSum += snap.critChance
  m.autoHitCritBuffDamSum += snap.activeCritDamagePct
  m.skillPctAtDamageCasts += 0
  m.casts += 1
  if (recordEvents) {
    m.events.push({
      atSec: m.t,
      skillId: 'auto-attack',
      skillName: 'Auto Attack',
      iconId: '',
      eventType: 'auto',
      castTimeSec: AUTO_ANIM_CANCEL_OVERLAP_SEC,
      damage: snap.dmg,
      buffedBy: m.activeBuffs.map((b) => b.skillName),
      totalBuffPct: snap.totalBuffPct,
      buffContributions:
        m.activeBuffs.length > 0 ? buildBuffContributionsForDamage(ctx, m, false, true) : undefined,
      cumulativeDamage: m.totalDamage,
      cancelledBySkillName: chosen.skill.name,
    })
  }
  m.t += AUTO_ANIM_CANCEL_OVERLAP_SEC
  purgeExpiredBuffs(m, m.t)
  castSupportProfile(ctx, m, chosen, recordEvents, true)
}


/**
 * Greedy timeline without lookahead: supports > damage (DPCT, optional ban) > autos / jump.
 * When a damage skill is ready, if current auto damage rate (per wiki atk_speed + attack-speed
 * buffs) exceeds that skill’s damage ÷ cast time, we weave an auto instead of casting that skill.
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
        const aScore = a.attackPct + a.skillDamagePct + aFlat + a.atkSpeedPct * 0.12
        const bScore = b.attackPct + b.skillDamagePct + bFlat + b.atkSpeedPct * 0.12
        return bScore - aScore
      })
      if (ctx.autoAttackAnimationCancel) {
        performAutoIntoSupportCancel(ctx, m, availableSupport[0], recordEvents)
        continue
      }
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
      while (m.t < wall - 1e-9) {
        const step = autoIntervalFor(ctx, m)
        if (m.t + step > holdEnd + 1e-9) break
        performAutoAttack(ctx, m, recordEvents)
      }
      m.t = Math.min(Math.max(m.t, holdEnd), wall)
      continue
    }

    if (available.length === 0) {
      if (ctx.autoAttackAnimationCancel) {
        const soon = soonReadyDamageWithinCancelWindow(ctx, m, damageBan)
        if (soon) {
          performAutoIntoSkillCancel(ctx, m, soon, recordEvents)
          continue
        }
      }
      const nextReady = nextSkillReadyAfter(
        m,
        [...ctx.damaging, ...ctx.supportBuffs.map((p) => p.skill)],
        wall,
      )

      while (m.t < wall - 1e-9) {
        const step = autoIntervalFor(ctx, m)
        if (m.t + step > nextReady + 1e-9) break
        performAutoAttack(ctx, m, recordEvents)
      }
      m.t = Math.max(m.t, Math.min(nextReady, wall))
      continue
    }

    const chosen = available[0]
    const castT = effectiveCastTime(chosen.cast_time_sec)
    const skillDmg = computeDamageSkillHit(ctx, m, chosen)
    const snap = computeAutoHit(ctx, m, 'planning')
    const rAuto = snap.dmg / snap.step
    const rSkill = skillDmg / castT
    const rCancelCombo = (snap.dmg + skillDmg) / (AUTO_ANIM_CANCEL_OVERLAP_SEC + castT)

    if (
      ctx.autoAttackAnimationCancel &&
      rCancelCombo > rSkill + 1e-9
    ) {
      performAutoIntoSkillCancel(ctx, m, chosen, recordEvents)
      continue
    }
    // In animation-cancel mode, avoid uncancelled auto weaving when a skill is ready.
    // If auto->skill cancel is not better, cast the skill directly.
    if (ctx.autoAttackAnimationCancel) {
      castDamageSkill(ctx, m, chosen, recordEvents)
      continue
    }
    if (rAuto > rSkill + 1e-9) {
      performAutoAttack(ctx, m, recordEvents)
      continue
    }
    castDamageSkill(ctx, m, chosen, recordEvents)
  }
}

const LOOKAHEAD_SEC = 12
const LOOKAHEAD_MAX_FRACTION = 0.35

/** Cap damage skills considered as first/second beam branches (sorted by DPCT). */
const BEAM_DAMAGE_SKILL_CAP = 6
/** Max support profiles tried when several buffs are ready at once (order matters). */
const SUPPORT_BEAM_TRY = 4
/** Greedy rollout horizon after a tentative support cast when comparing support order. */
const SUPPORT_BEAM_HORIZON_SEC = 12

type DamageChoice =
  | { kind: 'skill'; skill: WikiSkill }
  | { kind: 'auto' }
  | { kind: 'hold'; skillId: string; until: number }

function applyDamageChoice(ctx: SimCtx, m: SimMutable, ch: DamageChoice, recordEvents: boolean) {
  if (ch.kind === 'auto') {
    performAutoAttack(ctx, m, recordEvents)
    return
  }
  if (ch.kind === 'hold') {
    return
  }
  const sk = ch.skill
  const castT = effectiveCastTime(sk.cast_time_sec)
  const skillDmg = computeDamageSkillHit(ctx, m, sk)
  const snap = computeAutoHit(ctx, m, 'planning')
  const rSkill = skillDmg / castT
  const rCancelCombo = (snap.dmg + skillDmg) / (AUTO_ANIM_CANCEL_OVERLAP_SEC + castT)
  if (ctx.autoAttackAnimationCancel && rCancelCombo > rSkill + 1e-9) {
    performAutoIntoSkillCancel(ctx, m, sk, recordEvents)
  } else if (ctx.autoAttackAnimationCancel) {
    castDamageSkill(ctx, m, sk, recordEvents)
  } else {
    castDamageSkill(ctx, m, sk, recordEvents)
  }
}

function enumerateDamageChoices(
  ctx: SimCtx,
  _m: SimMutable,
  available: WikiSkill[],
  branchWall: number,
  primary: WikiSkill | undefined,
): DamageChoice[] {
  const out: DamageChoice[] = []
  const lim = Math.min(BEAM_DAMAGE_SKILL_CAP, available.length)
  for (let i = 0; i < lim; i += 1) {
    out.push({ kind: 'skill', skill: available[i] })
  }
  out.push({ kind: 'auto' })
  if (!ctx.autoAttackAnimationCancel && primary) {
    out.push({ kind: 'hold', skillId: primary.id, until: branchWall })
  }
  return out
}

function evaluateDamagePathGain(
  ctx: SimCtx,
  base: SimMutable,
  branchWall: number,
  actions: DamageChoice[],
): number {
  const sh = cloneSim(base)
  for (let i = 0; i < actions.length; i += 1) {
    const a = actions[i]
    if (a.kind === 'hold') {
      runGreedyUntilWall(ctx, sh, branchWall, { skillId: a.skillId, until: a.until }, false)
      return sh.totalDamage - base.totalDamage
    }
    applyDamageChoice(ctx, sh, a, false)
    if (sh.t >= branchWall - 1e-9) {
      return sh.totalDamage - base.totalDamage
    }
  }
  runGreedyUntilWall(ctx, sh, branchWall, null, false)
  return sh.totalDamage - base.totalDamage
}

/**
 * Beam rollout (depth 2): compare pairs of immediate actions + greedy tail to `branchWall`,
 * then pick the first action of the best-scoring path. Replaces flat primary/secondary/hold.
 */
function beamDamageDecision(
  ctx: SimCtx,
  m: SimMutable,
  branchWall: number,
  available: WikiSkill[],
): { tag: 'hold'; ban: DamageHold } | { tag: 'auto' } | { tag: 'skill'; skill: WikiSkill } {
  const primary = available[0]
  const firstChoices = enumerateDamageChoices(ctx, m, available, branchWall, primary)

  let bestGain = -Infinity
  let bestFirst: DamageChoice | null = null

  for (const c1 of firstChoices) {
    if (c1.kind === 'hold') {
      const g = evaluateDamagePathGain(ctx, m, branchWall, [c1])
      if (g > bestGain + 1e-9) {
        bestGain = g
        bestFirst = c1
      }
      continue
    }

    const sh1 = cloneSim(m)
    applyDamageChoice(ctx, sh1, c1, false)
    if (sh1.t >= branchWall - 1e-9) {
      const g = sh1.totalDamage - m.totalDamage
      if (g > bestGain + 1e-9) {
        bestGain = g
        bestFirst = c1
      }
      continue
    }

    const avail2 = availableDamaging(ctx, sh1, null)
    if (avail2.length === 0) {
      runGreedyUntilWall(ctx, sh1, branchWall, null, false)
      const g = sh1.totalDamage - m.totalDamage
      if (g > bestGain + 1e-9) {
        bestGain = g
        bestFirst = c1
      }
      continue
    }

    const prim2 = avail2[0]
    const secondChoices = enumerateDamageChoices(ctx, sh1, avail2, branchWall, prim2)
    for (const c2 of secondChoices) {
      const g = evaluateDamagePathGain(ctx, m, branchWall, [c1, c2])
      if (g > bestGain + 1e-9) {
        bestGain = g
        bestFirst = c1
      }
    }
  }

  if (!bestFirst || bestFirst.kind === 'skill') {
    const sk = bestFirst?.kind === 'skill' ? bestFirst.skill : primary
    return { tag: 'skill', skill: sk }
  }
  if (bestFirst.kind === 'hold') {
    return { tag: 'hold', ban: { skillId: bestFirst.skillId, until: bestFirst.until } }
  }
  return { tag: 'auto' }
}

export type RotationSimOptions = {
  /** Wiki Digimon role; enables Digimon role skills in the sim (not tamer skills). */
  role?: string | null
  /** Hybrid only. `'best'` runs all three stances and keeps the highest DPS (tier list default). */
  hybridStance?: HybridStance | 'best'
  /**
   * Guaranteed crit for direct damage that can crit (autos + crit-capable skills).
   * Skill-vs-auto weaving and lookahead still use natural crit chance on autos.
   */
  forceAutoCrit?: boolean
  /** Perfect AT clone: apply a 1.3× multiplier to base skill term. */
  perfectAtClone?: boolean
  /** Assume repeated auto animation cancel with skills whenever available. */
  autoAttackAnimationCancel?: boolean
  /**
   * Optional fixed cast sequence for Lab custom mode. The sim follows this list in order
   * (wrapping at the end), waiting/auto-attacking until the next listed skill is ready.
   */
  customRotation?: Array<{ skillId: string }>
  /** When true, support skills are cast only if present in `customRotation`. */
  manualSupportOnly?: boolean
}

type RotationSimCoreOpts = {
  roleNorm: string
  hybridStance: HybridStance
  forceAutoCrit: boolean
  perfectAtClone: boolean
  autoAttackAnimationCancel: boolean
  useCustomRotation: boolean
  customRotationSkillIds: string[]
  manualSupportOnly: boolean
}

function runCustomRotationSequence(
  ctx: SimCtx,
  m: SimMutable,
  durationSec: number,
  supportBuffs: SupportBuffProfile[],
  sequenceSkillIds: string[],
  manualSupportOnly: boolean,
): void {
  const supportById = new Map(supportBuffs.map((p) => [p.skill.id, p] as const))
  const damagingById = new Map(ctx.damaging.map((s) => [s.id, s] as const))
  const usableIds = sequenceSkillIds.filter(
    (id) => id === 'auto-attack' || supportById.has(id) || damagingById.has(id),
  )
  if (usableIds.length === 0) return

  let seqIdx = 0
  let stepGuard = 0
  while (m.t < durationSec - 1e-9) {
    if (++stepGuard > 250000) {
      console.error('[dpsSim] runCustomRotationSequence: step limit exceeded, aborting early')
      break
    }
    purgeExpiredBuffs(m, m.t)

    if (!manualSupportOnly) {
      const availableSupport = supportBuffs.filter((p) => {
        const ready = (m.readyAt.get(p.skill.id) ?? 0) <= m.t
        const alreadyUp = m.activeBuffs.some((b) => b.skillId === p.skill.id && b.untilSec > m.t)
        return ready && !alreadyUp
      })
      if (availableSupport.length > 0) {
        availableSupport.sort((a, b) => {
          const aFlat = ctx.baseAttack > 0 ? (a.flatAttack / ctx.baseAttack) * 100 : 0
          const bFlat = ctx.baseAttack > 0 ? (b.flatAttack / ctx.baseAttack) * 100 : 0
          const aScore = a.attackPct + a.skillDamagePct + aFlat + a.atkSpeedPct * 0.12
          const bScore = b.attackPct + b.skillDamagePct + bFlat + b.atkSpeedPct * 0.12
          return bScore - aScore
        })
        if (ctx.autoAttackAnimationCancel) {
          performAutoIntoSupportCancel(ctx, m, availableSupport[0], true)
          continue
        }
        castSupportProfile(ctx, m, availableSupport[0], true)
        continue
      }
    }

    const chosenId = usableIds[seqIdx]
    if (chosenId === 'auto-attack') {
      performAutoAttack(ctx, m, true)
      seqIdx = (seqIdx + 1) % usableIds.length
      continue
    }
    const support = supportById.get(chosenId)
    const damageSkill = damagingById.get(chosenId)
    if (!support && !damageSkill) {
      seqIdx = (seqIdx + 1) % usableIds.length
      continue
    }

    if (support) {
      const ready = (m.readyAt.get(support.skill.id) ?? 0) <= m.t
      const alreadyUp = m.activeBuffs.some((b) => b.skillId === support.skill.id && b.untilSec > m.t)
      if (ready && !alreadyUp) {
        if (ctx.autoAttackAnimationCancel) performAutoIntoSupportCancel(ctx, m, support, true)
        else castSupportProfile(ctx, m, support, true)
        seqIdx = (seqIdx + 1) % usableIds.length
        continue
      }
      const nextReady = Math.max(m.t, m.readyAt.get(support.skill.id) ?? m.t)
      while (m.t < durationSec - 1e-9) {
        const step = autoIntervalFor(ctx, m)
        if (m.t + step > nextReady + 1e-9) break
        performAutoAttack(ctx, m, true)
      }
      m.t = Math.max(m.t, Math.min(nextReady, durationSec))
      continue
    }

    const skill = damageSkill as WikiSkill
    const readyAt = m.readyAt.get(skill.id) ?? 0
    if (readyAt > m.t + 1e-9) {
      const dt = readyAt - m.t
      if (
        ctx.autoAttackAnimationCancel &&
        dt <= AUTO_ANIM_CANCEL_MAX_WINDOW_SEC + 1e-9 &&
        dt > 0
      ) {
        performAutoIntoSkillCancel(ctx, m, skill, true)
        seqIdx = (seqIdx + 1) % usableIds.length
        continue
      }
      while (m.t < durationSec - 1e-9) {
        const step = autoIntervalFor(ctx, m)
        if (m.t + step > readyAt + 1e-9) break
        performAutoAttack(ctx, m, true)
      }
      m.t = Math.max(m.t, Math.min(readyAt, durationSec))
      continue
    }

    const castT = effectiveCastTime(skill.cast_time_sec)
    const skillDmg = computeDamageSkillHit(ctx, m, skill)
    const snap = computeAutoHit(ctx, m, 'planning')
    const rAuto = snap.dmg / snap.step
    const rSkill = skillDmg / castT
    const rCancelCombo = (snap.dmg + skillDmg) / (AUTO_ANIM_CANCEL_OVERLAP_SEC + castT)
    if (ctx.autoAttackAnimationCancel && rCancelCombo > rSkill + 1e-9) {
      performAutoIntoSkillCancel(ctx, m, skill, true)
      seqIdx = (seqIdx + 1) % usableIds.length
      continue
    }
    if (ctx.autoAttackAnimationCancel) {
      castDamageSkill(ctx, m, skill, true)
      seqIdx = (seqIdx + 1) % usableIds.length
      continue
    }
    if (rAuto > rSkill + 1e-9) {
      performAutoAttack(ctx, m, true)
      continue
    }
    castDamageSkill(ctx, m, skill, true)
    seqIdx = (seqIdx + 1) % usableIds.length
  }
}

function runRotationSim(
  skills: WikiSkill[] | undefined | null,
  levelBySkillId: Record<string, number>,
  durationSec: number,
  targets: number,
  baseAttack: number,
  attackSpeed: number,
  baseCritRateStat: number,
  core: RotationSimCoreOpts,
): RotationResult {
  const list = Array.isArray(skills) ? skills : []
  const damaging = list.filter((s) => !skillIsSupportOnly(s.base_dmg, s.scaling))
  const support = list.filter((s) => skillIsSupportOnly(s.base_dmg, s.scaling))
  const digimonRoleSkills = digimonRoleWikiSkills(core.roleNorm, core.hybridStance)
  const profileLevels: Record<string, number> = { ...levelBySkillId }
  for (const s of digimonRoleSkills) profileLevels[s.id] = profileLevels[s.id] ?? 25

  const supportBuffs = [
    ...supportProfiles(digimonRoleSkills, profileLevels),
    ...supportProfiles(support, profileLevels),
  ]
  const supportMerged = [...digimonRoleSkills, ...support]
  const skillLevel = (skill: WikiSkill) => {
    const requested = profileLevels[skill.id] ?? 25
    const cap = Math.max(1, Math.min(skill.max_level || 25, 25))
    return Math.max(1, Math.min(Math.floor(requested), cap))
  }
  if (damaging.length === 0) {
    const buffs = estimateSupportDpsBuffs(supportMerged, profileLevels, baseAttack, baseCritRateStat)
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
      autoDamageTotal: 0,
      autoAttackHits: 0,
      autoDamageAvg: 0,
      autoDps: 0,
      events: [],
    }
  }

  const buffs = estimateSupportDpsBuffs(supportMerged, profileLevels, baseAttack, baseCritRateStat)
  const baseAutoIntervalSec = attackSpeed > 0 ? Math.max(0.35, attackSpeed / 1000) : 1.5

  const ctx: SimCtx = {
    damaging,
    supportBuffs,
    durationSec,
    targets,
    baseAttack,
    baseCritRateStat,
    forceAutoCrit: core.forceAutoCrit,
    perfectAtClone: core.perfectAtClone,
    autoAttackAnimationCancel: core.autoAttackAnimationCancel,
    baseAutoIntervalSec,
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
    damageCastCount: 0,
    autoDamageTotal: 0,
    autoHitCount: 0,
    autoHitCritChanceSum: 0,
    autoHitCritBuffDamSum: 0,
  }

  let damageHold: DamageHold | null = null

  try {
  if (core.useCustomRotation) {
    runCustomRotationSequence(
      ctx,
      m,
      durationSec,
      supportBuffs,
      core.customRotationSkillIds,
      core.manualSupportOnly,
    )
  } else {
  let stepGuard = 0
  while (m.t < durationSec - 1e-9) {
    if (++stepGuard > 250000) {
      console.error('[dpsSim] simulateRotation: step limit exceeded, aborting early')
      break
    }
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
        const aScore = a.attackPct + a.skillDamagePct + aFlat + a.atkSpeedPct * 0.12
        const bScore = b.attackPct + b.skillDamagePct + bFlat + b.atkSpeedPct * 0.12
        return bScore - aScore
      })
      const trySupport = availableSupport.slice(0, SUPPORT_BEAM_TRY)
      let bestP = trySupport[0]
      if (trySupport.length > 1) {
        let bestDelta = -Infinity
        const supWall = Math.min(durationSec, m.t + SUPPORT_BEAM_HORIZON_SEC)
        for (const p of trySupport) {
          const sh = cloneSim(m)
          if (ctx.autoAttackAnimationCancel) performAutoIntoSupportCancel(ctx, sh, p, false)
          else castSupportProfile(ctx, sh, p, false, false)
          runGreedyUntilWall(ctx, sh, supWall, null, false)
          const delta = sh.totalDamage - m.totalDamage
          if (delta > bestDelta + 1e-9) {
            bestDelta = delta
            bestP = p
          }
        }
      }
      if (ctx.autoAttackAnimationCancel) {
        performAutoIntoSupportCancel(ctx, m, bestP, true)
        continue
      }
      castSupportProfile(ctx, m, bestP, true)
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
      while (m.t < durationSec - 1e-9) {
        const step = autoIntervalFor(ctx, m)
        if (m.t + step > holdEnd + 1e-9) break
        performAutoAttack(ctx, m, true)
      }
      m.t = Math.min(Math.max(m.t, holdEnd), durationSec)
      continue
    }

    if (available.length === 0) {
      if (ctx.autoAttackAnimationCancel) {
        const soon = soonReadyDamageWithinCancelWindow(ctx, m, damageHold)
        if (soon) {
          performAutoIntoSkillCancel(ctx, m, soon, true)
          continue
        }
      }
      const nextReady = nextSkillReadyAfter(
        m,
        [...damaging, ...supportBuffs.map((p) => p.skill)],
        durationSec,
      )

      while (m.t < durationSec - 1e-9) {
        const step = autoIntervalFor(ctx, m)
        if (m.t + step > nextReady + 1e-9) break
        performAutoAttack(ctx, m, true)
      }
      m.t = Math.max(m.t, nextReady)
      continue
    }

    const horizon = Math.min(
      LOOKAHEAD_SEC,
      Math.max(0, durationSec - m.t) * LOOKAHEAD_MAX_FRACTION,
    )
    const branchWall = Math.min(durationSec, m.t + Math.max(0.5, horizon))

    const decision = beamDamageDecision(ctx, m, branchWall, available)
    if (decision.tag === 'hold') {
      damageHold = decision.ban
      continue
    }
    if (decision.tag === 'auto') {
      performAutoAttack(ctx, m, true)
      continue
    }
    applyDamageChoice(ctx, m, { kind: 'skill', skill: decision.skill }, true)
  }
  }

  const autoHits = m.autoHitCount
  const autoTot = m.autoDamageTotal

  return {
    totalDamage: m.totalDamage,
    dps: durationSec > 0 ? m.totalDamage / durationSec : 0,
    casts: m.casts,
    durationSec,
    autoDamageTotal: autoTot,
    autoAttackHits: autoHits,
    autoDamageAvg: autoHits > 0 ? autoTot / autoHits : 0,
    autoDps: durationSec > 0 ? autoTot / durationSec : 0,
    attackBuffPct:
      m.damageCastCount > 0 ? m.attackPctAtDamageCasts / m.damageCastCount : buffs.attackPct,
    skillDamageBuffPct:
      m.damageCastCount > 0 ? m.skillPctAtDamageCasts / m.damageCastCount : buffs.skillDamagePct,
    attackPowerFlat:
      m.damageCastCount > 0 ? m.flatAtkAtDamageCasts / m.damageCastCount : buffs.flatAttack,
    critRatePct:
      m.autoHitCount > 0
        ? (m.autoHitCritChanceSum / m.autoHitCount) * 100
        : buffs.critRatePct,
    critDamagePct:
      m.autoHitCount > 0 ? m.autoHitCritBuffDamSum / m.autoHitCount : buffs.critDamagePct,
    totalDpsBuffPct:
      m.damageCastCount > 0
        ? (m.attackPctAtDamageCasts + m.skillPctAtDamageCasts) / m.damageCastCount +
          (baseAttack > 0 ? (m.flatAtkAtDamageCasts / m.damageCastCount / baseAttack) * 100 : 0) +
          (m.totalDamage > 0 && m.autoHitCount > 0
            ? (m.autoDamageTotal / m.totalDamage) *
              ((expectedCritMultiplier(
                Math.max(0, Math.min(1, m.autoHitCritChanceSum / m.autoHitCount)),
                m.autoHitCritBuffDamSum / m.autoHitCount,
              ) -
                1) *
                100)
            : 0)
        : buffs.totalDpsBuffPct,
    events: m.events,
  }
  } catch (err) {
    console.error('[dpsSim] runRotationSim failed', err)
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
      autoDamageTotal: 0,
      autoAttackHits: 0,
      autoDamageAvg: 0,
      autoDps: 0,
      events: [],
    }
  }
}

export function simulateRotation(
  skills: WikiSkill[] | undefined | null,
  levelBySkillId: Record<string, number>,
  durationSec: number,
  targets: number,
  baseAttack: number = 0,
  attackSpeed: number = 0,
  baseCritRateStat: number = 0,
  options?: RotationSimOptions,
): RotationResult {
  const normalizedDurationSec = clampRotationDurationSec(durationSec)
  const roleNorm = normalizeWikiRole(options?.role ?? '')
  const hybridOpt = options?.hybridStance

  if (roleNorm === 'hybrid' && (hybridOpt === undefined || hybridOpt === 'best')) {
    let best: RotationResult | null = null
    for (const st of ['melee', 'ranged', 'caster'] as const) {
      const r = runRotationSim(
        skills,
        levelBySkillId,
        normalizedDurationSec,
        targets,
        baseAttack,
        attackSpeed,
        baseCritRateStat,
        {
          roleNorm,
          hybridStance: st,
          forceAutoCrit: options?.forceAutoCrit === true,
          perfectAtClone: options?.perfectAtClone === true,
          autoAttackAnimationCancel: options?.autoAttackAnimationCancel === true,
          useCustomRotation: Array.isArray(options?.customRotation),
          customRotationSkillIds: (options?.customRotation ?? []).map((row) => row.skillId),
          manualSupportOnly: options?.manualSupportOnly === true,
        },
      )
      if (!best || r.dps > best.dps) best = r
    }
    return best as RotationResult
  }

  const hybridConcrete: HybridStance =
    roleNorm === 'hybrid' &&
    (hybridOpt === 'melee' || hybridOpt === 'ranged' || hybridOpt === 'caster')
      ? hybridOpt
      : 'melee'

  return runRotationSim(
    skills,
    levelBySkillId,
    normalizedDurationSec,
    targets,
    baseAttack,
    attackSpeed,
    baseCritRateStat,
    {
      roleNorm,
      hybridStance: hybridConcrete,
      forceAutoCrit: options?.forceAutoCrit === true,
      perfectAtClone: options?.perfectAtClone === true,
      autoAttackAnimationCancel: options?.autoAttackAnimationCancel === true,
      useCustomRotation: Array.isArray(options?.customRotation),
      customRotationSkillIds: (options?.customRotation ?? []).map((row) => row.skillId),
      manualSupportOnly: options?.manualSupportOnly === true,
    },
  )
}
