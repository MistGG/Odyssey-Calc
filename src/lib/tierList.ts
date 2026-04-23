import type { DigimonContentStatus } from './contentStatus'

export const TIER_LIST_CACHE_KEY = 'odysseyCalc.tierList.v1'

/** Re-fetch detail (skills + stats) after this long even if the index row is unchanged. */
export const TIER_ENTRY_STALE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Bump when tank/healer tier scoring or support-effect parsing used by those scores changes
 * (e.g. HoT labels, tick intervals, new effect buckets). Entries with a mismatch are re-queued on
 * incremental tier list update so cached tank/healer scores are not stuck on an old algorithm.
 */
export const TIER_SUPPORT_SCORE_REVISION = 3

export function tierEntryIsStaleForDetailFetch(
  entry: SustainedDpsEntry | undefined,
  nowMs = Date.now(),
): boolean {
  if (!entry?.checkedAt) return true
  return nowMs - new Date(entry.checkedAt).getTime() > TIER_ENTRY_STALE_MS
}

export type TierBucket = 'S' | 'A' | 'B' | 'C'

export type TierListMode = 'dps' | 'tank' | 'healer'

/** Tank tier matrix sub-mode sort keys (see `computeTankTierScore` categoryScores). */
export type TankTierCategoryScores = {
  overall: number
  hp: number
  defense: number
  evasion: number
  block: number
}

export type TankTierCategoryKey = keyof TankTierCategoryScores

/** Healer tier matrix sub-mode sort keys (see `computeHealerTierScore` categoryScores). */
export type HealerTierCategoryScores = {
  general: number
  healing: number
  shielding: number
  buffing: number
  int: number
}

export type HealerTierCategoryKey = keyof HealerTierCategoryScores

/** DPS tier matrix columns (see `simulateRotation` + specialized heuristic). */
export type DpsTierCategoryScores = {
  sustained: number
  burst: number
  specialized: number
}

export type DpsTierCategoryKey = keyof DpsTierCategoryScores

export type SustainedDpsEntry = {
  id: string
  name: string
  role: string
  stage: string
  dps: number
  /** Burst / sustained / specialized sort keys for the DPS tier matrix (`sustained` matches `dps`). */
  dpsCategoryScores?: DpsTierCategoryScores
  /** Heuristic tank index from stats + parsed mitigation (see tankTierScore); equals categoryScores.overall. */
  tankScore?: number
  /** Heuristic support/healer index (see healerTierScore); equals categoryScores.general. */
  healerScore?: number
  /** Per–sub-mode tank ranks (refresh tier list after scoring changes). */
  tankCategoryScores?: TankTierCategoryScores
  healerCategoryScores?: HealerTierCategoryScores
  status?: DigimonContentStatus
  checkedAt: string
  /** Fingerprint of skill stats last time detail was fetched (see tierSkillsSignature). */
  skillsSignature?: string
  /** Last detail fetch used this revision of tank/healer scoring + support parsing (see TIER_SUPPORT_SCORE_REVISION). */
  supportScoreRevision?: number
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
  /** Column header (DPS = wiki role; tank/healer = category label). */
  role: string
  tiers: Record<TierBucket, SustainedDpsEntry[]>
  /** When set, matrix shows this tank category score in the column. */
  tankSortKey?: TankTierCategoryKey
  /** When set, matrix shows this healer category score in the column. */
  healerSortKey?: HealerTierCategoryKey
}

