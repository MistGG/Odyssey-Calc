/**
 * Wiki Vaccine / Data / Virus triangle: advantage grants extra **skill** damage (not auto-attack).
 * Wiki **None** (neutral enemy): all attackers get the multiplier.
 * Empty target in the UI means “no matchup” → no multiplier. Free is not a sim target option.
 */
export const ATTRIBUTE_ADVANTAGE_SKILL_DAMAGE_MULT = 1.5

const BEATS: Record<string, string> = {
  Vaccine: 'Data',
  Data: 'Virus',
  Virus: 'Vaccine',
}

/** Ordered triangle edges for UI: attacker beats defender. */
export const ATTRIBUTE_TRIANGLE_EDGES: readonly { attacker: string; defender: string }[] = [
  { attacker: 'Vaccine', defender: 'Data' },
  { attacker: 'Data', defender: 'Virus' },
  { attacker: 'Virus', defender: 'Vaccine' },
]

export function normalizeWikiAttribute(raw: string | null | undefined): string {
  const t = (raw ?? '').trim()
  if (!t) return ''
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
}

/** Defender attribute this attacker beats in the triangle, or null if not on the triangle. */
export function attributeTriangleStrongVs(attackerAttribute: string | null | undefined): string | null {
  const a = normalizeWikiAttribute(attackerAttribute)
  const d = BEATS[a]
  return d ?? null
}

/** Attacker wiki attribute that wins vs this enemy on the triangle (Vaccine/Data/Virus only). */
export function attributeTriangleCountersEnemy(enemyAttribute: string | null | undefined): string | null {
  const d = normalizeWikiAttribute(enemyAttribute)
  if (d !== 'Vaccine' && d !== 'Data' && d !== 'Virus') return null
  const pair = Object.entries(BEATS) as [string, string][]
  for (const [atk, def] of pair) {
    if (def === d) return atk
  }
  return null
}

/** Skill-hit multiplier (1 or {@link ATTRIBUTE_ADVANTAGE_SKILL_DAMAGE_MULT}). */
export function attributeAdvantageSkillDamageMultiplier(
  attackerAttribute: string | null | undefined,
  targetEnemyAttribute: string | null | undefined,
): number {
  const a = normalizeWikiAttribute(attackerAttribute)
  const d = normalizeWikiAttribute(targetEnemyAttribute)
  if (!d) return 1
  if (d === 'None') return ATTRIBUTE_ADVANTAGE_SKILL_DAMAGE_MULT
  if (!a) return 1
  if (BEATS[a] === d) return ATTRIBUTE_ADVANTAGE_SKILL_DAMAGE_MULT
  return 1
}

export function attributeAdvantageIsActive(
  attackerAttribute: string | null | undefined,
  targetEnemyAttribute: string | null | undefined,
): boolean {
  return attributeAdvantageSkillDamageMultiplier(attackerAttribute, targetEnemyAttribute) > 1 + 1e-9
}
