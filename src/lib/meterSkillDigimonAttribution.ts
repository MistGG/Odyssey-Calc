import {
  memberDigimonBreakdowns,
  type DigimonSkillBreakdownStored,
  type MeterPartyMemberStored,
} from './meterParsePayload'

function normSkillKey(key: string): string {
  return key.trim().toLowerCase()
}

/** Justimon-exclusive skill keys (wiki template ids). */
const JUSTIMON_SKILL_KEYS = new Set(['s17n1tnq', 'sxpj32p', 'sjf3ii7', 's1d4eddt'])

const JUSTIMON_SKILL_NAME = /^(accel arm|final justice|justice kick|justice impact field|agent alpha)$/i

export function isJustimonSkill(skillKey: string, skillName: string): boolean {
  const key = normSkillKey(skillKey)
  if (JUSTIMON_SKILL_KEYS.has(key)) return true
  return JUSTIMON_SKILL_NAME.test(skillName.trim())
}

export type WikiSkillOwnership = {
  skillBelongs: (digimonId: string, skillKey: string, skillName: string) => boolean
}

function justimonDamage(digimons: DigimonSkillBreakdownStored[]): number {
  let total = 0
  for (const dg of digimons) {
    for (const s of dg.skills) {
      if (isJustimonSkill(String(s.skillKey ?? ''), String(s.skill ?? ''))) {
        total += Math.max(0, s.damage)
      }
    }
  }
  return total
}

/**
 * Rebuild `member.digimons` when skills clearly belong to a different species than stored id
 * (e.g. Justimon skills under Toy Agumon id).
 */
export function reconcileMemberDigimonBreakdownFromSkills(
  member: MeterPartyMemberStored,
  partyDigimonIds: string[],
): DigimonSkillBreakdownStored[] {
  const digimons = memberDigimonBreakdowns(member)
  if (!digimons.length) return digimons

  const jDmg = justimonDamage(digimons)
  const justimonId =
    partyDigimonIds.find((id) => id.trim().toLowerCase() === 'djwfsba') ?? 'djwfsba'

  if (jDmg <= 0) return digimons

  const storedJustimonDmg = digimons
    .filter((d) => d.digimonId.trim().toLowerCase() === justimonId.toLowerCase())
    .reduce((s, d) => s + d.totalDamage, 0)
  if (jDmg <= storedJustimonDmg + 1000) return digimons

  const justimonSkills = digimons.flatMap((d) =>
    d.skills.filter((s) => isJustimonSkill(String(s.skillKey ?? ''), String(s.skill ?? ''))),
  )
  const autoSkills = digimons.flatMap((d) =>
    d.skills.filter((s) => /auto attack|\(basic\)/i.test(String(s.skill ?? ''))),
  )

  const justimonTotal =
    justimonSkills.reduce((s, sk) => s + sk.damage, 0) +
    autoSkills.reduce((s, sk) => s + sk.damage, 0)

  const otherById = new Map<string, DigimonSkillBreakdownStored>()
  for (const dg of digimons) {
    if (dg.digimonId.trim().toLowerCase() === justimonId.toLowerCase()) continue
    const remSkills = dg.skills.filter(
      (s) => !isJustimonSkill(String(s.skillKey ?? ''), String(s.skill ?? '')),
    )
    const remDmg = remSkills.reduce((s, sk) => s + sk.damage, 0)
    if (remDmg <= 0) continue
    otherById.set(dg.digimonId, {
      ...dg,
      skills: remSkills,
      totalDamage: remDmg,
    })
  }

  const out: DigimonSkillBreakdownStored[] = [
    {
      digimonId: justimonId,
      digimonName: 'Justimon',
      iconId: digimons.find((d) => d.digimonId === justimonId)?.iconId ?? null,
      portraitUrl: digimons.find((d) => d.digimonId === justimonId)?.portraitUrl,
      totalDamage: Math.round(justimonTotal),
      skills: [...justimonSkills, ...autoSkills],
    },
    ...otherById.values(),
  ].filter((d) => d.totalDamage > 0)

  member.digimons = out
  return out
}

export function partyDigimonIdsFromMembers(
  members: MeterPartyMemberStored[] | undefined,
): string[] {
  const ids = new Set<string>()
  for (const m of members ?? []) {
    for (const d of memberDigimonBreakdowns(m)) {
      const id = d.digimonId?.trim()
      if (id) ids.add(id)
    }
    const cur = m.currentDigimonId?.trim()
    if (cur) ids.add(cur)
  }
  return [...ids]
}
