import { fetchDigimonPage } from '../api/digimonService'

import {
  partyDigimonIdsFromMembers,
  reconcileMemberDigimonBreakdownFromSkills,
} from './meterSkillDigimonAttribution'

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



const DPS_ROLE_BUCKETS: MeterRoleBucket[] = ['melee', 'ranged', 'caster', 'hybrid']

export function isDpsRoleBucket(bucket: MeterRoleBucket | null | undefined): boolean {
  return bucket != null && DPS_ROLE_BUCKETS.includes(bucket)
}

function memberHasDpsAndNonDpsDamage(
  totals: Map<string, number>,
  digimonRoleById: Map<string, string>,
): boolean {
  let hasDps = false
  let hasNonDps = false
  for (const [id, damage] of totals) {
    if (damage <= 0) continue
    const bucket = digimonIdToBucket(id, digimonRoleById)
    if (!bucket) continue
    if (isDpsRoleBucket(bucket)) hasDps = true
    else hasNonDps = true
    if (hasDps && hasNonDps) return true
  }
  return false
}



/** Fallback when parse context is unavailable. */
export function memberDps(member: MeterPartyMemberStored): number {
  const damage = memberDamageTotal(member)
  const dur = Math.max(member.durationSec, 1e-6)
  return dur > 0 ? damage / dur : 0
}



/** Digimon that dealt the most damage this run (ignores end-of-run swap / evolution active slot). */
export function memberPrimaryDigimonId(
  member: MeterPartyMemberStored,
  digimonRoleById?: Map<string, string>,
): string | null {
  const top = memberTopDigimonUsed(member, digimonRoleById)
  return top?.digimonId?.trim() || member.currentDigimonId?.trim() || null
}

/** Damage credited to the leaderboard-attributed digimon (not end-of-run swap). */
export function memberLeaderboardDamage(
  member: MeterPartyMemberStored,
  digimonRoleById?: Map<string, string>,
): number {
  const digimons = memberDigimonBreakdowns(member)
  if (digimons.length <= 1) return memberDamageTotal(member)
  const totals = digimonIdDamageTotals(digimons)
  if (totals.size <= 1) return memberDamageTotal(member)
  if (digimonRoleById && memberHasDpsAndNonDpsDamage(totals, digimonRoleById)) {
    return memberDamageTotal(member)
  }
  const top = memberTopDigimonUsed(member, digimonRoleById)
  if (!top) return memberDamageTotal(member)
  const dmg = Math.max(0, totals.get(top.digimonId.trim()) ?? 0)
  return dmg > 0 ? dmg : memberDamageTotal(member)
}

/** DPS for leaderboard from the digimon that dealt the most damage (multi-form runs). */
export function memberDpsInParse(
  member: MeterPartyMemberStored,
  payload: unknown,
  rowDurationSec: number,
  members: MeterPartyMemberStored[],
  digimonRoleById?: Map<string, string>,
): number {
  if (isBrokenMeterPartyParse(payload, members)) return 0
  const damage = memberLeaderboardDamage(member, digimonRoleById)
  const sessionDur = sessionDurationFromPayload(payload, rowDurationSec, members)
  const dur = Math.max(sessionDur, member.durationSec, 1e-6)
  return dur > 0 ? damage / dur : 0
}

