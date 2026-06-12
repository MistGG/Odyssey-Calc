import { getMeterAnonSupabase } from './meterDataSource'
import { fetchPrecomputedMeterLeaderboard } from './meterLeaderboardPrecomputed'
import { applyOfficialNamesToPlayerRankEntries } from './meterParseDigimonNames'
import { dpsToPercentile } from './meterParseScoreColor'
import type { PlayerRankEntry } from './meterPublicStats'
import {
  getCachedScopeHallOfFame,
  meterHofScopeKey,
  setCachedScopeHallOfFame,
} from './meterHallOfFameCache'
import { METER_ROLE_BUCKETS, METER_ROLE_BUCKET_LABELS, type MeterRoleBucket } from './meterRoleBuckets'
import { difficultySelectOptions, dungeonSelectOptions } from './wikiDungeons'
import type { WikiDungeonListItem } from '../types/wikiApi'

export type MeterHallOfFameEntry = PlayerRankEntry & {
  roleBucket: MeterRoleBucket
  roleLabel: string
  parseId: string
  achievedAt: string
  /** Parse percentile vs current all-time pool (may drop below 100 if beaten later). */
  currentPercentile: number
}

function isRoleBucket(value: string): value is MeterRoleBucket {
  return (METER_ROLE_BUCKETS as readonly string[]).includes(value)
}

function entryKey(entry: Pick<MeterHallOfFameEntry, 'parseId' | 'playerKey' | 'achievedAt' | 'roleBucket'>) {
  return `${entry.roleBucket}:${entry.parseId}:${entry.playerKey}:${entry.achievedAt}`
}

type HofHistoryRow = Omit<MeterHallOfFameEntry, 'currentPercentile'>

/** Per-role DPS pools for parse score when precomputed leaderboard RPC has no rows. */
export function sortedDpsPoolsFromHistory(
  rows: HofHistoryRow[],
): Record<MeterRoleBucket, number[]> {
  const pools = METER_ROLE_BUCKETS.reduce(
    (acc, role) => {
      acc[role] = [] as number[]
      return acc
    },
    {} as Record<MeterRoleBucket, number[]>,
  )
  for (const row of rows) {
    if (row.dps > 0) pools[row.roleBucket].push(row.dps)
  }
  for (const role of METER_ROLE_BUCKETS) {
    pools[role].sort((a, b) => a - b)
  }
  return pools
}

/** Max gap between party uploads treated as the same clear (matches ingest dedupe window). */
export const PARTY_UPLOAD_CLUSTER_MS = 10_000

/** Min shared party members to merge parse uploads into one run cluster. */
export const PARTY_UPLOAD_MIN_PLAYER_OVERLAP = 2

type HofRow = Omit<MeterHallOfFameEntry, 'currentPercentile'>

function parsePlayers(rows: HofRow[], parseId: string): Set<string> {
  const players = new Set<string>()
  for (const row of rows) {
    if (row.parseId === parseId) players.add(row.playerKey.trim().toLowerCase())
  }
  return players
}

function playerOverlap(a: Set<string>, b: Set<string>): number {
  let n = 0
  for (const key of a) {
    if (b.has(key)) n += 1
  }
  return n
}

/**
 * When several tamers upload the same party clear, each upload becomes its own `meter_parses` row
 * milliseconds apart with slightly different DPS. Merge those into one logical run before HoF logic.
 */
