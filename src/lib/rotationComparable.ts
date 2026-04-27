import type { RotationSimOptions } from './dpsSim'
import type { WikiDigimonDetail } from '../types/wikiApi'

export type ComparableRotationConfig = {
  durationSec: number
  targets: number
  baseAttack: number
  attackSpeed: number
  baseCritRateStat: number
  options: RotationSimOptions
}

function floorStat(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.floor(n))
}

/**
 * Canonical baseline config for Tier/Lab comparable DPS:
 * - wiki/base combat stats only (no gear/seals)
 * - role-enabled rotation with Hybrid fixed to melee
 * - optional special modifiers mapped 1:1 into sim options
 */
export function buildComparableRotationConfig(
  detail: Pick<WikiDigimonDetail, 'role' | 'attack' | 'stats'>,
  durationSec: number,
  targets: number,
  options?: Pick<
    RotationSimOptions,
    'forceAutoCrit' | 'perfectAtClone' | 'autoAttackAnimationCancel'
  >,
): ComparableRotationConfig {
  return {
    durationSec,
    targets: Math.max(1, Math.floor(targets)),
    baseAttack: floorStat(detail.attack ?? detail.stats?.attack ?? 0),
    attackSpeed: floorStat(detail.stats?.atk_speed ?? 0),
    baseCritRateStat: floorStat(detail.stats?.crit_rate ?? 0),
    options: {
      role: detail.role,
      hybridStance: 'melee',
      forceAutoCrit: options?.forceAutoCrit === true,
      perfectAtClone: options?.perfectAtClone === true,
      autoAttackAnimationCancel: options?.autoAttackAnimationCancel === true,
    },
  }
}
