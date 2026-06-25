import { fetchDigimonDetail } from '../api/digimonService'
import type { CommunityRotation } from './communityRotations'
import { computeDpsAoeCategoryScores } from './aoeTierScore'
import { BURST_DPS_WINDOW_SEC } from './dpsTierScore'
import {
  DEFAULT_ROTATION_SIM_DURATION_SEC,
  simulateRotation,
  TIER_DPS_SIM_REVISION,
} from './dpsSim'
import { getDigimonContentStatus } from './contentStatus'
import { computeHealerTierScore } from './healerTierScore'
import { buildComparableRotationConfig } from './rotationComparable'
import { computeTankTierScore } from './tankTierScore'
import {
  loadTierListCache,
  saveTierListCache,
  TIER_SUPPORT_SCORE_REVISION,
  type SustainedDpsEntry,
  type TierApiSnapshot,
} from './tierList'
import { tierSkillsSignature } from './tierSkillsSignature'
import { levelMapForSkills } from '../pages/tierList/tierListModel'
import type { WikiDigimonDetail } from '../types/wikiApi'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchApprovedRotations } from './communityRotations'

function buildTierApiSnapshot(detail: WikiDigimonDetail): TierApiSnapshot {
  return {
    id: detail.id,
    name: detail.name,
    role: detail.role,
    attribute: detail.attribute,
    element: detail.element,
    rank: detail.rank,
    hp: detail.hp,
    attack: detail.attack,
    stats: {
      hp: detail.stats?.hp ?? 0,
      ds: detail.stats?.ds ?? 0,
      attack: detail.stats?.attack ?? 0,
      defense: detail.stats?.defense ?? 0,
      crit_rate: detail.stats?.crit_rate ?? 0,
      atk_speed: detail.stats?.atk_speed ?? 0,
      evasion: detail.stats?.evasion ?? 0,
      hit_rate: detail.stats?.hit_rate ?? 0,
      block_rate: detail.stats?.block_rate ?? 0,
      dex: detail.stats?.dex ?? 0,
      int: detail.stats?.int ?? 0,
    },
    skills: (detail.skills ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      base_dmg: s.base_dmg,
      scaling: s.scaling,
      cast_time_sec: s.cast_time_sec,
      cooldown_sec: s.cooldown_sec,
      ds_cost: s.ds_cost,
      radius: s.radius,
      description: s.description,
      buff_name: s.buff?.name,
      buff_description: s.buff?.description,
      buff_duration: s.buff?.duration,
    })),
  }
}

