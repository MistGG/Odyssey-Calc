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

/**
 * Within each period bucket, farming rank blends per-cast damage, sustained DPS (dmg/period), and radius.
 * DPS matters so a hard-hitting ~10s rotation isn’t ranked like a weak 7s tap.
 */
const FARM_BUCKET_WEIGHT_DAMAGE = 0.55
const FARM_BUCKET_WEIGHT_DPS = 0.35
const FARM_BUCKET_WEIGHT_RADIUS = 0.1

/** Separators so a better period bucket outranks a slower one before comparing in-bucket scores. */
const FARM_BUCKET_BASE_FAST = 3000
const FARM_BUCKET_BASE_MED = 2000
const FARM_BUCKET_BASE_SLOW = 1000
const FARM_BUCKET_BASE_SLOWEST = 0

/**
 * Farming **bucket** thresholds use **wiki cooldown only** (cast time ignored), clamped to ≥0.5s.
 * - **Fast** ≤8s, then **(8, 10]s**, **(10, 12]s**, **>12s**.
 * Within-bucket score still uses full `cast + cooldown` for the DPS term in {@link farmBucketSkillScore}.
 */
function farmBucketByCooldownSec(cooldownSec: number): 0 | 1 | 2 | 3 {
  const cd = Math.max(0.5, cooldownSec)
  if (cd <= 8) return 0
  if (cd <= 10) return 1
  if (cd <= 12) return 2
  return 3
}

function farmBucketSkillScore(dmg: number, radius: number, periodSec: number): number {
  const dps = dmg / Math.max(0.5, periodSec)
  return (
    FARM_BUCKET_WEIGHT_DAMAGE * Math.log1p(Math.max(0, dmg)) +
    FARM_BUCKET_WEIGHT_DPS * Math.log1p(Math.max(0, dps)) +
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

type MainAoePick = {
  dmgPerCast: number
  periodSec: number
  castTimeSec: number
  radius: number
}

function pickMainDamagingAoe(detail: WikiDigimonDetail): MainAoePick | null {
  let best: MainAoePick | null = null
  let bestDps = -Infinity
  for (const s of detail.skills ?? []) {
    if (!skillIsWikiAoe(s)) continue
    if (skillIsSupportOnly(s.base_dmg, s.scaling)) continue
    const radius = s.radius as number
    const lv = tierListSkillLevel(s)
    const period = Math.max(0.5, s.cooldown_sec + s.cast_time_sec)
    const dmg = skillDamageAtLevel(s.base_dmg, s.scaling, lv, s.max_level)
    const dps = dmg / period
    if (dps > bestDps + 1e-9 || (Math.abs(dps - bestDps) <= 1e-9 && dmg > (best?.dmgPerCast ?? -1))) {
      bestDps = dps
      best = {
        dmgPerCast: dmg,
        periodSec: period,
        castTimeSec: Math.max(0, s.cast_time_sec),
        radius,
      }
    }
  }
  return best
}

function firstWikiAoeSkill(detail: WikiDigimonDetail): WikiSkill | undefined {
  return detail.skills?.find(skillIsWikiAoe)
}

/**
 * Heuristic AoE kit scores from AoE-tagged skills only (`radius` present).
 *
 * - **Damage**: sustained DPS of the **main** damaging AoE skill (highest `damage ÷ (cast + cooldown)`; tie-break higher per-cast damage).
 * - **Cooldown** (display): **cast-time uptime** for that main skill — `cast_time ÷ (cast + cooldown)` in `[0, 1]` (sort/display as % of cycle in cast).
 * - **Farming**: arbitrary composite rank (cooldown-only buckets + damage/DPS/radius blend; legacy if no damage AoE).
 * - **Radius**: wiki `radius` of that same main skill (support-only kit: first AoE skill’s radius if any).
 */
export function computeDpsAoeCategoryScores(detail: WikiDigimonDetail): {
  damage: number
  cooldown: number
  farming: number
  radius: number
} {
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
    const fit = farmRespawnPriority(period)
    farmCooldownRaw += invCd * fit
    farmRadiusRaw += Math.log1p(Math.max(0, radius)) * fit

    if (!skillIsSupportOnly(s.base_dmg, s.scaling)) {
      const dmg = skillDamageAtLevel(s.base_dmg, s.scaling, lv, s.max_level)
      farmDamageRaw += dmg * fit

      const bucket = farmBucketByCooldownSec(s.cooldown_sec)
      const bucketScore = farmBucketSkillScore(dmg, radius, period)
      if (bucket === 0) farmLe8Best = Math.max(farmLe8Best, bucketScore)
      else if (bucket === 1) farm8To10Best = Math.max(farm8To10Best, bucketScore)
      else if (bucket === 2) farm10To12Best = Math.max(farm10To12Best, bucketScore)
      else farmGt12Best = Math.max(farmGt12Best, bucketScore)
    }
  }

  const farmingLegacy = (() => {
    const farmCooldown = Math.log1p(Math.max(0, farmCooldownRaw * 100))
    const farmDamage = Math.log1p(Math.max(0, farmDamageRaw))
    const farmRadius = Math.log1p(Math.max(0, farmRadiusRaw))
    return 0.75 * farmCooldown + 0.2 * farmDamage + 0.05 * farmRadius
  })()

  const farming = Number.isFinite(farmLe8Best)
    ? FARM_BUCKET_BASE_FAST + farmLe8Best
    : Number.isFinite(farm8To10Best)
      ? FARM_BUCKET_BASE_MED + farm8To10Best
      : Number.isFinite(farm10To12Best)
        ? FARM_BUCKET_BASE_SLOW + farm10To12Best
        : Number.isFinite(farmGt12Best)
          ? FARM_BUCKET_BASE_SLOWEST + farmGt12Best
          : farmingLegacy

  const main = pickMainDamagingAoe(detail)
  let damage = 0
  let cooldown = 0
  let radius = 0

  if (main) {
    damage = main.dmgPerCast / main.periodSec
    cooldown = Math.min(1, Math.max(0, main.castTimeSec / main.periodSec))
    radius = main.radius
  } else {
    const fallback = firstWikiAoeSkill(detail)
    if (fallback && typeof fallback.radius === 'number') {
      radius = fallback.radius
      const period = Math.max(0.5, fallback.cooldown_sec + fallback.cast_time_sec)
      cooldown = Math.min(1, Math.max(0, Math.max(0, fallback.cast_time_sec) / period))
    }
  }

  return { damage, cooldown, farming, radius }
}
