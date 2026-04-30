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

function comparableBaseAttack(
  detail: Pick<WikiDigimonDetail, 'attack' | 'stats'>,
  perfectAtClone: boolean,
): number {
  const inputAttack = floorStat(detail.attack ?? detail.stats?.attack ?? 0)
  if (!perfectAtClone) return inputAttack
  // Match Lab's effective AT behavior exactly for Perfect AT clone:
  // clone bonus = round(inputAttack * 1.44), then add to base attack.
  const cloneAttackBonus = Math.round(inputAttack * 1.44)
  return inputAttack + cloneAttackBonus
}

/**
 * Canonical baseline config for Tier/Lab comparable DPS:
 * - wiki/base combat stats only (no gear/seals)
 * - role-enabled rotation with Hybrid fixed to melee
 * - optional special modifiers mapped 1:1 into sim options
 */
export function buildComparableRotationConfig(
  detail: Pick<WikiDigimonDetail, 'role' | 'attack' | 'stats' | 'attribute'>,
  durationSec: number,
  targets: number,
  options?: Pick<
    RotationSimOptions,
    'forceAutoCrit' | 'perfectAtClone' | 'autoAttackAnimationCancel'
  > & {
    /** Wiki attribute of the enemy (Vaccine/Data/Virus/…). Empty = no attribute advantage. */
    targetEnemyAttribute?: string
  },
): ComparableRotationConfig {
  const perfectAtClone = options?.perfectAtClone === true
  const targetAttr = (options?.targetEnemyAttribute ?? '').trim()
  return {
    durationSec,
    targets: Math.max(1, Math.floor(targets)),
    baseAttack: comparableBaseAttack(detail, perfectAtClone),
    attackSpeed: floorStat(detail.stats?.atk_speed ?? 0),
    baseCritRateStat: floorStat(detail.stats?.crit_rate ?? 0),
    options: {
      role: detail.role,
      hybridStance: 'melee',
      forceAutoCrit: options?.forceAutoCrit === true,
      perfectAtClone,
      autoAttackAnimationCancel: options?.autoAttackAnimationCancel === true,
      attackerAttribute: detail.attribute ?? '',
      targetEnemyAttribute: targetAttr || undefined,
    },
  }
}
