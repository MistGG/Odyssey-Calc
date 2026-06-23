import type { WikiDigimonDetail, WikiSkill } from '../types/wikiApi'
import {
  isMeterAutoAttackSkill,
  METER_AUTO_ATTACK_LABEL,
} from './meterBasicAttack'
import type { MeterSkillRow } from './meterParsePayload'
import { skillDamageAtLevel, skillIsSupportOnly } from './skillDamage'
import {
  simulateRotation,
  type RotationEvent,
  type RotationResult,
} from './dpsSim'
import { SKILL_LEVEL_CAP } from './skillDamage'

export type RotationSkillTooltip = {
  name: string
  description: string
  element: string
  isSupport: boolean
  baseDmg: number
  scaling: number
  damageAtLevel: number
  skillLevel: number
  cooldownSec: number
  castTimeSec: number
  dsCost: number
  radius?: number
  buffDuration?: number
}

export type SkillRotationComparison = {
  skillId: string | null
  skillName: string
  skillIconId: string | null
  skillTooltip: RotationSkillTooltip | null
  isSupport: boolean
  actualDamage: number
  actualHits: number
  estimatedCasts: number
  optimalCasts: number
  actualDamageSharePct: number
  optimalDamageSharePct: number
  castTimeSec: number
  estimatedBusySec: number
}

export type RotationSuggestion = {
  severity: 'high' | 'medium' | 'low'
  title: string
  detail: string
  skillIconId: string | null
  skillTooltip: RotationSkillTooltip | null
}

export type RotationGapWindow = {
  startSec: number
  endSec: number
  durationSec: number
}

export type RotationAnalysisResult = {
  digimonId: string
  digimonName: string
  digimonModelId: string
  durationSec: number
  skillLevel: number
  actualDps: number
  optimalDps: number
  dpsGapPct: number
  uptimeSec: number
  downtimeSec: number
  uptimePct: number
  downtimePct: number
  optimalUptimePct: number
  optimalDowntimePct: number
  skillComparisons: SkillRotationComparison[]
  suggestions: RotationSuggestion[]
  optimalGaps: RotationGapWindow[]
}

function normKey(v: string | undefined | null): string {
  return String(v ?? '').trim().toLowerCase()
}

function matchWikiSkill(
  meterSkill: MeterSkillRow,
  wikiSkills: WikiSkill[],
): WikiSkill | null {
  const key = normKey(meterSkill.skillKey)
  if (key) {
    const byId = wikiSkills.find((s) => normKey(s.id) === key)
    if (byId) return byId
  }
  const name = normKey(meterSkill.skill)
  if (!name || name === normKey(METER_AUTO_ATTACK_LABEL)) return null
  return wikiSkills.find((s) => normKey(s.name) === name) ?? null
}

function optimalCastStats(events: RotationEvent[]): Map<string, { casts: number; damage: number; avgHits: number }> {
  const map = new Map<string, { casts: number; damage: number; hits: number }>()
  for (const ev of events) {
    if (ev.eventType !== 'damage' && ev.eventType !== 'auto') continue
    const id = ev.skillId || ev.skillName
    const prev = map.get(id) ?? { casts: 0, damage: 0, hits: 0 }
    prev.casts += 1
    prev.damage += ev.damage
    const hits =
      ev.damageBreakdown?.kind === 'skill' ? Math.max(1, ev.damageBreakdown.targetHits) : 1
    prev.hits += hits
    map.set(id, prev)
  }
  const out = new Map<string, { casts: number; damage: number; avgHits: number }>()
  for (const [id, row] of map) {
    out.set(id, {
      casts: row.casts,
      damage: row.damage,
      avgHits: row.casts > 0 ? row.hits / row.casts : 1,
    })
  }
  return out
}

function skillTooltipFromWiki(
  wikiSkill: WikiSkill | null,
  skillLevel: number,
  isSupport: boolean,
): RotationSkillTooltip | null {
  if (!wikiSkill) return null
  const level = Math.max(1, Math.min(skillLevel, wikiSkill.max_level))
  const damageAtLevel = isSupport
    ? 0
    : skillDamageAtLevel(
        wikiSkill.base_dmg,
        wikiSkill.scaling,
        level,
        wikiSkill.max_level,
      )
  return {
    name: wikiSkill.name,
    description: wikiSkill.description?.trim() ?? '',
    element: wikiSkill.element,
    isSupport,
    baseDmg: wikiSkill.base_dmg,
    scaling: wikiSkill.scaling,
    damageAtLevel,
    skillLevel: level,
    cooldownSec: wikiSkill.cooldown_sec,
    castTimeSec: wikiSkill.cast_time_sec,
    dsCost: wikiSkill.ds_cost,
    radius: typeof wikiSkill.radius === 'number' && wikiSkill.radius > 0 ? wikiSkill.radius : undefined,
    buffDuration:
      typeof wikiSkill.buff?.duration === 'number' && wikiSkill.buff.duration > 0
        ? wikiSkill.buff.duration
        : undefined,
  }
}

