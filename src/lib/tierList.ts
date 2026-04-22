export const TIER_LIST_CACHE_KEY = 'odysseyCalc.tierList.v1'

export type TierBucket = 'S' | 'A' | 'B' | 'C'

export type SustainedDpsEntry = {
  id: string
  name: string
  role: string
  stage: string
  dps: number
  checkedAt: string
}

export type TierListCache = {
  version: 2
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

export function loadTierListCache(): TierListCache | null {
  try {
    const raw = localStorage.getItem(TIER_LIST_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as
      | TierListCache
      | (Omit<TierListCache, 'version' | 'listSignatures'> & { version: 1 })
    if (!parsed) return null
    if (parsed.version === 2) return parsed
    if (parsed.version === 1) {
      return {
        ...parsed,
        version: 2,
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
    version: 2,
    total: ids.length,
    queue: [...ids],
    entries: {},
    listSignatures: {},
  }
}

export function buildTierGroups(entriesMap: Record<string, SustainedDpsEntry>) {
  const byRole = new Map<string, SustainedDpsEntry[]>()
  for (const e of Object.values(entriesMap)) {
    const role = e.role || 'Unknown'
    if (!byRole.has(role)) byRole.set(role, [])
    byRole.get(role)!.push(e)
  }

  const groups: TierGroup[] = []
  for (const [role, list] of byRole.entries()) {
    list.sort((a, b) => b.dps - a.dps)
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
    const aTotal = Object.values(a.tiers).reduce((sum, arr) => sum + arr.length, 0)
    const bTotal = Object.values(b.tiers).reduce((sum, arr) => sum + arr.length, 0)
    return bTotal - aTotal
  })
  return groups
}

