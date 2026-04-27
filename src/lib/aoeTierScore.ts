import type { WikiDigimonDetail, WikiSkill } from '../types/wikiApi'
import { skillDamageAtLevel, skillIsSupportOnly } from './skillDamage'
import { tierListSkillLevel } from './tierScoreParsing'

/** Wiki marks area skills with a positive `radius` (same rule as the AOE tag in the UI). */
export function skillIsWikiAoe(s: WikiSkill): boolean {
  return typeof s.radius === 'number' && s.radius > 0
}

/**
 * Open-world style pack respawn cadence (seconds).
 */
export const FARM_MONSTER_RESPAWN_SEC = 8

/** Farming intra-bucket blend (requested): damage first, then area. */
const FARM_BUCKET_WEIGHT_DAMAGE = 0.8
const FARM_BUCKET_WEIGHT_RADIUS = 0.2

/** Large separators so <=8s pool always outranks <=10s, then <=12s, then legacy fallback. */
const FARM_BUCKET_BASE_8 = 3000
const FARM_BUCKET_BASE_10 = 2000
const FARM_BUCKET_BASE_12 = 1000

/**
 * Respawn-fit for farming cooldown priority:
 * - <=8s: preferred (highest)
 * - 8–10s: still acceptable
 * - >10s: penalized quickly
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
 * Heuristic AoE kit scores from AoE-tagged skills only (`radius` present).
 *
 * - **Damage**: `log1p` of summed per-cast damage at tier-list skill level (support-only AoE = 0 damage).
 * - **Cooldown**: `log1p` of summed `1 / (cast + cooldown)` — faster skills contribute more.
 * - **Farming**:
 *   - Priority pools by `period = cast + cooldown`: `<=8s` first, then `<=10s`, then `<=12s`.
 *   - Inside each of those pools: 80% damage + 20% radius.
 *   - If no AoE damage skill is in `<=12s`, fallback to the legacy respawn-fit blend.
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
  let farm8Best = -Infinity
  let farm10Best = -Infinity
  let farm12Best = -Infinity

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

      const periodBucket = farmBucketByPeriod(period)
      const bucketScore = farmBucketSkillScore(dmg, radius)
      if (periodBucket === 0) farm8Best = Math.max(farm8Best, bucketScore)
      else if (periodBucket === 1) farm10Best = Math.max(farm10Best, bucketScore)
      else if (periodBucket === 2) farm12Best = Math.max(farm12Best, bucketScore)
    }
  }

  const damage = Math.log1p(Math.max(0, dmgSum))
  const cooldown = Math.log1p(Math.max(0, invCdSum))
  const farmCooldown = Math.log1p(Math.max(0, farmCooldownRaw * 100))
  const farmDamage = Math.log1p(Math.max(0, farmDamageRaw))
  const farmRadius = Math.log1p(Math.max(0, farmRadiusRaw))
  const farmingLegacy = 0.75 * farmCooldown + 0.2 * farmDamage + 0.05 * farmRadius
  const farming = Number.isFinite(farm8Best)
    ? FARM_BUCKET_BASE_8 + farm8Best
    : Number.isFinite(farm10Best)
      ? FARM_BUCKET_BASE_10 + farm10Best
      : Number.isFinite(farm12Best)
        ? FARM_BUCKET_BASE_12 + farm12Best
        : farmingLegacy
  const general = (damage + cooldown + farming) / 3

  return { general, damage, cooldown, farming }
}