function estimateCasts(
  meterSkill: MeterSkillRow,
  wikiSkill: WikiSkill | null,
  optimalCasts: number,
  optimalAvgHits: number,
): number {
  if (isMeterAutoAttackSkill(meterSkill)) {
    return Math.max(0, meterSkill.hits)
  }
  if (meterSkill.hits > 0 && optimalAvgHits > 0) {
    return Math.max(1, Math.round(meterSkill.hits / optimalAvgHits))
  }
  if (wikiSkill && meterSkill.damage > 0 && !skillIsSupportOnly(wikiSkill.base_dmg, wikiSkill.scaling)) {
    const perCast = skillDamageAtLevel(
      wikiSkill.base_dmg,
      wikiSkill.scaling,
      SKILL_LEVEL_CAP,
      wikiSkill.max_level,
    )
    if (perCast > 0) return Math.max(1, Math.round(meterSkill.damage / perCast))
  }
  if (optimalCasts > 0) return Math.max(1, Math.round(optimalCasts * 0.5))
  return meterSkill.damage > 0 ? 1 : 0
}

function eventEndSec(ev: RotationEvent): number {
  return ev.atSec + Math.max(0, ev.castTimeSec)
}

export function computeOptimalGaps(events: RotationEvent[], durationSec: number): RotationGapWindow[] {
  const damageEvents = events
    .filter((e) => e.eventType === 'damage' || e.eventType === 'auto' || e.eventType === 'support')
    .sort((a, b) => a.atSec - b.atSec)
  const gaps: RotationGapWindow[] = []
  let cursor = 0
  for (const ev of damageEvents) {
    const start = ev.atSec
    if (start - cursor >= 0.35) {
      gaps.push({
        startSec: cursor,
        endSec: start,
        durationSec: start - cursor,
      })
    }
    cursor = Math.max(cursor, eventEndSec(ev))
  }
  if (durationSec - cursor >= 0.35) {
    gaps.push({ startSec: cursor, endSec: durationSec, durationSec: durationSec - cursor })
  }
  return gaps
}

function computeBusySec(events: RotationEvent[]): number {
  let busy = 0
  for (const ev of events) {
    if (ev.eventType === 'damage' || ev.eventType === 'auto' || ev.eventType === 'support') {
      busy += Math.max(0, ev.castTimeSec)
    }
  }
  return busy
}

function buildSuggestions(
  comparisons: SkillRotationComparison[],
  dpsGapPct: number,
  downtimePct: number,
  optimalDowntimePct: number,
  optimalGaps: RotationGapWindow[],
): RotationSuggestion[] {
  const out: RotationSuggestion[] = []

  if (dpsGapPct >= 8) {
    out.push({
      severity: dpsGapPct >= 15 ? 'high' : 'medium',
      title: 'Room to improve vs optimal auto rotation',
      detail: `Your run was about ${dpsGapPct.toFixed(0)}% below the Lab auto sim on the same Digimon and fight length. Tighter skill priority and fewer idle gaps usually close most of this.`,
      skillIconId: null,
      skillTooltip: null,
    })
  }

  const idleDelta = downtimePct - optimalDowntimePct
  if (idleDelta >= 8) {
    out.push({
      severity: idleDelta >= 15 ? 'high' : 'medium',
      title: 'High idle time between actions',
      detail: `Estimated ${downtimePct.toFixed(0)}% downtime vs ${optimalDowntimePct.toFixed(0)}% in the optimal sim. Watch for long gaps where a cooldown skill or auto filler could have fired.`,
      skillIconId: null,
      skillTooltip: null,
    })
  }

  for (const row of comparisons) {
    if (row.isSupport) continue
    const castDelta = row.optimalCasts - row.estimatedCasts
    if (castDelta >= 2 && row.optimalCasts >= 2) {
      out.push({
        severity: castDelta >= 4 ? 'high' : 'medium',
        title: `${row.skillName} used less than optimal`,
        detail: `About ${row.estimatedCasts} uses recorded vs ~${row.optimalCasts} in the auto sim. This skill accounts for ${row.optimalDamageSharePct.toFixed(0)}% of optimal damage. Prioritize it when off cooldown.`,
        skillIconId: row.skillIconId,
        skillTooltip: row.skillTooltip,
      })
    }
    const shareDelta = row.optimalDamageSharePct - row.actualDamageSharePct
    if (shareDelta >= 12 && row.optimalDamageSharePct >= 15) {
      out.push({
        severity: shareDelta >= 20 ? 'high' : 'medium',
        title: `${row.skillName} under-contributed`,
        detail: `${row.actualDamageSharePct.toFixed(0)}% of your damage vs ${row.optimalDamageSharePct.toFixed(0)}% in the optimal rotation.`,
        skillIconId: row.skillIconId,
        skillTooltip: row.skillTooltip,
      })
    }
  }

  const longest = [...optimalGaps].sort((a, b) => b.durationSec - a.durationSec)[0]
  if (longest && longest.durationSec >= 2.5) {
    out.push({
      severity: 'low',
      title: 'Example idle window in optimal sim',
      detail: `Around T+${longest.startSec.toFixed(1)}s-${longest.endSec.toFixed(1)}s the auto sim still had a ${longest.durationSec.toFixed(1)}s gap. Compare your replay mentally to whether you held a skill too long there.`,
      skillIconId: null,
      skillTooltip: null,
    })
  }

  if (!out.length) {
    out.push({
      severity: 'low',
      title: 'Solid rotation shape',
      detail: 'Skill usage is close to the auto sim on this fight length. Fine-tune buff uptime or animation cancels for smaller gains.',
      skillIconId: null,
      skillTooltip: null,
    })
  }

  return out.slice(0, 8)
}

