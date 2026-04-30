import type { DigimonContentStatus } from './contentStatus'
import { TIER_DPS_SIM_REVISION } from './dpsSim'

export const TIER_LIST_CACHE_KEY = 'odysseyCalc.tierList.v1'

/** Re-fetch detail (skills + stats) after this long even if the index row is unchanged. */
export const TIER_ENTRY_STALE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Bump when tank/healer tier scoring or support-effect parsing used by those scores changes
 * (e.g. HoT labels, tick intervals, new effect buckets). Entries with a mismatch are re-queued on
 * incremental tier list update so cached tank/healer scores are not stuck on an old algorithm.
 */
export const TIER_SUPPORT_SCORE_REVISION = 8

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

/** Rotation DPS sub-tabs (wiki role columns): sustained / burst. */
export type DpsRotationCategoryScores = {
  sustained: number
  burst: number
  /** Auto-attack DPS share for sustained window (attribute target adjusts skill portion only). */
  sustainedAutoDps?: number
  burstAutoDps?: number
}

export type DpsRotationCategoryKey = keyof DpsRotationCategoryScores

/** AoE matrix columns when the DPS sub-tab “AoE” is selected (wiki `radius` skills). */
export type AoeTierCategoryScores = {
  general: number
  damage: number
  cooldown: number
  farming: number
}

export type AoeTierCategoryKey = keyof AoeTierCategoryScores

/** DPS sub-tab: rotation lenses, or `aoe` for the four-column AoE matrix. */
export type DpsTierCategoryKey = DpsRotationCategoryKey | 'aoe'

export type TierApiSkillSnapshot = {
  id: string
  name: string
  base_dmg: number
  scaling: number
  cast_time_sec: number
  cooldown_sec: number
  ds_cost: number
  radius?: number
  description?: string
  buff_name?: string
  buff_description?: string
  buff_duration?: number
}

export type TierApiSnapshot = {
  id: string
  name: string
  role: string
  attribute: string
  element: string
  rank: number
  hp: number
  attack: number
  stats: {
    hp: number
    ds: number
    attack: number
    defense: number
    crit_rate: number
    atk_speed: number
    evasion: number
    hit_rate: number
    block_rate: number
    dex: number
    int: number
  }
  skills: TierApiSkillSnapshot[]
}

export type SustainedDpsEntry = {
  id: string
  name: string
  role: string
  stage: string
  dps: number
  /** Sustained / burst (`sustained` matches `dps`). */
  dpsCategoryScores?: DpsRotationCategoryScores
  /** Same DPS lenses with forced auto-crit scenario (skills still cannot crit). */
  dpsCategoryScoresAutoCrit?: DpsRotationCategoryScores
  /** Same DPS lenses with Perfect AT clone formula enabled for skills. */
  dpsCategoryScoresPerfectAtClone?: DpsRotationCategoryScores
  /** Same DPS lenses with both Perfect AT clone and forced auto-crit enabled. */
  dpsCategoryScoresPerfectAtCloneAutoCrit?: DpsRotationCategoryScores
  /** Same DPS lenses with auto-attack animation cancel enabled. */
  dpsCategoryScoresAnimationCancel?: DpsRotationCategoryScores
  /** Same DPS lenses with auto-attack animation cancel + forced auto-crit enabled. */
  dpsCategoryScoresAnimationCancelAutoCrit?: DpsRotationCategoryScores
  /** Same DPS lenses with Perfect AT clone + auto-attack animation cancel enabled. */
  dpsCategoryScoresPerfectAtCloneAnimationCancel?: DpsRotationCategoryScores
  /** Same DPS lenses with Perfect AT clone + auto-attack animation cancel + forced auto-crit enabled. */
  dpsCategoryScoresPerfectAtCloneAnimationCancelAutoCrit?: DpsRotationCategoryScores
  /** AoE kit heuristics (see `computeDpsAoeCategoryScores`); used only for the AoE matrix. */
  aoeCategoryScores?: AoeTierCategoryScores
  /** Heuristic tank index from stats + parsed mitigation (see tankTierScore); equals categoryScores.overall. */
  tankScore?: number
  /** Heuristic support/healer index (see healerTierScore); equals categoryScores.general. */
  healerScore?: number
  /** Per–sub-mode tank ranks (refresh tier list after scoring changes). */
  tankCategoryScores?: TankTierCategoryScores
  healerCategoryScores?: HealerTierCategoryScores
  /** Wiki base + uptime-weighted buffs for tank matrix cells (HP / def / eva / block). */
  tankEffectiveDisplay?: {
    hp: number
    defense: number
    evasion: number
    block: number
  }
  /** Human-readable healer matrix cells (HPS, buff %-uptime sum, INT). */
  healerDisplayMetrics?: {
    healHps: number
    shieldHps: number
    buffPctEquiv: number
    intTotal: number
  }
  status?: DigimonContentStatus
  checkedAt: string
  /** Fingerprint of skill stats last time detail was fetched (see tierSkillsSignature). */
  skillsSignature?: string
  /** Last detail fetch used this revision of tank/healer scoring + support parsing (see TIER_SUPPORT_SCORE_REVISION). */
  supportScoreRevision?: number
  /** Last DPS row used this revision of `simulateRotation` (see `TIER_DPS_SIM_REVISION` in dpsSim). */
  dpsSimRevision?: number
  /** Compact API snapshot used to show field-level wiki changes on the Changes page. */
  apiSnapshot?: TierApiSnapshot
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
  /** Column header (DPS rotation = wiki role; DPS AoE / tank / healer = category label). */
  role: string
  tiers: Record<TierBucket, SustainedDpsEntry[]>
  /** When set, matrix shows this tank category score in the column. */
  tankSortKey?: TankTierCategoryKey
  /** When set, matrix shows this healer category score in the column. */
  healerSortKey?: HealerTierCategoryKey
  /** When set (DPS AoE matrix), matrix shows this AoE score in the column. */
  aoeSortKey?: AoeTierCategoryKey
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
  general: 'Overall',
  healing: 'Healing (HPS)',
  shielding: 'Shielding (SPS)',
  buffing: 'Buffing (uptime sum)',
  int: 'INT',
}

