import { getMeterAnonSupabase } from './meterDataSource'
import {
  getCachedLeaderboardStats,
  setCachedLeaderboardStats,
} from './meterLeaderboardStatsCache'
import {
  applyOfficialNamesToMeterAggregates,
  applyOfficialNamesToPlayerRankEntries,
} from './meterParseDigimonNames'
import { METER_ROLE_BUCKETS, type MeterRoleBucket } from './meterRoleBuckets'
import type { DigimonBarEntry, MeterPublicAggregates, PlayerRankEntry } from './meterPublicStats'

const precomputedInflight = new Map<
  string,
  Promise<{ stats: MeterPublicAggregates | null; error: string | null }>
>()

export type PrecomputedLeaderboardParams = {
  dungeonId: string
  difficultyId: number
  limitPerRole?: number
  windowStart?: string | null
  windowEnd?: string | null
  /** Cache/dedupe key per cycle (defaults to live). */
  leaderboardCycleId?: string
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

function precomputedScopeKey(dungeonId: string, difficultyId: number, leaderboardCycleId?: string): string {
  const cycle = leaderboardCycleId?.trim() || 'live'
  return `${dungeonId.trim()}:${difficultyId}:${cycle}`
}

export async function fetchPrecomputedMeterLeaderboard(
  params: PrecomputedLeaderboardParams,
): Promise<{ stats: MeterPublicAggregates | null; error: string | null }> {
  const dungeonId = params.dungeonId.trim()
  const difficultyId = params.difficultyId
  if (!dungeonId || difficultyId < 2) {
    return { stats: null, error: 'Select a dungeon and difficulty.' }
  }

  const leaderboardCycleId = params.leaderboardCycleId?.trim() || 'live'
  const cached = getCachedLeaderboardStats(dungeonId, difficultyId, leaderboardCycleId)
  if (cached) return { stats: cached, error: null }

  const inflightKey = precomputedScopeKey(dungeonId, difficultyId, leaderboardCycleId)
  const existing = precomputedInflight.get(inflightKey)
  if (existing) return existing

  const promise = fetchPrecomputedMeterLeaderboardUncached(params).finally(() => {
    precomputedInflight.delete(inflightKey)
  })
  precomputedInflight.set(inflightKey, promise)
  return promise
}

async function fetchPrecomputedMeterLeaderboardUncached(
  params: PrecomputedLeaderboardParams,
): Promise<{ stats: MeterPublicAggregates | null; error: string | null }> {
  const supabase = getMeterAnonSupabase()
  if (!supabase) return { stats: null, error: 'Supabase is not configured.' }

  const dungeonId = params.dungeonId.trim()
  const difficultyId = params.difficultyId

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
    stats = await Promise.race([
      applyOfficialNamesToMeterAggregates(stats),
      new Promise<MeterPublicAggregates>((resolve) => {
        window.setTimeout(() => resolve(stats), 4_000)
      }),
    ])
  } catch {
    /* keep RPC names */
  }

  setCachedLeaderboardStats(dungeonId, difficultyId, stats, params.leaderboardCycleId?.trim() || 'live')
  return { stats, error: null }
}

/** Replace stream nicknames with wiki species names from digimon_id. */
export async function resolvePrecomputedLeaderboardNames(
  stats: MeterPublicAggregates,
): Promise<MeterPublicAggregates> {
  try {
    return await applyOfficialNamesToMeterAggregates(stats)
  } catch {
    return stats
  }
}

export type ParticipationPoolEntry = PlayerRankEntry & {
  roleBucket: MeterRoleBucket
  parseId: string
  achievedAt: string
}

type ParticipationRow = PlayerRow & {
  parse_id?: string | null
  created_at?: string | null
}

export async function fetchParticipationPlayersInWindow(
  params: PrecomputedLeaderboardParams,
): Promise<{ entries: ParticipationPoolEntry[]; error: string | null }> {
  const supabase = getMeterAnonSupabase()
  if (!supabase) return { entries: [], error: 'Supabase is not configured.' }
  if (!params.windowStart) return { entries: [], error: null }

  let query = supabase
    .from('meter_leaderboard_entries')
    .select(
      'role_bucket, player_key, display_name, dps, digimon_id, digimon_name, icon_id, portrait_url, parse_id, created_at',
    )
    .eq('dungeon_id', params.dungeonId.trim())
    .eq('difficulty_id', params.difficultyId)
    .gte('created_at', params.windowStart)

  if (params.windowEnd) {
    query = query.lt('created_at', params.windowEnd)
  }

  const { data, error } = await query

  if (error) return { entries: [], error: error.message }

  const entries = ((data ?? []) as ParticipationRow[])
    .filter((row): row is ParticipationRow & { role_bucket: MeterRoleBucket } => isRoleBucket(row.role_bucket))
    .map((row) => ({
      ...mapPlayerRow(row),
      roleBucket: row.role_bucket,
      parseId: row.parse_id?.trim?.() ?? String(row.parse_id ?? '').trim(),
      achievedAt: row.created_at ?? '',
    }))
    .filter((entry) => entry.parseId && entry.dps > 0)
  const resolved = await applyOfficialNamesToPlayerRankEntries(entries).catch(() => entries)
  return {
    entries: resolved.map((entry, i) => ({
      ...entry,
      roleBucket: entries[i]!.roleBucket,
      parseId: entries[i]!.parseId,
      achievedAt: entries[i]!.achievedAt,
    })),
    error: null,
  }
}
