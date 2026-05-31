import type { ParticipationPoolEntry } from './meterLeaderboardPrecomputed'
import {
  aggregatePublicMeterStats,
  type MeterPublicAggregates,
  type PublicMeterParseRow,
} from './meterPublicStats'
import {
  memberRoleBucket,
  memberTopDigimonUsed,
  METER_ROLE_BUCKETS,
  normalizePlayerKey,
  playerDisplayName,
  type MeterRoleBucket,
} from './meterRoleBuckets'
import {
  isBrokenMeterPartyParse,
  isDungeonPartyParsePayload,
  partyMembersFromPayload,
} from './meterParsePayload'
import { MAY_CLEAR_EVENT } from './mayClearEvent'
import type { PlayerRankEntry } from './meterPublicStats'

const PARTICIPATION_DRAW_SEED = 'may-clear-2026-participation'

function eventWindowMs(): { start: number; end: number } {
  const startIso = `${MAY_CLEAR_EVENT.eventDateIso}T00:00:00.000Z`
  return {
    start: new Date(startIso).getTime(),
    end: new Date(MAY_CLEAR_EVENT.eventDateEndIso).getTime(),
  }
}

export function isMayClearEventEnded(now = new Date(), previewEnded = false): boolean {
  if (previewEnded) return true
  return now.getTime() >= new Date(MAY_CLEAR_EVENT.eventDateEndIso).getTime()
}

export function filterParsesInMayClearEventWindow(rows: PublicMeterParseRow[]): PublicMeterParseRow[] {
  const { start, end } = eventWindowMs()
  return rows.filter((row) => {
    const t = new Date(row.created_at).getTime()
    return t >= start && t < end
  })
}

function deterministicIndex(seed: string, length: number): number {
  if (length <= 0) return 0
  let h = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % length
}

/** One random eligible player per role (stable draw for a fixed parse set). */
export function pickMayClearParticipationWinners(
  rows: PublicMeterParseRow[],
  digimonRoleById: Map<string, string>,
  dungeonId: string,
  difficultyId: number,
): Record<MeterRoleBucket, PlayerRankEntry | null> {
  const pools = Object.fromEntries(METER_ROLE_BUCKETS.map((b) => [b, new Map<string, PlayerRankEntry>()])) as Record<
    MeterRoleBucket,
    Map<string, PlayerRankEntry>
  >

  for (const row of rows) {
    if (row.dungeon_id !== dungeonId) continue
    if (row.difficulty_id !== difficultyId) continue
    if (!isDungeonPartyParsePayload(row.payload)) continue
    const members = partyMembersFromPayload(row.payload)
    if (isBrokenMeterPartyParse(row.payload, members)) continue

    for (const member of members) {
      const bucket = memberRoleBucket(member, digimonRoleById)
      if (!bucket) continue
      const pKey = normalizePlayerKey(member)
      const topDg = memberTopDigimonUsed(member)
      const entry: PlayerRankEntry = {
        playerKey: pKey,
        displayName: playerDisplayName(member),
        dps: 0,
        digimonId: topDg?.digimonId ?? '',
        digimonName: topDg?.digimonName ?? '',
        iconId: topDg?.iconId ?? null,
        portraitUrl: topDg?.portraitUrl,
      }
      if (!pools[bucket].has(pKey)) {
        pools[bucket].set(pKey, entry)
      }
    }
  }

  const winners = {} as Record<MeterRoleBucket, PlayerRankEntry | null>
  for (const bucket of METER_ROLE_BUCKETS) {
    const pool = [...pools[bucket].values()]
    if (pool.length === 0) {
      winners[bucket] = null
      continue
    }
    const idx = deterministicIndex(`${PARTICIPATION_DRAW_SEED}:${dungeonId}:${bucket}`, pool.length)
    winners[bucket] = pool[idx]!
  }
  return winners
}

/** One random eligible player per role from precomputed leaderboard entries. */
export function pickMayClearParticipationWinnersFromEntries(
  entries: ParticipationPoolEntry[],
  dungeonId: string,
  difficultyId: number,
): Record<MeterRoleBucket, PlayerRankEntry | null> {
  const pools = Object.fromEntries(METER_ROLE_BUCKETS.map((b) => [b, new Map<string, PlayerRankEntry>()])) as Record<
    MeterRoleBucket,
    Map<string, PlayerRankEntry>
  >

  for (const entry of entries) {
    const bucket = entry.roleBucket
    if (!pools[bucket].has(entry.playerKey)) {
      const { roleBucket: _role, ...player } = entry
      pools[bucket].set(entry.playerKey, player)
    }
  }

  const winners = {} as Record<MeterRoleBucket, PlayerRankEntry | null>
  for (const bucket of METER_ROLE_BUCKETS) {
    const pool = [...pools[bucket].values()]
    if (pool.length === 0) {
      winners[bucket] = null
      continue
    }
    const idx = deterministicIndex(
      `${PARTICIPATION_DRAW_SEED}:${dungeonId}:${difficultyId}:${bucket}`,
      pool.length,
    )
    winners[bucket] = pool[idx]!
  }
  return winners
}

export function buildMayClearEventResultsFromPrecomputed(
  stats: MeterPublicAggregates,
  participationEntries: ParticipationPoolEntry[],
  dungeonId: string,
  difficultyId: number,
) {
  const leaderboardWinners = Object.fromEntries(
    METER_ROLE_BUCKETS.map((b) => [b, stats.playersByBucket[b][0] ?? null]),
  ) as Record<MeterRoleBucket, PlayerRankEntry | null>
  const participationWinners = pickMayClearParticipationWinnersFromEntries(
    participationEntries,
    dungeonId,
    difficultyId,
  )
  return { stats, eventRows: [] as PublicMeterParseRow[], leaderboardWinners, participationWinners }
}

export function buildMayClearEventResults(
  rows: PublicMeterParseRow[],
  digimonRoleById: Map<string, string>,
  dungeonId: string,
) {
  const { difficultyId } = MAY_CLEAR_EVENT
  const eventRows = filterParsesInMayClearEventWindow(rows)
  const stats = aggregatePublicMeterStats(eventRows, digimonRoleById, dungeonId, difficultyId)
  const leaderboardWinners = Object.fromEntries(
    METER_ROLE_BUCKETS.map((b) => [b, stats.playersByBucket[b][0] ?? null]),
  ) as Record<MeterRoleBucket, PlayerRankEntry | null>
  const participationWinners = pickMayClearParticipationWinners(
    eventRows,
    digimonRoleById,
    dungeonId,
    difficultyId,
  )
  return { stats, eventRows, leaderboardWinners, participationWinners }
}