/** DPS header sub-tabs (first row): sustained, burst, AoE. Selecting `aoe` switches the matrix to AoE columns. */
export const DPS_TIER_CATEGORY_ORDER: readonly DpsTierCategoryKey[] = ['sustained', 'burst', 'aoe']

export const DPS_TIER_MATRIX_COLUMN_LABELS: Record<DpsTierCategoryKey, string> = {
  sustained: 'Sustained DPS',
  burst: 'Burst DPS (10s)',
  aoe: 'AoE',
}

export const AOE_TIER_CATEGORY_ORDER: readonly AoeTierCategoryKey[] = [
  'general',
  'damage',
  'cooldown',
  'farming',
]

export const AOE_TIER_MATRIX_COLUMN_LABELS: Record<AoeTierCategoryKey, string> = {
  general: 'General',
  damage: 'Damage',
  cooldown: 'Cooldown',
  farming: 'Farming',
}

function migrateEntryDpsAoeShape(entry: SustainedDpsEntry): SustainedDpsEntry {
  const raw = entry.dpsCategoryScores as unknown
  if (!raw || typeof raw !== 'object' || entry.aoeCategoryScores) return entry
  const d = raw as Record<string, number>
  if (typeof d.aoe_general !== 'number') return entry
  return {
    ...entry,
    dpsCategoryScores: {
      sustained: typeof d.sustained === 'number' ? d.sustained : entry.dps,
      burst: typeof d.burst === 'number' ? d.burst : entry.dps,
    },
    aoeCategoryScores:
      typeof d.aoe_farming === 'number'
        ? {
            general: d.aoe_general,
            damage: d.aoe_damage,
            cooldown: d.aoe_cooldown,
            farming: d.aoe_farming,
          }
        : undefined,
  }
}

/** Old caches stored a fourth AoE key `radius`; farming uses a new formula; clear so users refresh tier list. */
function migrateLegacyAoeRadiusToFarming(entry: SustainedDpsEntry): SustainedDpsEntry {
  const a = entry.aoeCategoryScores as (AoeTierCategoryScores & { radius?: number }) | undefined
  if (!a) return entry
  if (typeof a.farming === 'number' && Number.isFinite(a.farming)) return entry
  if ('radius' in a) {
    return { ...entry, aoeCategoryScores: undefined }
  }
  return entry
}

/** True when rotation + AoE scores are present (prompt tier list refresh if false). */
export function tierEntryNeedsDpsSimRefresh(entry: SustainedDpsEntry): boolean {
  return (entry.dpsSimRevision ?? 0) !== TIER_DPS_SIM_REVISION
}

