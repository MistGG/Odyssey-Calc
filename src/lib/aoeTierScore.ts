import type { WikiDigimonDetail, WikiSkill } from '../types/wikiApi'
import { skillDamageAtLevel, skillIsSupportOnly } from './skillDamage'
import { tierListSkillLevel } from './tierScoreParsing'

/** Wiki marks area skills with a positive `radius` (same rule as the AOE tag in the UI). */
export function skillIsWikiAoe(s: WikiSkill): boolean {
  return typeof s.radius === 'number' && s.radius > 0
}

/**
 * Open-world style pack respawn cadence (seconds), used only for the support-only / legacy
 * farming fallback when there is no damaging AoE skill to bucket.
 */
export const FARM_MONSTER_RESPAWN_SEC = 8

/** Within each period bucket, farming rank blends per-skill damage and radius only (no CD term). */
const FARM_BUCKET_WEIGHT_DAMAGE = 0.9
const FARM_BUCKET_WEIGHT_RADIUS = 0.1

/** Separators so a better period bucket always outranks a slower bucket before comparing in-bucket scores. */
const FARM_BUCKET_BASE_LE_8 = 3000
const FARM_BUCKET_BASE_8_10 = 2000
const FARM_BUCKET_BASE_10_12 = 1000
const FARM_BUCKET_BASE_GT_12 = 0

/**
 * Cooldown buckets use `period = cast_time_sec + cooldown_sec` on each damaging AoE skill.
 * - <=8s: fastest pool (always fast enough vs ~8s respawn); score = 90% damage + 10% radius (best skill in pool).
 * - (8, 10] and (10, 12]: same blend, separate pools for ordering.
 * - >12s: same blend; slowest pool.
 * If there is no damaging AoE, fall back to a small legacy respawn/cadence heuristic for support-only AoE.
 */
function farmBucketByPeriod(periodSec: number): 0 | 1 | 2 | 3 {
  if (periodSec <= 8) return 0
  if (periodSec <= 10) return 1
  if (periodSec <= 12) return 2
  return 3
}

function farmBucketSkillScore(dmg: number, radius: number): number {
  return (
    FARM_BUCKET_WEIGHT_DAMAGE * Math.log1p(Math.max(0, dmg)) +
    FARM_BUCKET_WEIGHT_RADIUS * Math.log1p(Math.max(0, radius))
  )
}

/**
 * Respawn-fit for legacy fallback (support-only AoE or no damage lines to bucket).
 */
function farmRespawnPriority(periodSec: number): number {
  if (periodSec <= FARM_MONSTER_RESPAWN_SEC) {
    const headroom = (FARM_MONSTER_RESPAWN_SEC - periodSec) / FARM_MONSTER_RESPAWN_SEC
    return 1 + 0.22 * Math.max(0, headroom)
  }
  if (periodSec <= 10) {
    const over = (periodSec - FARM_MONSTER_RESPAWN_SEC) / 2
    return 1 - 0.2 * Math.max(0, Math.min(1, over))
  }
  return 0.8 * Math.exp(-(periodSec - 10) / 4)
}

/**
 * Heuristic AoE kit scores from AoE-tagged skills only (`radius` present).
 *
 * - **Damage**: `log1p` of summed per-cast damage at tier-list skill level (support-only AoE = 0 damage).
 * - **Cooldown**: `log1p` of summed `1 / (cast + cooldown)` — faster skills contribute more.
 * - **Farming**: period buckets on damaging AoE only; inside each bucket `0.9·log1p(dmg) + 0.1·log1p(radius)`
 *   for the best skill in that bucket; bucket order <=8s > (8,10] > (10,12] > >12s. Legacy blend if no damage AoE.
 * - **General**: arithmetic mean of damage, cooldown, and farming (equal weight).
 */
export function computeDpsAoeCategoryScores(detail: WikiDigimonDetail): {
  general: number
  damage: number
  cooldown: number
  farming: number
} {
  let dmgSum = 0
  let invCdSum = 0
  let farmCooldownRaw = 0
  let farmDamageRaw = 0
  let farmRadiusRaw = 0
  let farmLe8Best = -Infinity
  let farm8To10Best = -Infinity
  let farm10To12Best = -Infinity
  let farmGt12Best = -Infinity

  for (const s of detail.skills ?? []) {
    if (!skillIsWikiAoe(s)) continue
    const radius = s.radius as number
    const lv = tierListSkillLevel(s)
    const period = Math.max(0.5, s.cooldown_sec + s.cast_time_sec)
    const invCd = 1 / period
    invCdSum += invCd

    const fit = farmRespawnPriority(period)
    farmCooldownRaw += invCd * fit
    farmRadiusRaw += Math.log1p(Math.max(0, radius)) * fit

    if (!skillIsSupportOnly(s.base_dmg, s.scaling)) {
      const dmg = skillDamageAtLevel(s.base_dmg, s.scaling, lv, s.max_level)
      dmgSum += dmg
      farmDamageRaw += dmg * fit

      const bucket = farmBucketByPeriod(period)
      const bucketScore = farmBucketSkillScore(dmg, radius)
      if (bucket === 0) farmLe8Best = Math.max(farmLe8Best, bucketScore)
      else if (bucket === 1) farm8To10Best = Math.max(farm8To10Best, bucketScore)
      else if (bucket === 2) farm10To12Best = Math.max(farm10To12Best, bucketScore)
      else farmGt12Best = Math.max(farmGt12Best, bucketScore)
    }
  }

  const damage = Math.log1p(Math.max(0, dmgSum))
  const cooldown = Math.log1p(Math.max(0, invCdSum))
  const farmCooldown = Math.log1p(Math.max(0, farmCooldownRaw * 100))
  const farmDamage = Math.log1p(Math.max(0, farmDamageRaw))
  const farmRadius = Math.log1p(Math.max(0, farmRadiusRaw))
  const farmingLegacy = 0.75 * farmCooldown + 0.2 * farmDamage + 0.05 * farmRadius
  const farming = Number.isFinite(farmLe8Best)
    ? FARM_BUCKET_BASE_LE_8 + farmLe8Best
    : Number.isFinite(farm8To10Best)
      ? FARM_BUCKET_BASE_8_10 + farm8To10Best
      : Number.isFinite(farm10To12Best)
        ? FARM_BUCKET_BASE_10_12 + farm10To12Best
        : Number.isFinite(farmGt12Best)
          ? FARM_BUCKET_BASE_GT_12 + farmGt12Best
          : farmingLegacy
  const general = (damage + cooldown + farming) / 3

  return { general, damage, cooldown, farming }
}