export function dedupeCoalescedPartyUploads(rows: HofRow[]): HofRow[] {
  if (rows.length <= 1) return rows

  const byParse = new Map<string, HofRow[]>()
  for (const row of rows) {
    const list = byParse.get(row.parseId) ?? []
    list.push(row)
    byParse.set(row.parseId, list)
  }

  const parseIds = [...byParse.keys()].sort((a, b) => {
    const ta = new Date(byParse.get(a)![0]!.achievedAt).getTime()
    const tb = new Date(byParse.get(b)![0]!.achievedAt).getTime()
    return ta - tb
  })

  const parsePlayersCache = new Map<string, Set<string>>()
  const playersFor = (parseId: string) => {
    let set = parsePlayersCache.get(parseId)
    if (!set) {
      set = parsePlayers(rows, parseId)
      parsePlayersCache.set(parseId, set)
    }
    return set
  }

  const clusters: string[][] = []
  for (const parseId of parseIds) {
    const time = new Date(byParse.get(parseId)![0]!.achievedAt).getTime()
    const players = playersFor(parseId)

    let merged = false
    for (const cluster of clusters) {
      const anchorId = cluster[0]!
      const anchorTime = new Date(byParse.get(anchorId)![0]!.achievedAt).getTime()
      if (time - anchorTime > PARTY_UPLOAD_CLUSTER_MS) continue

      let maxOverlap = 0
      for (const otherId of cluster) {
        maxOverlap = Math.max(maxOverlap, playerOverlap(players, playersFor(otherId)))
      }
      if (maxOverlap >= PARTY_UPLOAD_MIN_PLAYER_OVERLAP) {
        cluster.push(parseId)
        merged = true
        break
      }
    }

    if (!merged) clusters.push([parseId])
  }

  const bestByPlayerRole = new Map<string, HofRow>()
  for (const cluster of clusters) {
    const parseSet = new Set(cluster)
    for (const row of rows) {
      if (!parseSet.has(row.parseId)) continue
      const roleKey = `${row.playerKey.trim().toLowerCase()}:${row.roleBucket}`
      const prev = bestByPlayerRole.get(roleKey)
      if (!prev || row.dps > prev.dps) bestByPlayerRole.set(roleKey, row)
    }
  }

  return [...bestByPlayerRole.values()].sort(
    (a, b) => new Date(a.achievedAt).getTime() - new Date(b.achievedAt).getTime(),
  )
}

/**
 * Hall of Fame entry = this parse strictly beat the prior role record for the dungeon+difficulty.
 * Ties at the same DPS do not add another row. Beating your own standing record in the same role
 * does not add another induction — only taking the record from someone else (or the first break) counts.
 */
export function filterGoldRecordBreaks(rows: HofRow[]): HofRow[] {
  const sorted = dedupeCoalescedPartyUploads(rows)
  const runningMax: Record<MeterRoleBucket, number> = {
    melee: 0,
    ranged: 0,
    caster: 0,
    hybrid: 0,
    tank: 0,
    healer: 0,
  }
  const recordHolder: Record<MeterRoleBucket, string | null> = {
    melee: null,
    ranged: null,
    caster: null,
    hybrid: null,
    tank: null,
    healer: null,
  }
  const gold: HofRow[] = []
  const seen = new Set<string>()

  for (const entry of sorted) {
    const max = runningMax[entry.roleBucket]
    if (entry.dps <= max) continue

    const playerKey = entry.playerKey.trim().toLowerCase()
    const holder = recordHolder[entry.roleBucket]
    if (holder && holder === playerKey) continue

    const key = entryKey(entry)
    if (seen.has(key)) continue
    seen.add(key)

    gold.push(entry)
    runningMax[entry.roleBucket] = entry.dps
    recordHolder[entry.roleBucket] = playerKey
  }

  gold.sort((a, b) => new Date(b.achievedAt).getTime() - new Date(a.achievedAt).getTime())
  return gold
}

export function goldParsesFromLeaderboardHistory(
  rows: HofRow[],
  currentPoolByRole: Record<MeterRoleBucket, number[]>,
): MeterHallOfFameEntry[] {
  return filterGoldRecordBreaks(rows).map((entry) => ({
    ...entry,
    currentPercentile: dpsToPercentile(entry.dps, currentPoolByRole[entry.roleBucket]),
  }))
}

type HofGoldRpcRow = {
  parse_id?: string | null
  created_at?: string
  role_bucket?: string | null
  player_key?: string | null
  display_name?: string | null
  dps?: number | null
  digimon_id?: string | null
  digimon_name?: string | null
  icon_id?: string | null
  portrait_url?: string | null
}

function mapHofGoldRpcRow(row: HofGoldRpcRow): Omit<MeterHallOfFameEntry, 'currentPercentile'> | null {
  const role = row.role_bucket?.trim() ?? ''
  if (!isRoleBucket(role)) return null
  const dps = Number(row.dps) || 0
  if (dps <= 0) return null
  const parseId = row.parse_id?.trim?.() ?? String(row.parse_id ?? '').trim()
  if (!parseId) return null
  const playerKey = row.player_key?.trim().toLowerCase() ?? ''
  if (!playerKey) return null
  return {
    roleBucket: role,
    roleLabel: METER_ROLE_BUCKET_LABELS[role],
    parseId,
    achievedAt: row.created_at ?? '',
    playerKey,
    displayName: row.display_name?.trim() || playerKey,
    dps,
    digimonId: row.digimon_id?.trim() ?? '',
    digimonName: row.digimon_name?.trim() ?? '',
    iconId: row.icon_id ?? null,
    portraitUrl: row.portrait_url ?? undefined,
  }
}

