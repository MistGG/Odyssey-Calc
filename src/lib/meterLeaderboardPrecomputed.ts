import { getMeterAnonSupabase } from './meterDataSource'
import {
  buildEntriesFromParseSummaries,
  fetchScopeParseSummaries,
  mergeSummaryEntriesIntoAggregates,
} from './meterLeaderboardSummary'
import { collapseCoUploadedParseRows } from './meterCoUploadMerge'
import { buildLeaderboardHistoryFromPublicParses } from './meterParsePartyHistory'
import { fetchScopeEligibleParses } from './meterDataSource'
import {
  applyOfficialNamesToMeterAggregates,
  applyOfficialNamesToPlayerRankEntries,
} from './meterParseDigimonNames'
import {
  fetchDigimonRoleMap,
  METER_ROLE_BUCKETS,
  type MeterRoleBucket,
} from './meterRoleBuckets'
import type { DigimonBarEntry, MeterPublicAggregates, PlayerRankEntry } from './meterPublicStats'

export type PrecomputedLeaderboardParams = {
  dungeonId: string
  difficultyId: number
  limitPerRole?: number
  windowStart?: string | null
  windowEnd?: string | null
}

type PlayerRow = {
  role_bucket: string
  player_key: string
  display_name: string
  dps: number
  digimon_id: string
  digimon_name: string
  icon_id: string | null
  portrait_url: string | null
}

type DigimonRow = {
  role_bucket: string
  digimon_id: string
  digimon_name: string
  icon_id: string | null
  portrait_url: string | null
  dps: number
}

function emptyBucketRecord<T>(): Record<MeterRoleBucket, T> {
  return {
    melee: [] as T,
    ranged: [] as T,
    caster: [] as T,
    hybrid: [] as T,
    tank: [] as T,
    healer: [] as T,
  }
}

function isRoleBucket(value: string): value is MeterRoleBucket {
  return (METER_ROLE_BUCKETS as readonly string[]).includes(value)
}

function mapPlayerRow(row: PlayerRow): PlayerRankEntry {
  return {
    playerKey: row.player_key,
    displayName: row.display_name || row.player_key,
    dps: Number(row.dps) || 0,
    digimonId: row.digimon_id ?? '',
    digimonName: row.digimon_name ?? '',
    iconId: row.icon_id,
    portraitUrl: row.portrait_url ?? undefined,
  }
}

function mapDigimonRow(row: DigimonRow): DigimonBarEntry {
  return {
    digimonId: row.digimon_id,
    digimonName: row.digimon_name,
    iconId: row.icon_id,
    portraitUrl: row.portrait_url ?? undefined,
    dps: Number(row.dps) || 0,
  }
}

