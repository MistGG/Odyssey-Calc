/** Wiki list / tier filter facets; keep in sync with browse filters. */

export const WIKI_ELEMENT_OPTIONS = [
  'Fire',
  'Water',
  'Wind',
  'Earth',
  'Light',
  'Darkness',
  'Steel',
  'Wood',
  'Thunder',
  'Ice',
  'Neutral',
] as const

export const WIKI_ATTRIBUTE_OPTIONS = ['Vaccine', 'Data', 'Virus', 'Free', 'None'] as const

/** Enemy attribute for DPS lab / tier sim (no Free; wiki neutral is None). */
export const DPS_TARGET_ENEMY_ATTRIBUTE_OPTIONS = ['Vaccine', 'Data', 'Virus', 'None'] as const

/** Normalize stored / URL enemy attribute: invalid or legacy values (e.g. Free) → empty. */
export function sanitizeDpsTargetEnemyAttribute(raw: string): string {
  const t = (raw ?? '').trim()
  if (!t) return ''
  if ((DPS_TARGET_ENEMY_ATTRIBUTE_OPTIONS as readonly string[]).includes(t)) return t
  return ''
}

/** Wiki `family_types` values; keep in sync with browse filters. */
export const WIKI_FAMILY_OPTIONS = [
  'Dark Area',
  'Deep Savers',
  "Dragon's Roar",
  'Jungle Troopers',
  'Metal Empire',
  'Nature Spirits',
  'Nightmare Soldiers',
  'TBD',
  'Unknown',
  'Virus Busters',
  'Wind Guardians',
] as const