/** Optional sort/display lens for DPS tier list (`buildTierGroups(..., 'dps', opts)`). */
export type BuildTierGroupsOptions = {
  dpsCategory?: DpsTierCategoryKey
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

/** Column order for the tank tier matrix (left → right). */
export const TANK_TIER_CATEGORY_ORDER: readonly TankTierCategoryKey[] = [
  'overall',
  'hp',
  'defense',
  'evasion',
  'block',
]

export const TANK_TIER_MATRIX_COLUMN_LABELS: Record<TankTierCategoryKey, string> = {
  overall: 'Overall',
  hp: 'Effective HP',
  defense: 'Effective Defense',
  evasion: 'Effective Evasion',
  block: 'Effective Block',
}

/** Column order for the healer tier matrix. */
export const HEALER_TIER_CATEGORY_ORDER: readonly HealerTierCategoryKey[] = [
  'general',
  'healing',
  'shielding',
  'buffing',
  'int',
]

export const HEALER_TIER_MATRIX_COLUMN_LABELS: Record<HealerTierCategoryKey, string> = {
  general: 'General',
  healing: 'Healing',
  shielding: 'Shielding',
  buffing: 'Buffing',
  int: 'INT',
}

export const DPS_TIER_CATEGORY_ORDER: readonly DpsTierCategoryKey[] = ['sustained', 'burst', 'specialized']

export const DPS_TIER_MATRIX_COLUMN_LABELS: Record<DpsTierCategoryKey, string> = {
  sustained: 'Sustained DPS',
  burst: 'Burst DPS (10s)',
  specialized: 'Specialized',
}

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

function assignTierBuckets(list: SustainedDpsEntry[]): Record<TierBucket, SustainedDpsEntry[]> {
  const n = list.length
  const sCount = Math.max(1, Math.ceil(n * 0.1))
  const aCount = Math.ceil(n * 0.2)
  const bCount = Math.ceil(n * 0.3)
  return {
    S: list.slice(0, sCount),
    A: list.slice(sCount, sCount + aCount),
    B: list.slice(sCount + aCount, sCount + aCount + bCount),
    C: list.slice(sCount + aCount + bCount),
  }
}

function tankCategorySortValue(entry: SustainedDpsEntry, key: TankTierCategoryKey): number {
  return entry.tankCategoryScores?.[key] ?? entry.tankScore ?? -1
}

function healerCategorySortValue(entry: SustainedDpsEntry, key: HealerTierCategoryKey): number {
  return entry.healerCategoryScores?.[key] ?? entry.healerScore ?? -1
}

function dpsCategorySortValue(entry: SustainedDpsEntry, key: DpsTierCategoryKey): number {
  const s = entry.dpsCategoryScores
  if (s && key in s) return s[key]
  if (key === 'sustained') return entry.dps ?? -1
  return -1
}

export function buildTierGroups(
  entriesMap: Record<string, SustainedDpsEntry>,
  mode: TierListMode = 'dps',
  options?: BuildTierGroupsOptions,
) {
  if (mode === 'tank') {
    const pool: SustainedDpsEntry[] = []
    for (const e of Object.values(entriesMap)) {
      if ((e.role || '').trim() === 'Tank') pool.push(e)
    }
    const groups: TierGroup[] = []
    for (const key of TANK_TIER_CATEGORY_ORDER) {
      const list = [...pool].sort((a, b) => tankCategorySortValue(b, key) - tankCategorySortValue(a, key))
      groups.push({
        role: TANK_TIER_MATRIX_COLUMN_LABELS[key],
        tiers: assignTierBuckets(list),
        tankSortKey: key,
      })
    }
    return groups
  }

  if (mode === 'healer') {
    const pool: SustainedDpsEntry[] = []
    for (const e of Object.values(entriesMap)) {
      if ((e.role || '').trim() === 'Support') pool.push(e)
    }
    const groups: TierGroup[] = []
    for (const key of HEALER_TIER_CATEGORY_ORDER) {
      const list = [...pool].sort(
        (a, b) => healerCategorySortValue(b, key) - healerCategorySortValue(a, key),
      )
      groups.push({
        role: HEALER_TIER_MATRIX_COLUMN_LABELS[key],
        tiers: assignTierBuckets(list),
        healerSortKey: key,
      })
    }
    return groups
  }

  if (mode === 'dps') {
    const lens = options?.dpsCategory ?? 'sustained'
    const byRole = new Map<string, SustainedDpsEntry[]>()
    for (const e of Object.values(entriesMap)) {
      const role = e.role || 'Unknown'
      if (!byRole.has(role)) byRole.set(role, [])
      byRole.get(role)!.push(e)
    }

    const groups: TierGroup[] = []
    for (const [role, list] of byRole.entries()) {
      list.sort(
        (a, b) => dpsCategorySortValue(b, lens) - dpsCategorySortValue(a, lens),
      )
      groups.push({ role, tiers: assignTierBuckets(list) })
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

  return []
}