export function tierEntryNeedsAutoCritScores(entry: SustainedDpsEntry): boolean {
  const s = entry.dpsCategoryScoresAutoCrit
  return !s || !Number.isFinite(s.sustained) || !Number.isFinite(s.burst)
}

export function tierEntryNeedsPerfectAtCloneScores(entry: SustainedDpsEntry): boolean {
  const p = entry.dpsCategoryScoresPerfectAtClone
  const pa = entry.dpsCategoryScoresPerfectAtCloneAutoCrit
  const valid = (s?: DpsRotationCategoryScores) =>
    !!s && Number.isFinite(s.sustained) && Number.isFinite(s.burst)
  return !valid(p) || !valid(pa)
}

export function tierEntryNeedsAnimationCancelScores(entry: SustainedDpsEntry): boolean {
  const a = entry.dpsCategoryScoresAnimationCancel
  const aa = entry.dpsCategoryScoresAnimationCancelAutoCrit
  const ap = entry.dpsCategoryScoresPerfectAtCloneAnimationCancel
  const apa = entry.dpsCategoryScoresPerfectAtCloneAnimationCancelAutoCrit
  const valid = (s?: DpsRotationCategoryScores) =>
    !!s && Number.isFinite(s.sustained) && Number.isFinite(s.burst)
  return !valid(a) || !valid(aa) || !valid(ap) || !valid(apa)
}

export function tierEntryDpsCategoryScoresComplete(entry: SustainedDpsEntry): boolean {
  const d = entry.dpsCategoryScores
  const a = entry.aoeCategoryScores
  if (!d || !a) return false
  for (const k of ['sustained', 'burst'] as const) {
    const v = d[k]
    if (typeof v !== 'number' || !Number.isFinite(v)) return false
  }
  for (const k of AOE_TIER_CATEGORY_ORDER) {
    const v = a[k]
    if (typeof v !== 'number' || !Number.isFinite(v)) return false
  }
  return true
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
    if (parsed.version === 3) {
      const entries: Record<string, SustainedDpsEntry> = {}
      for (const [id, e] of Object.entries(parsed.entries)) {
        entries[id] = migrateLegacyAoeRadiusToFarming(migrateEntryDpsAoeShape(e))
      }
      return { ...parsed, entries }
    }
    if (parsed.version === 2) {
      const entries: Record<string, SustainedDpsEntry> = {}
      for (const [id, e] of Object.entries(parsed.entries ?? {})) {
        entries[id] = migrateLegacyAoeRadiusToFarming(migrateEntryDpsAoeShape(e as SustainedDpsEntry))
      }
      return { ...parsed, version: 3, entries }
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

function dpsRotationSortValue(entry: SustainedDpsEntry, key: DpsRotationCategoryKey): number {
  const s = entry.dpsCategoryScores
  if (s && key in s) return s[key]
  if (key === 'sustained') return entry.dps ?? -1
  return -1
}

function aoeCategorySortValue(entry: SustainedDpsEntry, key: AoeTierCategoryKey): number {
  return entry.aoeCategoryScores?.[key] ?? -1
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
    const lens: DpsTierCategoryKey = options?.dpsCategory ?? 'sustained'

    if (lens === 'aoe') {
      const pool = Object.values(entriesMap)
      const groups: TierGroup[] = []
      for (const key of AOE_TIER_CATEGORY_ORDER) {
        const list = [...pool].sort(
          (a, b) => aoeCategorySortValue(b, key) - aoeCategorySortValue(a, key),
        )
        groups.push({
          role: AOE_TIER_MATRIX_COLUMN_LABELS[key],
          tiers: assignTierBuckets(list),
          aoeSortKey: key,
        })
      }
      return groups
    }

    const rotLens = lens
    const byRole = new Map<string, SustainedDpsEntry[]>()
    for (const e of Object.values(entriesMap)) {
      const role = e.role || 'Unknown'
      if (!byRole.has(role)) byRole.set(role, [])
      byRole.get(role)!.push(e)
    }

    const groups: TierGroup[] = []
    for (const [role, list] of byRole.entries()) {
      list.sort(
        (a, b) => dpsRotationSortValue(b, rotLens) - dpsRotationSortValue(a, rotLens),
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