async function resolveHofGoldNames(
  rows: Omit<MeterHallOfFameEntry, 'currentPercentile'>[],
): Promise<Omit<MeterHallOfFameEntry, 'currentPercentile'>[]> {
  const forNames: PlayerRankEntry[] = rows.map((e) => ({
    playerKey: e.playerKey,
    displayName: e.displayName,
    dps: e.dps,
    digimonId: e.digimonId,
    digimonName: e.digimonName,
    iconId: e.iconId,
    portraitUrl: e.portraitUrl,
  }))
  const resolved = await applyOfficialNamesToPlayerRankEntries(forNames).catch(() => forNames)
  return rows.map((entry, i) => ({
    ...entry,
    displayName: resolved[i]!.displayName,
    digimonName: resolved[i]!.digimonName,
    iconId: resolved[i]!.iconId,
    portraitUrl: resolved[i]!.portraitUrl,
  }))
}

/** Hall of Fame gold entries for one scope via server-side RPC (no full-table client scan). */
export async function fetchScopeHallOfFameGoldEntries(
  dungeonId: string,
  difficultyId: number,
): Promise<{ entries: MeterHallOfFameEntry[]; error: string | null }> {
  const id = dungeonId.trim()
  if (!id || difficultyId < 2) return { entries: [], error: 'Select a dungeon and difficulty.' }

  const cacheKey = meterHofScopeKey(id, difficultyId)
  const cached = getCachedScopeHallOfFame(cacheKey)
  if (cached) return { entries: cached, error: null }

  const supabase = getMeterAnonSupabase()
  if (!supabase) return { entries: [], error: 'Supabase is not configured.' }

  const [rpcRes, pre] = await Promise.all([
    supabase.rpc('get_meter_hof_gold_breaks', {
      p_dungeon_id: id,
      p_difficulty_id: difficultyId,
    }),
    fetchPrecomputedMeterLeaderboard({ dungeonId: id, difficultyId }),
  ])

  if (rpcRes.error) {
    return { entries: [], error: rpcRes.error.message }
  }

  const rpcRows = (rpcRes.data ?? []) as HofGoldRpcRow[]
  let rows = filterGoldRecordBreaks(
    rpcRows
      .map((row) => mapHofGoldRpcRow(row))
      .filter((row): row is Omit<MeterHallOfFameEntry, 'currentPercentile'> => row != null),
  )
  rows = await resolveHofGoldNames(rows)

  const poolByRole: Record<MeterRoleBucket, number[]> =
    pre.stats?.sortedDpsByBucket ??
    (rows.length ? sortedDpsPoolsFromHistory(rows) : {
      melee: [],
      ranged: [],
      caster: [],
      hybrid: [],
      tank: [],
      healer: [],
    })

  const entries: MeterHallOfFameEntry[] = rows.map((entry) => ({
    ...entry,
    currentPercentile: dpsToPercentile(entry.dps, poolByRole[entry.roleBucket]),
  }))

  setCachedScopeHallOfFame(cacheKey, entries)
  return { entries, error: null }
}

export type HallOfFameInductee = MeterHallOfFameEntry & { induction: number }

export function withInductionRanks(entries: MeterHallOfFameEntry[]): HallOfFameInductee[] {
  const rankByKey = new Map<string, number>()
  for (const role of METER_ROLE_BUCKETS) {
    const chronological = entries
      .filter((e) => e.roleBucket === role)
      .sort((a, b) => new Date(a.achievedAt).getTime() - new Date(b.achievedAt).getTime())
    chronological.forEach((e, i) => {
      rankByKey.set(entryKey(e), i + 1)
    })
  }
  return [...entries]
    .sort((a, b) => new Date(b.achievedAt).getTime() - new Date(a.achievedAt).getTime())
    .map((e) => ({
      ...e,
      induction: rankByKey.get(entryKey(e)) ?? 0,
    }))
}

export type ProfileHallOfFameEntry = HallOfFameInductee & {
  dungeonId: string
  difficultyId: number
  dungeonName: string
  difficultyLabel: string
}

function resolveScopeLabels(
  dungeonId: string,
  difficultyId: number,
  wikiDungeons: WikiDungeonListItem[],
): { dungeonName: string; difficultyLabel: string } {
  const dungeonName =
    dungeonSelectOptions(wikiDungeons).find((d) => d.dungeonId === dungeonId)?.dungeonName ?? dungeonId
  const difficultyLabel =
    difficultySelectOptions(wikiDungeons, dungeonId).find((d) => d.difficultyId === difficultyId)?.label ?? ''
  return { dungeonName, difficultyLabel }
}

