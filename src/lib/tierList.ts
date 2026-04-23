import type { DigimonContentStatus } from './contentStatus'

export const TIER_LIST_CACHE_KEY = 'odysseyCalc.tierList.v1'

/** Re-fetch detail (skills + stats) after this long even if the index row is unchanged. */
export const TIER_ENTRY_STALE_MS = 7 * 24 * 60 * 60 * 1000

export function tierEntryIsStaleForDetailFetch(
  entry: SustainedDpsEntry | undefined,
  nowMs = Date.now(),
): boolean {
  if (!entry?.checkedAt) return true
  return nowMs - new Date(entry.checkedAt).getTime() > TIER_ENTRY_STALE_MS
}

export type TierBucket = 'S' | 'A' | 'B' | 'C'

export type TierListMode = 'dps' | 'tank'

export type SustainedDpsEntry = {
  id: string
  name: string
  role: string
  stage: string
  dps: number
  /** Heuristic tank index from stats + parsed mitigation (see tankTierScore). */
  tankScore?: number
  status?: DigimonContentStatus
  checkedAt: string
  /** Fingerprint of skill stats last time detail was fetched (see tierSkillsSignature). */
  skillsSignature?: string
}

export type TierListCache = {
  version: 3
  total: number
  queue: string[]
  entries: Record<string, SustainedDpsEntry>
  listSignatures: Record<string, string>
  lastCheckedAt?: string
}

export type TierGroup = {
  role: string
  tiers: Record<TierBucket, SustainedDpsEntry[]>
}

const ROLE_ORDER = [
  'Melee DPS',
  'Ranged DPS',
  'Caster',
  'Hybrid',
  'Tank',
  'Support',
  'None',
] as const

const ROLE_ORDER_INDEX = new Map<string, number>(
  ROLE_ORDER.map((role, idx) => [role, idx]),
)

export function loadTierListCache(): TierListCache | null {
  try {
    const raw = localStorage.getItem(TIER_LIST_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as
      | TierListCache
      | (Omit<TierListCache, 'version' | 'listSignatures'> & { version: 1 })
      | (Omit<TierListCache, 'version'> & { version: 2 })
    if (!parsed) return null
    if (parsed.version === 3) return parsed
    if (parsed.version === 2) {
      return { ...parsed, version: 3 }
    }
    if (parsed.version === 1) {
      return {
        ...parsed,
        version: 3,
        listSignatures: {},
      }
    }
    return null
  } catch {
    return null
  }
}

export function saveTierListCache(cache: TierListCache) {
  localStorage.setItem(TIER_LIST_CACHE_KEY, JSON.stringify(cache))
}

export function createEmptyTierListCache(ids: string[]): TierListCache {
  return {
    version: 3,
    total: ids.length,
    queue: [...ids],
    entries: {},
    listSignatures: {},
  }
}

function tierSortValue(entry: SustainedDpsEntry, mode: TierListMode): number {
  if (mode === 'tank') return entry.tankScore ?? -1
  return entry.dps
}

export function buildTierGroups(
  entriesMap: Record<string, SustainedDpsEntry>,
  mode: TierListMode = 'dps',
) {
  const byRole = new Map<string, SustainedDpsEntry[]>()
  for (const e of Object.values(entriesMap)) {
    const role = e.role || 'Unknown'
    if (mode === 'tank' && role !== 'Tank') continue
    if (!byRole.has(role)) byRole.set(role, [])
    byRole.get(role)!.push(e)
  }

  const groups: TierGroup[] = []
  for (const [role, list] of byRole.entries()) {
    list.sort((a, b) => tierSortValue(b, mode) - tierSortValue(a, mode))
    const n = list.length
    const sCount = Math.max(1, Math.ceil(n * 0.1))
    const aCount = Math.ceil(n * 0.2)
    const bCount = Math.ceil(n * 0.3)

    const tiers: Record<TierBucket, SustainedDpsEntry[]> = {
      S: list.slice(0, sCount),
      A: list.slice(sCount, sCount + aCount),
      B: list.slice(sCount + aCount, sCount + aCount + bCount),
      C: list.slice(sCount + aCount + bCount),
    }
    groups.push({ role, tiers })
  }

  groups.sort((a, b) => {
    const aIdx = ROLE_ORDER_INDEX.get(a.role)
    const bIdx = ROLE_ORDER_INDEX.get(b.role)
    if (aIdx != null && bIdx != null) return aIdx - bIdx
    if (aIdx != null) return -1
    if (bIdx != null) return 1
    return a.role.localeCompare(b.role)
  })
  return groups
}