/** Rebuild one tier-list cache row (same rules as Update tier list for a single Digimon). */
export function buildSustainedDpsEntryForDigimon(
  detail: WikiDigimonDetail,
  communityRotation: CommunityRotation | null,
): SustainedDpsEntry {
  const levels = levelMapForSkills(detail.skills)
  const runComparableSim = (
    durationSec: number,
    options?: {
      forceAutoCrit?: boolean
      perfectAtClone?: boolean
      autoAttackAnimationCancel?: boolean
    },
  ) => {
    const cfg = buildComparableRotationConfig(detail, durationSec, 1, {
      ...options,
      targetEnemyAttribute: '',
    })
    return simulateRotation(
      detail.skills,
      levels,
      cfg.durationSec,
      cfg.targets,
      cfg.baseAttack,
      cfg.attackSpeed,
      cfg.baseCritRateStat,
      {
        ...cfg.options,
        ...(communityRotation && communityRotation.sim_revision === TIER_DPS_SIM_REVISION
          ? {
              customRotation: communityRotation.skill_ids.map((sid) => ({ skillId: sid })),
              customRotationFiller:
                communityRotation.filler_ids.length > 0
                  ? communityRotation.filler_ids.map((sid) => ({ skillId: sid }))
                  : undefined,
              customRotationFullCycles: 0,
              manualSupportOnly: true,
            }
          : {}),
      },
    )
  }

  const sim = runComparableSim(DEFAULT_ROTATION_SIM_DURATION_SEC)
  const simBurst = runComparableSim(BURST_DPS_WINDOW_SEC)
  const simAutoCrit = runComparableSim(DEFAULT_ROTATION_SIM_DURATION_SEC, { forceAutoCrit: true })
  const simPerfectAtClone = runComparableSim(DEFAULT_ROTATION_SIM_DURATION_SEC, {
    perfectAtClone: true,
  })
  const simBurstAutoCrit = runComparableSim(BURST_DPS_WINDOW_SEC, { forceAutoCrit: true })
  const simBurstPerfectAtClone = runComparableSim(BURST_DPS_WINDOW_SEC, { perfectAtClone: true })
  const simPerfectAtCloneAutoCrit = runComparableSim(DEFAULT_ROTATION_SIM_DURATION_SEC, {
    perfectAtClone: true,
    forceAutoCrit: true,
  })
  const simBurstPerfectAtCloneAutoCrit = runComparableSim(BURST_DPS_WINDOW_SEC, {
    perfectAtClone: true,
    forceAutoCrit: true,
  })
  const simAnimationCancel = runComparableSim(DEFAULT_ROTATION_SIM_DURATION_SEC, {
    autoAttackAnimationCancel: true,
  })
  const simBurstAnimationCancel = runComparableSim(BURST_DPS_WINDOW_SEC, {
    autoAttackAnimationCancel: true,
  })
  const simAnimationCancelAutoCrit = runComparableSim(DEFAULT_ROTATION_SIM_DURATION_SEC, {
    autoAttackAnimationCancel: true,
    forceAutoCrit: true,
  })
  const simBurstAnimationCancelAutoCrit = runComparableSim(BURST_DPS_WINDOW_SEC, {
    autoAttackAnimationCancel: true,
    forceAutoCrit: true,
  })
  const simPerfectAtCloneAnimationCancel = runComparableSim(DEFAULT_ROTATION_SIM_DURATION_SEC, {
    perfectAtClone: true,
    autoAttackAnimationCancel: true,
  })
  const simBurstPerfectAtCloneAnimationCancel = runComparableSim(BURST_DPS_WINDOW_SEC, {
    perfectAtClone: true,
    autoAttackAnimationCancel: true,
  })
  const simPerfectAtCloneAnimationCancelAutoCrit = runComparableSim(
    DEFAULT_ROTATION_SIM_DURATION_SEC,
    {
      perfectAtClone: true,
      autoAttackAnimationCancel: true,
      forceAutoCrit: true,
    },
  )
  const simBurstPerfectAtCloneAnimationCancelAutoCrit = runComparableSim(BURST_DPS_WINDOW_SEC, {
    perfectAtClone: true,
    autoAttackAnimationCancel: true,
    forceAutoCrit: true,
  })
  const aoeScores = computeDpsAoeCategoryScores(detail)
  const tank = computeTankTierScore(detail)
  const healer = computeHealerTierScore(detail)

  return {
    id: detail.id,
    name: detail.name,
    role: detail.role,
    stage: detail.stage,
    dps: sim.dps,
    dpsCategoryScores: {
      sustained: sim.dps,
      burst: simBurst.dps,
      sustainedAutoDps: sim.autoDps,
      burstAutoDps: simBurst.autoDps,
    },
    dpsCategoryScoresAutoCrit: {
      sustained: simAutoCrit.dps,
      burst: simBurstAutoCrit.dps,
      sustainedAutoDps: simAutoCrit.autoDps,
      burstAutoDps: simBurstAutoCrit.autoDps,
    },
    dpsCategoryScoresPerfectAtClone: {
      sustained: simPerfectAtClone.dps,
      burst: simBurstPerfectAtClone.dps,
      sustainedAutoDps: simPerfectAtClone.autoDps,
      burstAutoDps: simBurstPerfectAtClone.autoDps,
    },
    dpsCategoryScoresPerfectAtCloneAutoCrit: {
      sustained: simPerfectAtCloneAutoCrit.dps,
      burst: simBurstPerfectAtCloneAutoCrit.dps,
      sustainedAutoDps: simPerfectAtCloneAutoCrit.autoDps,
      burstAutoDps: simBurstPerfectAtCloneAutoCrit.autoDps,
    },
    dpsCategoryScoresAnimationCancel: {
      sustained: simAnimationCancel.dps,
      burst: simBurstAnimationCancel.dps,
      sustainedAutoDps: simAnimationCancel.autoDps,
      burstAutoDps: simBurstAnimationCancel.autoDps,
    },
    dpsCategoryScoresAnimationCancelAutoCrit: {
      sustained: simAnimationCancelAutoCrit.dps,
      burst: simBurstAnimationCancelAutoCrit.dps,
      sustainedAutoDps: simAnimationCancelAutoCrit.autoDps,
      burstAutoDps: simBurstAnimationCancelAutoCrit.autoDps,
    },
    dpsCategoryScoresPerfectAtCloneAnimationCancel: {
      sustained: simPerfectAtCloneAnimationCancel.dps,
      burst: simBurstPerfectAtCloneAnimationCancel.dps,
      sustainedAutoDps: simPerfectAtCloneAnimationCancel.autoDps,
      burstAutoDps: simBurstPerfectAtCloneAnimationCancel.autoDps,
    },
    dpsCategoryScoresPerfectAtCloneAnimationCancelAutoCrit: {
      sustained: simPerfectAtCloneAnimationCancelAutoCrit.dps,
      burst: simBurstPerfectAtCloneAnimationCancelAutoCrit.dps,
      sustainedAutoDps: simPerfectAtCloneAnimationCancelAutoCrit.autoDps,
      burstAutoDps: simBurstPerfectAtCloneAnimationCancelAutoCrit.autoDps,
    },
    aoeCategoryScores: aoeScores,
    tankScore: tank.score,
    tankCategoryScores: tank.categoryScores,
    tankEffectiveDisplay: tank.effectiveDisplay,
    healerScore: healer.score,
    healerCategoryScores: healer.categoryScores,
    healerDisplayMetrics: {
      healHps: healer.healSustainHps,
      shieldHps: healer.shieldSustainHps,
      buffPctEquiv: healer.buffDmgGainDisplay,
      intTotal: healer.intStat,
    },
    status: getDigimonContentStatus(detail.skills),
    checkedAt: new Date().toISOString(),
    skillsSignature: tierSkillsSignature(detail.skills),
    supportScoreRevision: TIER_SUPPORT_SCORE_REVISION,
    dpsSimRevision: TIER_DPS_SIM_REVISION,
    communityRotationAuthor:
      communityRotation && communityRotation.sim_revision === TIER_DPS_SIM_REVISION
        ? communityRotation.author_name
        : undefined,
    communityRotationId:
      communityRotation && communityRotation.sim_revision === TIER_DPS_SIM_REVISION
        ? communityRotation.id
        : undefined,
    apiSnapshot: buildTierApiSnapshot(detail),
  }
}

export type RefreshTierCacheResult =
  | { status: 'updated' }
  | { status: 'no-cache' }
  | { status: 'no-supabase' }
  | { status: 'error'; message: string }

/** Update local tier-list cache for one Digimon after a community rotation submit. */
export async function refreshTierListDigimonInCache(
  supabase: SupabaseClient | null,
  digimonId: string,
): Promise<RefreshTierCacheResult> {
  if (!supabase) return { status: 'no-supabase' }
  const cache = loadTierListCache()
  if (!cache?.entries[digimonId]) return { status: 'no-cache' }
  try {
    const detail = await fetchDigimonDetail(digimonId, { wikiRefresh: true })
    const approved = await fetchApprovedRotations(supabase)
    const communityRotation = approved.get(digimonId) ?? null
    cache.entries[digimonId] = buildSustainedDpsEntryForDigimon(detail, communityRotation)
    saveTierListCache(cache)
    return { status: 'updated' }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to refresh tier cache'
    return { status: 'error', message }
  }
}
