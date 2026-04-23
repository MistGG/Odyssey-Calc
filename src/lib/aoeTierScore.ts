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

/** Extra signal from cast cadence inside the farming raw sum (damaging AoE). */
const FARM_INVCD_WEIGHT = 50

/** Support-only AoE: weight on `invCd × cadence × log1p(radius)` (pull / tag value). */
const FARM_SUPPORT_AREA_WEIGHT = 40

/**
 * Heuristic AoE kit scores from AoE-tagged skills only (`radius` present).
 *
 * - **Damage**: `log1p` of summed per-cast damage at tier-list skill level (support-only AoE = 0 damage).
 * - **Cooldown**: `log1p` of summed `1 / (cast + cooldown)` — faster skills contribute more.
 * - **Farming**: `log1p` of a sum over AoE skills of (damage + cast-density bonus) × **respawn fit** ×
 *   light **area** factor. Respawn fit is `exp(-max(0, period − {@link FARM_MONSTER_RESPAWN_SEC}) / {@link FARM_MONSTER_RESPAWN_SEC})`
 *   with `period = cast + cooldown` (skills at or below the respawn window stay at full weight; slower cycles decay).
 *   Support-only AoE uses a smaller `invCd × fit × log1p(radius)` term instead of damage.
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
  let farmSum = 0

  for (const s of detail.skills ?? []) {
    if (!skillIsWikiAoe(s)) continue
    const radius = s.radius as number
    const lv = tierListSkillLevel(s)
    const period = Math.max(0.5, s.cooldown_sec + s.cast_time_sec)
    const invCd = 1 / period
    invCdSum += invCd

    const cadenceFit = Math.exp(
      -Math.max(0, period - FARM_MONSTER_RESPAWN_SEC) / FARM_MONSTER_RESPAWN_SEC,
    )
    const coverage = 1 + 0.22 * Math.log1p(Math.max(0, radius))

    if (!skillIsSupportOnly(s.base_dmg, s.scaling)) {
      const dmg = skillDamageAtLevel(s.base_dmg, s.scaling, lv, s.max_level)
      dmgSum += dmg
      farmSum += (dmg + FARM_INVCD_WEIGHT * invCd) * cadenceFit * coverage
    } else {
      farmSum += FARM_SUPPORT_AREA_WEIGHT * invCd * cadenceFit * Math.log1p(Math.max(0, radius))
    }
  }

  const damage = Math.log1p(Math.max(0, dmgSum))
  const cooldown = Math.log1p(Math.max(0, invCdSum))
  const farming = Math.log1p(Math.max(0, farmSum))
  const general = (damage + cooldown + farming) / 3

  return { general, damage, cooldown, farming }
}
