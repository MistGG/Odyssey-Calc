import type { WikiDigimonDetail, WikiSkill } from '../types/wikiApi'
import { skillDamageAtLevel, skillIsSupportOnly } from './skillDamage'
import { tierListSkillLevel } from './tierScoreParsing'

/** Wiki marks area skills with a positive `radius` (same rule as the AOE tag in the UI). */
export function skillIsWikiAoe(s: WikiSkill): boolean {
  return typeof s.radius === 'number' && s.radius > 0
}

/**
 * Heuristic AoE kit scores from AoE-tagged skills only (`radius` present).
 *
 * - **Damage**: `log1p` of summed per-cast damage at tier-list skill level (support-only AoE = 0 damage).
 * - **Cooldown**: `log1p` of summed `1 / (cast + cooldown)` — faster skills contribute more.
 * - **Radius**: `log1p` of summed wiki radius.
 * - **General**: arithmetic mean of the three (equal weight).
 */
export function computeDpsAoeCategoryScores(detail: WikiDigimonDetail): {
  general: number
  damage: number
  cooldown: number
  radius: number
} {
  let dmgSum = 0
  let invCdSum = 0
  let radSum = 0

  for (const s of detail.skills ?? []) {
    if (!skillIsWikiAoe(s)) continue
    const radius = s.radius as number
    const lv = tierListSkillLevel(s)
    const cd = Math.max(0.5, s.cooldown_sec + s.cast_time_sec)
    if (!skillIsSupportOnly(s.base_dmg, s.scaling)) {
      dmgSum += skillDamageAtLevel(s.base_dmg, s.scaling, lv, s.max_level)
    }
    invCdSum += 1 / cd
    radSum += radius
  }

  const damage = Math.log1p(Math.max(0, dmgSum))
  const cooldown = Math.log1p(Math.max(0, invCdSum))
  const radius = Math.log1p(Math.max(0, radSum))
  const general = (damage + cooldown + radius) / 3

  return { general, damage, cooldown, radius }
}