export function analyzeMeterRotation(params: {
  digimon: WikiDigimonDetail
  meterSkills: MeterSkillRow[]
  durationSec: number
  totalDamage: number
  skillLevel?: number
}): RotationAnalysisResult {
  const durationSec = Math.max(1, params.durationSec)
  const skillLevel = params.skillLevel ?? SKILL_LEVEL_CAP
  const wikiSkills = params.digimon.skills ?? []
  const levelMap = Object.fromEntries(wikiSkills.map((s) => [s.id, skillLevel]))

  const sim: RotationResult = simulateRotation(
    wikiSkills,
    levelMap,
    durationSec,
    1,
    params.digimon.stats?.attack ?? 0,
    params.digimon.stats?.atk_speed ?? 0,
    params.digimon.stats?.crit_rate ?? 0,
    {
      role: params.digimon.role,
      wikiInt: Math.max(0, Math.floor(params.digimon.stats?.int ?? 0)),
      applySavedGearTrueVice: true,
      applySavedGearAccessories: true,
    },
  )

  const optimalStats = optimalCastStats(sim.events)
  const actualTotal = Math.max(0, params.totalDamage)
  const actualDps = actualTotal / durationSec
  const optimalDps = sim.dps
  const dpsGapPct =
    optimalDps > 0 ? Math.max(0, ((optimalDps - actualDps) / optimalDps) * 100) : 0

  const comparisons: SkillRotationComparison[] = []
  let estimatedBusySec = 0

  for (const meterSkill of params.meterSkills) {
    const wikiSkill = matchWikiSkill(meterSkill, wikiSkills)
    const isSupport = wikiSkill
      ? skillIsSupportOnly(wikiSkill.base_dmg, wikiSkill.scaling)
      : false
    const optKey = wikiSkill?.id ?? meterSkill.skill
    const opt = optimalStats.get(optKey) ?? optimalStats.get(meterSkill.skill) ?? {
      casts: 0,
      damage: 0,
      avgHits: 1,
    }
    const estimatedCasts = estimateCasts(meterSkill, wikiSkill, opt.casts, opt.avgHits)
    const castTimeSec = wikiSkill?.cast_time_sec ?? (isMeterAutoAttackSkill(meterSkill) ? 0.4 : 0.8)
    const busy = estimatedCasts * castTimeSec
    estimatedBusySec += busy

    comparisons.push({
      skillId: wikiSkill?.id ?? meterSkill.skillKey ?? null,
      skillName: meterSkill.skill,
      skillIconId: wikiSkill?.icon_id ?? null,
      skillTooltip: skillTooltipFromWiki(wikiSkill, skillLevel, isSupport),
      isSupport,
      actualDamage: meterSkill.damage,
      actualHits: meterSkill.hits,
      estimatedCasts,
      optimalCasts: opt.casts,
      actualDamageSharePct: actualTotal > 0 ? (meterSkill.damage / actualTotal) * 100 : 0,
      optimalDamageSharePct: sim.totalDamage > 0 ? (opt.damage / sim.totalDamage) * 100 : 0,
      castTimeSec,
      estimatedBusySec: busy,
    })
  }

  comparisons.sort((a, b) => b.actualDamage - a.actualDamage)

  const optimalBusySec = computeBusySec(sim.events)
  const optimalUptimePct = Math.min(100, (optimalBusySec / durationSec) * 100)
  const optimalDowntimePct = Math.max(0, 100 - optimalUptimePct)
  const uptimeSec = Math.min(durationSec, estimatedBusySec)
  const downtimeSec = Math.max(0, durationSec - uptimeSec)
  const uptimePct = Math.min(100, (uptimeSec / durationSec) * 100)
  const downtimePct = Math.max(0, 100 - uptimePct)

  const optimalGaps = computeOptimalGaps(sim.events, durationSec)
  const suggestions = buildSuggestions(
    comparisons,
    dpsGapPct,
    downtimePct,
    optimalDowntimePct,
    optimalGaps,
  )

  return {
    digimonId: params.digimon.id,
    digimonName: params.digimon.name,
    digimonModelId: params.digimon.model_id ?? params.digimon.id,
    durationSec,
    skillLevel,
    actualDps,
    optimalDps,
    dpsGapPct,
    uptimeSec,
    downtimeSec,
    uptimePct,
    downtimePct,
    optimalUptimePct,
    optimalDowntimePct,
    skillComparisons: comparisons,
    suggestions,
    optimalGaps,
  }
}