/** Role bucket from leaderboard attribution digimon; fallback `currentDigimonId`. */
export function memberRoleBucket(
  member: MeterPartyMemberStored,
  digimonRoleById: Map<string, string>,
): MeterRoleBucket | null {
  const bestId = memberPrimaryDigimonId(member, digimonRoleById)
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

function digimonIdDamageTotals(
  digimons: ReturnType<typeof memberDigimonBreakdowns>,
): Map<string, number> {
  const totals = new Map<string, number>()
  for (const dg of digimons) {
    const id = dg.digimonId.trim()
    if (!id) continue
    totals.set(id, (totals.get(id) ?? 0) + Math.max(0, dg.totalDamage))
  }
  return totals
}

function pickLeaderboardDigimonRow(
  digimons: ReturnType<typeof memberDigimonBreakdowns>,
  bestId: string,
): (typeof digimons)[number] | null {
  let bestRow: (typeof digimons)[number] | null = null
  let bestRowDamage = -1
  for (const dg of digimons) {
    if (dg.digimonId.trim() !== bestId) continue
    const damage = Math.max(0, dg.totalDamage)
    if (damage > bestRowDamage) {
      bestRowDamage = damage
      bestRow = dg
    }
  }
  return bestRow
}

function pickLeaderboardDigimon(
  digimons: ReturnType<typeof memberDigimonBreakdowns>,
  digimonRoleById?: Map<string, string>,
): (typeof digimons)[number] | null {
  const totals = digimonIdDamageTotals(digimons)

  if (digimonRoleById && memberHasDpsAndNonDpsDamage(totals, digimonRoleById)) {
    let bestDpsId: string | null = null
    let bestDpsDamage = -1
    for (const [id, damage] of totals) {
      if (!isDpsRoleBucket(digimonIdToBucket(id, digimonRoleById))) continue
      if (damage > bestDpsDamage) {
        bestDpsDamage = damage
        bestDpsId = id
      }
    }
    if (bestDpsId) return pickLeaderboardDigimonRow(digimons, bestDpsId)
  }

  let bestId: string | null = null
  let bestDamage = -1
  for (const [id, damage] of totals) {
    if (damage > bestDamage) {
      bestDamage = damage
      bestId = id
    }
  }
  if (!bestId) return null
  return pickLeaderboardDigimonRow(digimons, bestId)
}

/** Digimon used for leaderboard role + label (highest damage this run). */
export function memberTopDigimonUsed(
  member: MeterPartyMemberStored,
  digimonRoleById?: Map<string, string>,
  partyMembers?: MeterPartyMemberStored[],
): {
  digimonId: string
  digimonName: string
  iconId: string | null
  portraitUrl?: string
} | null {
  if (partyMembers?.length) {
    reconcileMemberDigimonBreakdownFromSkills(
      member,
      partyDigimonIdsFromMembers(partyMembers),
    )
  }
  const digimons = memberDigimonBreakdowns(member)
  const best = pickLeaderboardDigimon(digimons, digimonRoleById)
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

export type WikiDigimonCatalogEntry = {
  name: string
  modelId: string
  role: string
}

let catalogCache: Map<string, WikiDigimonCatalogEntry> | null = null
let catalogPromise: Promise<Map<string, WikiDigimonCatalogEntry>> | null = null

const ROLE_MAP_SESSION_KEY = 'odyssey-meter-digi-roles-v1'
const CATALOG_SESSION_KEY = 'odyssey-meter-digi-catalog-v1'
const ROLE_MAP_TTL_MS = 24 * 60 * 60 * 1000

function readCatalogFromSession(allowStale = false): Map<string, WikiDigimonCatalogEntry> | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(CATALOG_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      at: number
      entries: [string, WikiDigimonCatalogEntry][]
    }
    if (!Array.isArray(parsed.entries)) return null
    if (!allowStale && Date.now() - parsed.at > ROLE_MAP_TTL_MS) return null
    const map = new Map<string, WikiDigimonCatalogEntry>(parsed.entries)
    return map.size > 0 ? map : null
  } catch {
    return null
  }
}

function writeCatalogToSession(map: Map<string, WikiDigimonCatalogEntry>): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(
      CATALOG_SESSION_KEY,
      JSON.stringify({ at: Date.now(), entries: [...map.entries()] }),
    )
    const roles = new Map<string, string>()
    for (const [id, entry] of map) roles.set(id, entry.role)
    sessionStorage.setItem(
      ROLE_MAP_SESSION_KEY,
      JSON.stringify({ at: Date.now(), entries: [...roles.entries()] }),
    )
  } catch {
    /* quota */
  }
}

/** One paginated wiki fetch — names, portraits, and roles for all digimon. */
export async function fetchWikiDigimonCatalog(): Promise<Map<string, WikiDigimonCatalogEntry>> {
  if (catalogCache) return catalogCache
  if (catalogPromise) return catalogPromise

  const sessionCatalog = readCatalogFromSession()
  if (sessionCatalog) {
    catalogCache = sessionCatalog
    roleMapCache = new Map([...sessionCatalog].map(([id, e]) => [id, e.role]))
    return sessionCatalog
  }

  catalogPromise = (async () => {
    try {
      const first = await fetchDigimonPage(0, 500)
      const all = [...first.data]
      for (let p = 2; p <= Math.max(1, first.total_pages || 1); p += 1) {
        const next = await fetchDigimonPage(p - 1, 500)
        all.push(...next.data)
      }
      const map = new Map<string, WikiDigimonCatalogEntry>()
      for (const d of all) {
        map.set(d.id, {
          name: d.name?.trim() || '',
          modelId: d.model_id?.trim() || '',
          role: d.role?.trim() || '',
        })
      }
      catalogCache = map
      roleMapCache = new Map([...map].map(([id, e]) => [id, e.role]))
      writeCatalogToSession(map)
      return map
    } catch {
      const stale = readCatalogFromSession(true)
      if (stale) {
        catalogCache = stale
        roleMapCache = new Map([...stale].map(([id, e]) => [id, e.role]))
        return stale
      }
      catalogPromise = null
      throw new Error('Could not load wiki digimon catalog.')
    }
  })()

  return catalogPromise
}

function readRoleMapFromSession(): Map<string, string> | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(ROLE_MAP_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at: number; entries: [string, string][] }
    if (!Array.isArray(parsed.entries) || Date.now() - parsed.at > ROLE_MAP_TTL_MS) return null
    const map = new Map<string, string>(parsed.entries)
    return map.size > 0 ? map : null
  } catch {
    return null
  }
}

/** Wiki digimon id → raw wiki role string. */
export async function fetchDigimonRoleMap(): Promise<Map<string, string>> {
  if (roleMapCache) return roleMapCache
  if (roleMapPromise) return roleMapPromise

  const sessionMap = readRoleMapFromSession()
  if (sessionMap) {
    roleMapCache = sessionMap
    return sessionMap
  }

  roleMapPromise = fetchWikiDigimonCatalog().then((catalog) => {
    const map = new Map<string, string>()
    for (const [id, entry] of catalog) map.set(id, entry.role)
    roleMapCache = map
    return map
  })

  return roleMapPromise
}

