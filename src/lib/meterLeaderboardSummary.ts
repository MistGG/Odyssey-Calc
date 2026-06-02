import { getMeterAnonSupabase, fetchScopeParsesRaw } from './meterDataSource'
import { ineligibleLeaderboardParseIds } from './meterCoUploadMerge'
import {
  isBrokenMeterPartyParse,
  isLeaderboardEligibleDungeonParsePayload,
  partyMembersFromPayload,
} from './meterParsePayload'
import type { PlayerRankEntry, MeterPublicAggregates } from './meterPublicStats'
import {
  digimonIdToBucket,
  METER_ROLE_BUCKETS,
  METER_ROLE_BUCKET_LABELS,
  type MeterRoleBucket,
} from './meterRoleBuckets'

export type MeterLeaderboardSummaryMember = {
  playerKey: string
  displayName: string
  dps: number
  digimonId: string
  digimonName: string
  iconId: string | null
  portraitUrl?: string
  roleBucket: MeterRoleBucket | null
}

export type MeterLeaderboardSummaryStored = {
  version?: number
  eligible?: boolean
  sessionDurationSec?: number
  members: MeterLeaderboardSummaryMember[]
}

export type ParseSummaryRow = {
  parseId: string
  createdAt: string
  summary: MeterLeaderboardSummaryStored
}

const SUMMARY_PARSE_LIMIT = 500

function isSummaryStored(value: unknown): value is MeterLeaderboardSummaryStored {
  if (!value || typeof value !== 'object') return false
  const o = value as MeterLeaderboardSummaryStored
  return Array.isArray(o.members)
}

export function resolveSummaryMemberRole(
  member: MeterLeaderboardSummaryMember,
  digimonRoleById: Map<string, string>,
): MeterRoleBucket | null {
  if (member.roleBucket) return member.roleBucket
  const id = member.digimonId?.trim()
  if (!id) return null
  return digimonIdToBucket(id, digimonRoleById)
}

export async function fetchScopeParseSummaries(
  dungeonId: string,
  difficultyId: number,
): Promise<ParseSummaryRow[]> {
  const supabase = getMeterAnonSupabase()
  if (!supabase) return []

  const id = dungeonId.trim()
  if (!id || difficultyId < 2) return []

  const [{ data, error }, scopeRes] = await Promise.all([
    supabase
      .from('meter_parses')
      .select('id, created_at, leaderboard_summary, payload')
      .eq('parse_kind', 'dungeon_party')
      .eq('dungeon_id', id)
      .eq('difficulty_id', difficultyId)
      .not('leaderboard_summary', 'is', null)
      .order('created_at', { ascending: false })
      .limit(SUMMARY_PARSE_LIMIT),
    fetchScopeParsesRaw({ dungeonId: id, difficultyId }),
  ])

  if (error || !data?.length) return []

  const dropParseIds = scopeRes.error
    ? new Set<string>()
    : ineligibleLeaderboardParseIds(scopeRes.rows)

  const rows: ParseSummaryRow[] = []
  for (const row of data) {
    const summary = row.leaderboard_summary
    if (!isSummaryStored(summary) || summary.eligible === false) continue
    if (dropParseIds.has(row.id)) continue
    if (!isLeaderboardEligibleDungeonParsePayload(row.payload)) continue
    const members = partyMembersFromPayload(row.payload)
    if (members.length && isBrokenMeterPartyParse(row.payload, members)) continue
    rows.push({
      parseId: row.id,
      createdAt: row.created_at,
      summary,
    })
  }
  return rows
}

export type SummaryLeaderboardEntry = PlayerRankEntry & {
  parseId: string
  achievedAt: string
  roleBucket: MeterRoleBucket
  roleLabel: string
}

export function buildEntriesFromParseSummaries(
  parses: ParseSummaryRow[],
  digimonRoleById: Map<string, string>,
): SummaryLeaderboardEntry[] {
  const out: SummaryLeaderboardEntry[] = []
  for (const parse of parses) {
    for (const member of parse.summary.members) {
      const playerKey = member.playerKey?.trim().toLowerCase()
      const dps = Number(member.dps) || 0
      if (!playerKey || dps <= 0) continue
      const roleBucket = resolveSummaryMemberRole(member, digimonRoleById)
      if (!roleBucket) continue
      out.push({
        parseId: parse.parseId,
        achievedAt: parse.createdAt,
        roleBucket,
        roleLabel: METER_ROLE_BUCKET_LABELS[roleBucket],
        playerKey,
        displayName: member.displayName?.trim() || playerKey,
        dps,
        digimonId: member.digimonId ?? '',
        digimonName: member.digimonName ?? '',
        iconId: member.iconId,
        portraitUrl: member.portraitUrl,
      })
    }
  }
  return out
}

function entryHistoryKey(entry: Pick<SummaryLeaderboardEntry, 'parseId' | 'playerKey' | 'roleBucket'>) {
  return `${entry.parseId}:${entry.playerKey}:${entry.roleBucket}`
}

/** Fill gaps when ingest skipped members (null roleBucket at upload time). */
export function mergeSummaryEntriesIntoHistory<T extends SummaryLeaderboardEntry>(
  history: T[],
  supplemental: SummaryLeaderboardEntry[],
): T[] {
  const seen = new Set(history.map((e) => entryHistoryKey(e)))
  const merged = [...history]
  for (const entry of supplemental) {
    const key = entryHistoryKey(entry)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(entry as T)
  }
  return merged
}

const TOP_PLAYERS = 100

/** Raise per-player bests using stored parse summaries (same DPS as profile). */
export function mergeSummaryEntriesIntoAggregates(
  stats: MeterPublicAggregates,
  supplemental: SummaryLeaderboardEntry[],
): MeterPublicAggregates {
  const playerBest = new Map<MeterRoleBucket, Map<string, PlayerRankEntry>>()
  for (const bucket of METER_ROLE_BUCKETS) {
    playerBest.set(
      bucket,
      new Map(stats.playersByBucket[bucket].map((p) => [p.playerKey, p])),
    )
  }

  for (const entry of supplemental) {
    const map = playerBest.get(entry.roleBucket)!
    const prev = map.get(entry.playerKey)
    if (!prev || entry.dps > prev.dps) {
      map.set(entry.playerKey, {
        playerKey: entry.playerKey,
        displayName: entry.displayName,
        dps: entry.dps,
        digimonId: entry.digimonId,
        digimonName: entry.digimonName,
        iconId: entry.iconId,
        portraitUrl: entry.portraitUrl,
      })
    }
  }

  const playersByBucket = { ...stats.playersByBucket }
  const sortedDpsByBucket = { ...stats.sortedDpsByBucket }

  for (const bucket of METER_ROLE_BUCKETS) {
    const entries = [...playerBest.get(bucket)!.values()]
      .sort((a, b) => b.dps - a.dps)
      .slice(0, TOP_PLAYERS)
    playersByBucket[bucket] = entries
    sortedDpsByBucket[bucket] = entries.map((p) => p.dps).sort((a, b) => a - b)
  }

  return {
    ...stats,
    playersByBucket,
    sortedDpsByBucket,
  }
}
