/**
 * True Vice **only**: three weak-to chains (`A < B` means A is weak to B, so B “wins” vs A).
 * Digimon element must match the True Vice **element** roll, and this chart must say the digimon
 * **beats** the enemy element. No global ×1.5 (or any) skill damage from element elsewhere.
 *
 * Chains (game / user):
 * (1) Fire < Water < Ice < Fire
 * (2) Wind < Earth < Wood < Wind
 * (3) Iron < Thunder < Darkness < Light < Iron  — wiki uses **Steel** for Iron
 */
export function normalizeWikiElement(raw: string | null | undefined): string {
  const t = (raw ?? '').trim()
  if (!t) return ''
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
}

/** Wiki “Iron” in charts → Steel in API. */
function canonTrueViceElement(raw: string): string {
  const n = normalizeWikiElement(raw)
  if (n === 'Iron') return 'Steel'
  return n
}

/**
 * If attacker element `a` beats enemy element `e` on the True Vice chart, `BEATS[a] === e`.
 * Derived from A < B (A weak to B) ⇒ B beats A, etc.
 */
const TRUE_VICE_ELEMENT_BEATS: Record<string, string> = {
  // (1) Fire < Water < Ice < Fire
  Fire: 'Ice',
  Ice: 'Water',
  Water: 'Fire',
  // (2) Wind < Earth < Wood < Wind
  Wind: 'Wood',
  Wood: 'Earth',
  Earth: 'Wind',
  // (3) Iron/Steel < Thunder < Darkness < Light < Iron
  Steel: 'Light',
  Thunder: 'Steel',
  Darkness: 'Thunder',
  Light: 'Darkness',
}

/** True when digimon element beats enemy element on the True Vice chart (and enemy is set, not Neutral-only bypass). */
export function trueViceElementBonusActive(
  attackerDigimonElement: string | null | undefined,
  targetEnemyElement: string | null | undefined,
): boolean {
  const a = canonTrueViceElement(attackerDigimonElement ?? '')
  const e = canonTrueViceElement(targetEnemyElement ?? '')
  if (!a || !e) return false
  if (e === 'Neutral') return false
  const beats = TRUE_VICE_ELEMENT_BEATS[a]
  return !!beats && beats === e
}

/** Enemy element your digimon beats on the True Vice chart (for UI), or empty. */
export function trueViceElementBeatsTarget(attackerDigimonElement: string | null | undefined): string {
  const a = canonTrueViceElement(attackerDigimonElement ?? '')
  if (!a) return ''
  return TRUE_VICE_ELEMENT_BEATS[a] ?? ''
}

/** Human-readable weak-to lines for tooltips / legend. */
export const TRUE_VICE_ELEMENT_CHAINS_HELP: readonly string[] = [
  'Fire < Water < Ice < Fire',
  'Wind < Earth < Wood < Wind',
  'Steel (Iron) < Thunder < Darkness < Light < Steel',
]

/**
 * UI chart rows: attacker wiki element → enemy element it **beats** on the True Vice chart
 * (same information as {@link TRUE_VICE_ELEMENT_BEATS}, stable display order).
 */
export const TRUE_VICE_ELEMENT_BEAT_EDGES: readonly { attacker: string; defender: string }[] = [
  { attacker: 'Fire', defender: 'Ice' },
  { attacker: 'Ice', defender: 'Water' },
  { attacker: 'Water', defender: 'Fire' },
  { attacker: 'Wind', defender: 'Wood' },
  { attacker: 'Wood', defender: 'Earth' },
  { attacker: 'Earth', defender: 'Wind' },
  { attacker: 'Steel', defender: 'Light' },
  { attacker: 'Light', defender: 'Darkness' },
  { attacker: 'Darkness', defender: 'Thunder' },
  { attacker: 'Thunder', defender: 'Steel' },
]
