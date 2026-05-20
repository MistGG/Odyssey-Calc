import { fetchDigimonPage } from '../api/digimonService'
import { normalizeWikiRole } from './digimonRoleSkills'
import {
  memberDigimonBreakdowns,
  type MeterPartyMemberStored,
} from './meterParsePayload'

export type MeterRoleBucket = 'dps' | 'hybrid' | 'tank' | 'healer'

export const METER_ROLE_BUCKETS: MeterRoleBucket[] = ['dps', 'hybrid', 'tank', 'healer']

export const METER_ROLE_BUCKET_LABELS: Record<MeterRoleBucket, string> = {
  dps: 'DPS',
  hybrid: 'Hybrid',
  tank: 'Tank',
  healer: 'Healer',
}

const DPS_WIKI_ROLES = new Set(['melee dps', 'ranged dps', 'caster'])

/** Map wiki `role` (normalized) to meter leaderboard bucket. */
export function wikiRoleToBucket(role: string | null | undefined): MeterRoleBucket | null {
  const norm = normalizeWikiRole(role)
  if (DPS_WIKI_ROLES.has(norm)) return 'dps'
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

export function memberDps(member: MeterPartyMemberStored): number {
  const d = Math.max(0, member.durationSec)
  return d > 0 ? member.totalDamage / d : 0
}

/** Role bucket from highest-DPS digimon used; fallback `currentDigimonId`. */
export function memberRoleBucket(
  member: MeterPartyMemberStored,
  digimonRoleById: Map<string, string>,
): MeterRoleBucket | null {
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
