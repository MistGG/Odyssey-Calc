import { fetchDigimonPage } from '../api/digimonService'

import { normalizeWikiRole } from './digimonRoleSkills'

import {
  isBrokenMeterPartyParse,
  memberDamageTotal,
  memberDigimonBreakdowns,
  sessionDurationFromPayload,
  type MeterPartyMemberStored,
} from './meterParsePayload'



export type MeterRoleBucket = 'melee' | 'ranged' | 'caster' | 'hybrid' | 'tank' | 'healer'



export const METER_ROLE_BUCKETS: MeterRoleBucket[] = [

  'melee',

  'ranged',

  'caster',

  'hybrid',

  'tank',

  'healer',

]



export const METER_ROLE_BUCKET_LABELS: Record<MeterRoleBucket, string> = {

  melee: 'Melee',

  ranged: 'Ranged',

  caster: 'Caster',

  hybrid: 'Hybrid',

  tank: 'Tank',

  healer: 'Healer',

}



/** Map wiki `role` (normalized) to meter leaderboard bucket. */

export function wikiRoleToBucket(role: string | null | undefined): MeterRoleBucket | null {

  const norm = normalizeWikiRole(role)

  if (norm === 'melee dps') return 'melee'

  if (norm === 'ranged dps') return 'ranged'

  if (norm === 'caster') return 'caster'

  if (norm === 'hybrid') return 'hybrid'

  if (norm === 'tank') return 'tank'

  if (norm === 'support') return 'healer'

  return null

}



export function digimonIdToBucket(

  digimonId: string,

  digimonRoleById: Map<string, string>,

): MeterRoleBucket | null {

  const role = digimonRoleById.get(digimonId)

  return wikiRoleToBucket(role)

}



/** DPS for one member in a dungeon/party parse (session duration, damage from breakdown). */
export function memberDpsInParse(
  member: MeterPartyMemberStored,
  payload: unknown,
  rowDurationSec: number,
  members: MeterPartyMemberStored[],
): number {
  if (isBrokenMeterPartyParse(payload, members)) return 0
  const damage = memberDamageTotal(member)
  const sessionDur = sessionDurationFromPayload(payload, rowDurationSec, members)
  const dur = Math.max(sessionDur, member.durationSec, 1e-6)
  return dur > 0 ? damage / dur : 0
}

/** Fallback when parse context is unavailable. */
export function memberDps(member: MeterPartyMemberStored): number {
  const damage = memberDamageTotal(member)
  const dur = Math.max(member.durationSec, 1e-6)
  return dur > 0 ? damage / dur : 0
}



/** Digimon that dealt the most DPS for this member in the parse; fallback `currentDigimonId`. */
export function memberPrimaryDigimonId(member: MeterPartyMemberStored): string | null {
  const digimons = memberDigimonBreakdowns(member)
  const dur = Math.max(member.durationSec, 1e-6)
  let bestId: string | null = member.currentDigimonId?.trim() || null
  let bestDps = -1
  for (const dg of digimons) {
    const dps = dg.totalDamage / dur
    if (dps > bestDps) {
      bestDps = dps
      bestId = dg.digimonId
    }
  }
  return bestId
}

/** Role bucket from highest-DPS digimon used; fallback `currentDigimonId`. */
export function memberRoleBucket(
  member: MeterPartyMemberStored,
  digimonRoleById: Map<string, string>,
): MeterRoleBucket | null {
  const bestId = memberPrimaryDigimonId(member)
  if (!bestId) return null
  return digimonIdToBucket(bestId, digimonRoleById)
}



export function normalizePlayerKey(member: MeterPartyMemberStored): string {

  const raw = member.tamerName?.trim() || member.displayLabel.trim()

  return raw.toLowerCase()

}



export function playerDisplayName(member: MeterPartyMemberStored): string {

  return member.tamerName?.trim() || member.displayLabel.trim()

}

/** Digimon that contributed the most DPS in this member's parse (for player leaderboard label). */
export function memberTopDigimonUsed(member: MeterPartyMemberStored): {
  digimonId: string
  digimonName: string
  iconId: string | null
  portraitUrl?: string
} | null {
  const digimons = memberDigimonBreakdowns(member)
  const dur = Math.max(member.durationSec, 1e-6)
  let best: (typeof digimons)[number] | null = null
  let bestDps = -1
  for (const dg of digimons) {
    const dps = dg.totalDamage / dur
    if (dps > bestDps) {
      bestDps = dps
      best = dg
    }
  }
  if (best) {
    return {
      digimonId: best.digimonId,
      digimonName: best.digimonName,
      iconId: best.iconId,
      portraitUrl: best.portraitUrl,
    }
  }
  const id = member.currentDigimonId?.trim()
  if (!id) return null
  return {
    digimonId: id,
    digimonName: member.currentDigimonName?.trim() || member.displayLabel.trim(),
    iconId: member.portraitIconId?.trim() || null,
    portraitUrl: member.portraitUrl,
  }
}



let roleMapCache: Map<string, string> | null = null

let roleMapPromise: Promise<Map<string, string>> | null = null



/** Wiki digimon id → raw wiki role string. */

export async function fetchDigimonRoleMap(): Promise<Map<string, string>> {

  if (roleMapCache) return roleMapCache

  if (roleMapPromise) return roleMapPromise

  roleMapPromise = (async () => {

    const first = await fetchDigimonPage(0, 500)

    const all = [...first.data]

    for (let p = 2; p <= Math.max(1, first.total_pages || 1); p += 1) {

      const next = await fetchDigimonPage(p - 1, 500)

      all.push(...next.data)

    }

    const map = new Map<string, string>()

    for (const d of all) map.set(d.id, d.role)

    roleMapCache = map

    return map

  })()

  return roleMapPromise

}