async function fetchPlayerMeterScopes(
  playerKey: string,
  limit = 24,
): Promise<Array<{ dungeonId: string; difficultyId: number; lastAt: number }>> {
  const supabase = getMeterAnonSupabase()
  if (!supabase) return []

  const key = playerKey.trim().toLowerCase()
  const { data, error } = await supabase.rpc('get_meter_player_scopes', {
    p_player_key: key,
    p_limit: limit,
  })

  if (!error && data?.length) {
    return (data as Array<{ dungeon_id?: string; difficulty_id?: number; last_at?: string }>)
      .map((row) => {
        const dungeonId = row.dungeon_id?.trim() ?? ''
        const difficultyId = row.difficulty_id ?? 0
        if (!dungeonId || difficultyId < 2) return null
        return {
          dungeonId,
          difficultyId,
          lastAt: new Date(row.last_at ?? 0).getTime(),
        }
      })
      .filter((row): row is { dungeonId: string; difficultyId: number; lastAt: number } => row != null)
  }

  return []
}

const HOF_SCOPE_BATCH = 4

type ScopeRef = { dungeonId: string; difficultyId: number }

function profileEntriesFromGoldScope(
  scopeEntries: MeterHallOfFameEntry[],
  scope: ScopeRef,
  wikiDungeons: WikiDungeonListItem[],
  playerKey: string,
): ProfileHallOfFameEntry[] {
  const labels = resolveScopeLabels(scope.dungeonId, scope.difficultyId, wikiDungeons)
  return withInductionRanks(scopeEntries)
    .filter((e) => e.playerKey.trim().toLowerCase() === playerKey)
    .map((e) => ({
      ...e,
      dungeonId: scope.dungeonId,
      difficultyId: scope.difficultyId,
      ...labels,
    }))
}

async function fetchPlayerHallOfFameByScopeBatches(
  playerKey: string,
  wikiDungeons: WikiDungeonListItem[],
  options?: FetchPlayerHallOfFameOptions,
): Promise<{ entries: ProfileHallOfFameEntry[]; error: string | null }> {
  let scopes = await fetchPlayerMeterScopes(playerKey, options?.maxScopes ?? 24)
  if (!scopes.length) return { entries: [], error: null }

  const maxScopes = options?.maxScopes
  if (maxScopes != null && maxScopes > 0) scopes = scopes.slice(0, maxScopes)

  const all: ProfileHallOfFameEntry[] = []

  for (let i = 0; i < scopes.length; i += HOF_SCOPE_BATCH) {
    const batch = scopes.slice(i, i + HOF_SCOPE_BATCH)
    const batchResults = await Promise.all(
      batch.map(async (scope) => {
        const goldRes = await fetchScopeHallOfFameGoldEntries(scope.dungeonId, scope.difficultyId)
        if (goldRes.error) return { entries: [] as ProfileHallOfFameEntry[], error: goldRes.error }

        return {
          entries: profileEntriesFromGoldScope(goldRes.entries, scope, wikiDungeons, playerKey),
          error: null as string | null,
        }
      }),
    )

    for (const result of batchResults) {
      if (result.error) return { entries: all, error: result.error }
      all.push(...result.entries)
      if (options?.stopAfterFirst && all.length > 0) {
        return { entries: all, error: null }
      }
    }
  }

  all.sort((a, b) => new Date(b.achievedAt).getTime() - new Date(a.achievedAt).getTime())
  return { entries: all, error: null }
}

export type FetchPlayerHallOfFameOptions = {
  /** Cap dungeon scopes scanned (grant checks use a small limit). */
  maxScopes?: number
  /** Stop after first matching induction (faster eligibility checks). */
  stopAfterFirst?: boolean
}

/** All Hall of Fame record-break entries for one tamer (across dungeons). */
export async function fetchPlayerHallOfFameEntries(
  playerKey: string,
  wikiDungeons: WikiDungeonListItem[],
  options?: FetchPlayerHallOfFameOptions,
): Promise<{ entries: ProfileHallOfFameEntry[]; error: string | null }> {
  const key = playerKey.trim().toLowerCase()
  if (!key) return { entries: [], error: null }

  // Scope batches use fetchScopeHallOfFameGoldEntries, which applies filterGoldRecordBreaks
  // so self-record improvements in the same role do not inflate induction counts.
  return fetchPlayerHallOfFameByScopeBatches(key, wikiDungeons, options)
}