export async function fetchPrecomputedMeterLeaderboard(
  params: PrecomputedLeaderboardParams,
): Promise<{ stats: MeterPublicAggregates | null; error: string | null }> {
  const supabase = getMeterAnonSupabase()
  if (!supabase) return { stats: null, error: 'Supabase is not configured.' }

  const dungeonId = params.dungeonId.trim()
  const difficultyId = params.difficultyId
  if (!dungeonId || difficultyId < 2) {
    return { stats: null, error: 'Select a dungeon and difficulty.' }
  }

  const rpcArgs = {
    p_dungeon_id: dungeonId,
    p_difficulty_id: difficultyId,
    p_limit_per_role: params.limitPerRole ?? 100,
    p_window_start: params.windowStart ?? null,
    p_window_end: params.windowEnd ?? null,
  }

  const [playersRes, digimonBestRes, digimonAvgRes] = await Promise.all([
    supabase.rpc('get_meter_player_leaderboard', rpcArgs),
    supabase.rpc('get_meter_digimon_leaderboard', {
      ...rpcArgs,
      p_mode: 'best',
      p_limit_per_role: 10,
    }),
    supabase.rpc('get_meter_digimon_leaderboard', {
      ...rpcArgs,
      p_mode: 'average',
      p_limit_per_role: 10,
    }),
  ])

  const firstError = playersRes.error ?? digimonBestRes.error ?? digimonAvgRes.error
  if (firstError) return { stats: null, error: firstError.message }

  const players = (playersRes.data ?? []) as PlayerRow[]
  if (!players.length) return { stats: null, error: null }

  const playersByBucket = emptyBucketRecord<PlayerRankEntry[]>()
  const sortedDpsByBucket = emptyBucketRecord<number[]>()

  for (const bucket of METER_ROLE_BUCKETS) {
    const entries = players
      .filter((row) => row.role_bucket === bucket)
      .map(mapPlayerRow)
      .sort((a, b) => b.dps - a.dps)
    playersByBucket[bucket] = entries
    sortedDpsByBucket[bucket] = entries.map((e) => e.dps).sort((a, b) => a - b)
  }

  const digimonByBucketBest = emptyBucketRecord<DigimonBarEntry[]>()
  const digimonByBucketAverage = emptyBucketRecord<DigimonBarEntry[]>()

  for (const row of (digimonBestRes.data ?? []) as DigimonRow[]) {
    if (!isRoleBucket(row.role_bucket)) continue
    digimonByBucketBest[row.role_bucket].push(mapDigimonRow(row))
  }
  for (const row of (digimonAvgRes.data ?? []) as DigimonRow[]) {
    if (!isRoleBucket(row.role_bucket)) continue
    digimonByBucketAverage[row.role_bucket].push(mapDigimonRow(row))
  }

  for (const bucket of METER_ROLE_BUCKETS) {
    digimonByBucketBest[bucket].sort((a, b) => b.dps - a.dps)
    digimonByBucketAverage[bucket].sort((a, b) => b.dps - a.dps)
  }

  let stats: MeterPublicAggregates = {
    playersByBucket,
    sortedDpsByBucket,
    digimonByBucketBest,
    digimonByBucketAverage,
  }

  try {
    const [summaries, roleMap, parseRes] = await Promise.all([
      fetchScopeParseSummaries(dungeonId, difficultyId),
      fetchDigimonRoleMap(),
      fetchScopeEligibleParses({ dungeonId, difficultyId }),
    ])
    const supplemental = buildEntriesFromParseSummaries(summaries, roleMap)
    if (supplemental.length) {
      stats = mergeSummaryEntriesIntoAggregates(stats, supplemental)
    }
    if (!parseRes.error && parseRes.rows.length) {
      const collapsed = collapseCoUploadedParseRows(parseRes.rows)
      const fromParses = buildLeaderboardHistoryFromPublicParses(
        collapsed,
        roleMap,
        dungeonId,
        difficultyId,
      )
      if (fromParses.length) {
        stats = mergeSummaryEntriesIntoAggregates(
          stats,
          fromParses,
        )
      }
    }
  } catch {
    /* keep RPC-only stats */
  }

  return { stats, error: null }
}

/** Wiki species names — run after showing precomputed stats (non-blocking for UI). */
export async function resolvePrecomputedLeaderboardNames(
  stats: MeterPublicAggregates,
): Promise<MeterPublicAggregates> {
  try {
    return await Promise.race([
      applyOfficialNamesToMeterAggregates(stats),
      new Promise<MeterPublicAggregates>((resolve) => {
        window.setTimeout(() => resolve(stats), 12_000)
      }),
    ])
  } catch {
    return stats
  }
}

export type ParticipationPoolEntry = PlayerRankEntry & { roleBucket: MeterRoleBucket }

export async function fetchParticipationPlayersInWindow(
  params: PrecomputedLeaderboardParams,
): Promise<{ entries: ParticipationPoolEntry[]; error: string | null }> {
  const supabase = getMeterAnonSupabase()
  if (!supabase) return { entries: [], error: 'Supabase is not configured.' }
  if (!params.windowStart || !params.windowEnd) return { entries: [], error: null }

  const { data, error } = await supabase
    .from('meter_leaderboard_entries')
    .select(
      'role_bucket, player_key, display_name, dps, digimon_id, digimon_name, icon_id, portrait_url',
    )
    .eq('dungeon_id', params.dungeonId.trim())
    .eq('difficulty_id', params.difficultyId)
    .gte('created_at', params.windowStart)
    .lt('created_at', params.windowEnd)

  if (error) return { entries: [], error: error.message }

  const entries = ((data ?? []) as PlayerRow[])
    .filter((row): row is PlayerRow & { role_bucket: MeterRoleBucket } => isRoleBucket(row.role_bucket))
    .map((row) => ({
      ...mapPlayerRow(row),
      roleBucket: row.role_bucket,
    }))
  const resolved = await applyOfficialNamesToPlayerRankEntries(entries).catch(() => entries)
  return {
    entries: resolved.map((entry, i) => ({
      ...entry,
      roleBucket: entries[i]!.roleBucket,
    })),
    error: null,
  }
}
