/** In-game cap for skill level (wiki/API `max_level` may match this). */
export const SKILL_LEVEL_CAP = 25

/**
 * Flat scaling: each level after 1 adds `scaling` to damage.
 * Level 1 = `baseDmg`; level 25 = `baseDmg + 24 * scaling`.
 */
export function skillDamageAtLevel(
  baseDmg: number,
  scaling: number,
  level: number,
  maxLevel: number = SKILL_LEVEL_CAP,
) {
  const cap = Math.max(1, Math.min(maxLevel, SKILL_LEVEL_CAP))
  const L = Math.max(1, Math.min(Math.floor(level), cap))
  return baseDmg + scaling * (L - 1)
}

export function skillSustainDps(
  baseDmg: number,
  scaling: number,
  level: number,
  cooldownSec: number,
  castTimeSec: number,
  maxLevel?: number,
) {
  const cd = cooldownSec + castTimeSec
  if (cd <= 0) return null
  const dmg = skillDamageAtLevel(baseDmg, scaling, level, maxLevel)
  if (dmg <= 0) return null
  return dmg / cd
}

/** Buff / heal style skills with no damage contribution (excluded from DPS). */
export function skillIsSupportOnly(baseDmg: number, scaling: number) {
  return baseDmg === 0 && scaling === 0
}
