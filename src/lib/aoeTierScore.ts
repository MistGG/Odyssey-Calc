import type { WikiDigimonDetail, WikiSkill } from '../types/wikiApi'
import { skillDamageAtLevel, skillIsSupportOnly } from './skillDamage'
import { tierListSkillLevel } from './tierScoreParsing'

/** Wiki marks area skills with a positive `radius` (same rule as the AOE tag in the UI). */
export function skillIsWikiAoe(s: WikiSkill): boolean {
  return typeof s.radius === 'number' && s.radius > 0
}

/**
 * Open-world style pack respawn cadence (seconds). Farming score favors AoE skills whose
 * cast+cooldown cycle aligns with clearing again when packs return.
 */
export const FARM_MONSTER_RESPAWN_SEC = 8

/** Farming blend: cooldown priority first, then damage, then area. */
const FARM_WEIGHT_COOLDOWN = 0.75
const FARM_WEIGHT_DAMAGE = 0.2
const FARM_WEIGHT_RADIUS = 0.05

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

/**
 * Heuristic AoE kit scores from AoE-tagged skills only (`radius` present).
 *
 * - **Damage**: `log1p` of summed per-cast damage at tier-list skill level (support-only AoE = 0 damage).
 * - **Cooldown**: `log1p` of summed `1 / (cast + cooldown)` — faster skills contribute more.
 * - **Farming**: weighted blend emphasizing low cooldowns that fit respawns.
 *   - 75% cooldown priority: `invCd × respawnPriority(period)` (target 8s, still okay up to ~10s, then decays fast)
 *   - 20% damage at tier-list skill level
 *   - 5% radius
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
    }
  }

  const damage = Math.log1p(Math.max(0, dmgSum))
  const cooldown = Math.log1p(Math.max(0, invCdSum))
  const farmCooldown = Math.log1p(Math.max(0, farmCooldownRaw * 100))
  const farmDamage = Math.log1p(Math.max(0, farmDamageRaw))
  const farmRadius = Math.log1p(Math.max(0, farmRadiusRaw))
  const farming =
    FARM_WEIGHT_COOLDOWN * farmCooldown +
    FARM_WEIGHT_DAMAGE * farmDamage +
    FARM_WEIGHT_RADIUS * farmRadius
  const general = (damage + cooldown + farming) / 3

  return { general, damage, cooldown, farming }
}
