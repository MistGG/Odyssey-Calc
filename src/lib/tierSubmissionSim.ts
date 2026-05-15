import {
  DEFAULT_ROTATION_SIM_DURATION_SEC,
  simulateRotation,
  type RotationResult,
  type RotationSimOptions,
} from './dpsSim'
import { buildComparableRotationConfig } from './rotationComparable'
import type { WikiDigimonDetail } from '../types/wikiApi'

/** Skill levels for tier list / community submit (max wiki level per skill, not Lab sliders). */
export function tierSubmissionLevelMap(skills: { id: string; max_level: number }[]) {
  const map: Record<string, number> = {}
  for (const s of skills) map[s.id] = Math.max(1, Math.min(25, s.max_level || 25))
  return map
}

/**
 * Optional Lab toggles that map to tier special columns.
 * Never includes gear, seals, or hand-edited combat stats — those are ignored for submit compare.
 */
export type TierSubmissionModifiers = {
  forceAutoCrit?: boolean
  perfectAtClone?: boolean
  autoAttackAnimationCancel?: boolean
}

/** Lab special toggles mapped to tier comparable sim options (both custom and auto use the same set). */
export function tierSubmissionModifiersFromLab(
  forceAutoCrit: boolean,
  perfectAtClone: boolean,
  useAutoAnimCancel: boolean,
): TierSubmissionModifiers {
  return {
    forceAutoCrit,
    perfectAtClone,
    autoAttackAnimationCancel: useAutoAnimCancel,
  }
}

const TIER_SUBMISSION_TARGETS = 1

function buildTierSubmissionConfig(
  detail: Pick<WikiDigimonDetail, 'role' | 'attack' | 'stats' | 'attribute' | 'element'>,
  modifiers: TierSubmissionModifiers = {},
) {
  return buildComparableRotationConfig(
    detail,
    DEFAULT_ROTATION_SIM_DURATION_SEC,
    TIER_SUBMISSION_TARGETS,
    {
      targetEnemyAttribute: '',
      forceAutoCrit: modifiers.forceAutoCrit === true,
      perfectAtClone: modifiers.perfectAtClone === true,
      autoAttackAnimationCancel: modifiers.autoAttackAnimationCancel === true,
      applySavedGearTrueVice: false,
    },
  )
}

function runTierSubmissionSim(
  detail: Pick<WikiDigimonDetail, 'role' | 'attack' | 'stats' | 'attribute' | 'element' | 'skills'>,
  modifiers: TierSubmissionModifiers,
  rotationExtra?: Pick<
    RotationSimOptions,
    | 'customRotation'
    | 'customRotationFiller'
    | 'customRotationFullCycles'
    | 'manualSupportOnly'
  >,
): RotationResult {
  const cfg = buildTierSubmissionConfig(detail, modifiers)
  const levels = tierSubmissionLevelMap(detail.skills ?? [])
  return simulateRotation(
    detail.skills ?? [],
    levels,
    cfg.durationSec,
    cfg.targets,
    cfg.baseAttack,
    cfg.attackSpeed,
    cfg.baseCritRateStat,
    { ...cfg.options, ...rotationExtra },
  )
}

const DPS_EPSILON = 0.1

export type TierSubmissionRotationCompare = {
  autoDps: number
  customDps: number
  /** Custom sim used the full 180s tier window without stopping early. */
  hitDurationCap: boolean
  isBetter: boolean
}

/**
 * Compare custom vs auto for tier list submission.
 * Always uses wiki base stats and max skill levels — ignores Lab gear, seals, and combat stat edits.
 * Pass Lab special toggles so custom and auto are compared under the same rules (wiki stats only).
 * Defaults to none when omitted.
 */
export function compareTierSubmissionRotations(
  detail: Pick<WikiDigimonDetail, 'role' | 'attack' | 'stats' | 'attribute' | 'element' | 'skills'>,
  skillIds: string[],
  fillerIds: string[],
  modifiers: TierSubmissionModifiers = {},
): TierSubmissionRotationCompare {
  const durationSec = DEFAULT_ROTATION_SIM_DURATION_SEC
  const autoSim = runTierSubmissionSim(detail, modifiers)
  // Tier sustained DPS is always a full 180s window — ignore Lab "full passes" (rotCycles).
  const customSim = runTierSubmissionSim(detail, modifiers, {
    customRotation: skillIds.map((id) => ({ skillId: id })),
    customRotationFiller:
      fillerIds.length > 0 ? fillerIds.map((id) => ({ skillId: id })) : undefined,
    customRotationFullCycles: 0,
    manualSupportOnly: true,
  })

  const hitDurationCap =
    customSim.simCapSec != null &&
    customSim.durationSec + 0.015 >= customSim.simCapSec &&
    Math.abs(customSim.simCapSec - durationSec) < 0.05

  const isBetter = hitDurationCap && customSim.dps > autoSim.dps + DPS_EPSILON

  return {
    autoDps: autoSim.dps,
    customDps: customSim.dps,
    hitDurationCap,
    isBetter,
  }
}

/** @deprecated Use compareTierSubmissionRotations */
export type ComparableRotationCompare = TierSubmissionRotationCompare

/** @deprecated Use compareTierSubmissionRotations */
export const compareComparableRotations = compareTierSubmissionRotations
