import type { CommunityRotation } from './communityRotations'
import {
  clampRotationDurationSec,
  simulateRotation,
  TIER_DPS_SIM_REVISION,
} from './dpsSim'
import { buildComparableRotationConfig } from './rotationComparable'
import type { SustainedDpsEntry, TierApiSkillSnapshot } from './tierList'
import type { WikiCombatStats, WikiSkill } from '../types/wikiApi'
import { levelMapForSkills } from '../pages/tierList/tierListModel'

/** Mirrors tier list / Lab “comparable” special modifiers for {@link resimTierEntrySustainedAtFightDuration}. */
export type TierEntryFightResimModifiers = {
  forceAutoCrit: boolean
  perfectAtClone: boolean
  autoAttackAnimationCancel: boolean
}

function tierSnapshotSkillsToWikiSkills(skills: TierApiSkillSnapshot[]): WikiSkill[] {
  return skills.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description ?? '',
    element: '',
    icon_id: '',
    base_dmg: s.base_dmg,
    scaling: s.scaling,
    max_level: 25,
    cast_time_sec: s.cast_time_sec,
    cooldown_sec: s.cooldown_sec,
    ds_cost: s.ds_cost,
    radius: s.radius,
    buff:
      s.buff_name || s.buff_description || s.buff_duration != null
        ? {
            id: `${s.id}-buff`,
            name: s.buff_name ?? '',
            description: s.buff_description ?? '',
            duration: s.buff_duration,
          }
        : undefined,
  }))
}

/**
 * Re-run the wiki-comparable greedy rotation sim at `durationSec` (same rules as Lab duration slider:
 * {@link buildComparableRotationConfig} + {@link simulateRotation}), using the tier cache
 * {@link SustainedDpsEntry.apiSnapshot}. Returns null when the snapshot is missing (refresh tier list).
 */
export function resimTierEntrySustainedAtFightDuration(
  entry: SustainedDpsEntry,
  durationSec: number,
  args: {
    modifiers: TierEntryFightResimModifiers
    targetEnemyAttribute: string
    communityRotation: CommunityRotation | null | undefined
  },
): { sustained: number; sustainedAutoDps: number } | null {
  const snap = entry.apiSnapshot
  if (!snap?.skills?.length) return null

  const skills = tierSnapshotSkillsToWikiSkills(snap.skills)
  const levels = levelMapForSkills(skills)
  const dur = clampRotationDurationSec(durationSec)

  const detailPick = {
    role: snap.role,
    attack: snap.attack,
    stats: snap.stats as WikiCombatStats,
    attribute: snap.attribute,
    element: snap.element,
  }

  const target = args.targetEnemyAttribute.trim()
  const com = args.communityRotation

  const cfg = buildComparableRotationConfig(detailPick, dur, 1, {
    forceAutoCrit: args.modifiers.forceAutoCrit,
    perfectAtClone: args.modifiers.perfectAtClone,
    autoAttackAnimationCancel: args.modifiers.autoAttackAnimationCancel,
    targetEnemyAttribute: target || undefined,
  })

  const communityOpts =
    com && com.sim_revision === TIER_DPS_SIM_REVISION
      ? {
          customRotation: com.skill_ids.map((skillId) => ({ skillId })),
          customRotationFiller:
            com.filler_ids.length > 0 ? com.filler_ids.map((skillId) => ({ skillId })) : undefined,
          customRotationFullCycles: 0 as const,
          manualSupportOnly: true as const,
        }
      : {}

  const sim = simulateRotation(
    skills,
    levels,
    cfg.durationSec,
    cfg.targets,
    cfg.baseAttack,
    cfg.attackSpeed,
    cfg.baseCritRateStat,
    { ...cfg.options, ...communityOpts },
  )

  return { sustained: sim.dps, sustainedAutoDps: sim.autoDps }
}
