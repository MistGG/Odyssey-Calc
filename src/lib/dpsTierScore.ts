import type { WikiDigimonDetail } from '../types/wikiApi'
import { skillIsSupportOnly } from './skillDamage'

/** Tier list burst column: short window matches opener/burst-heavy kits. */
export const BURST_DPS_WINDOW_SEC = 10

/** Description/buff text hints that the support skill affects multiple allies (party / group buffs). */
const GROUP_BUFF_TEXT_HINT =
  /\b(party|allies|ally|raid|group|nearby\s+allies|all\s+party|friendly\s+(?:digimon|units?))\b/i

/**
 * Rank key for the Specialized tier column — wiki DEX plus a heuristic “group buff kit” score.
 * Group buffs: support-only skills (`base_dmg`/`scaling` both 0) that either have wiki `radius`
 * (AoE bubble) or mention party/allies/group-style buffing in skill or buff description.
 *
 * Tunable heuristic only; refine as parsing improves.
 */
export function computeDpsSpecializedScore(detail: WikiDigimonDetail): number {
  const dex = Math.max(0, detail.stats?.dex ?? 0)
  let groupBuffSignals = 0

  for (const s of detail.skills ?? []) {
    if (!skillIsSupportOnly(s.base_dmg, s.scaling)) continue
    const radiusOk = typeof s.radius === 'number' && s.radius > 0
    const blob = `${s.description ?? ''}\n${s.buff?.description ?? ''}`
    const textOk = GROUP_BUFF_TEXT_HINT.test(blob)
    if (radiusOk || textOk) groupBuffSignals += 1
  }

  return Math.log1p(dex / 120 + groupBuffSignals * 6)
}
