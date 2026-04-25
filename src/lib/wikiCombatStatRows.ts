import type { WikiCombatStats } from '../types/wikiApi'

/** Rows for wiki combat stats grids (detail page, lab, etc.). */
export function wikiCombatStatRows(
  stats: WikiCombatStats | null | undefined,
): Array<[string, number | string]> {
  if (!stats) return []
  const critRatePct = stats.crit_rate / 1000
  const atkSpeedVal = stats.atk_speed / 1000
  return [
    ['HP', stats.hp],
    ['DS', stats.ds],
    ['Attack', stats.attack],
    ['Defense', stats.defense],
    ['Crit rate', `${stats.crit_rate.toLocaleString()} (${critRatePct.toFixed(1)}%)`],
    ['ATK speed', `${stats.atk_speed.toLocaleString()} (${atkSpeedVal.toFixed(1)})`],
    ['DEX', stats.dex],
    ['INT', stats.int],
    ['Evasion', stats.evasion],
    ['Hit rate', stats.hit_rate],
    ['Block rate', stats.block_rate],
  ]
}
