import type { WikiSkill } from '../types/wikiApi'

/**
 * Stable fingerprint of skill *numbers* (and ids) for cache / debugging.
 * Omits long text fields (name, description) that do not affect DPS sim math.
 */
export function tierSkillsSignature(skills: WikiSkill[]): string {
  const rows = [...skills].sort((a, b) => a.id.localeCompare(b.id))
  return rows
    .map((s) =>
      [
        s.id,
        s.base_dmg,
        s.scaling,
        s.max_level,
        s.cast_time_sec,
        s.cooldown_sec,
        s.ds_cost,
        s.radius ?? '',
        s.buff?.id ?? '',
        s.buff?.duration ?? '',
      ].join(':'),
    )
    .join('|')
}
