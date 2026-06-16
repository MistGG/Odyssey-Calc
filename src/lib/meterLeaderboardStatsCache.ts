import type { MeterPublicAggregates } from './meterPublicStats'
import { meterScopeKey } from './meterParseCache'

const TTL_MS = 15 * 60 * 1000

type Entry = {
  stats: MeterPublicAggregates
  fetchedAt: number
}

const memory = new Map<string, Entry>()

function isFresh(entry: Entry | undefined): entry is Entry {
  return entry != null && Date.now() - entry.fetchedAt < TTL_MS
}

function leaderboardCacheKey(dungeonId: string, difficultyId: number, leaderboardCycleId: string): string {
  return `${meterScopeKey(dungeonId, difficultyId)}:${leaderboardCycleId.trim() || 'default'}`
}

export function getCachedLeaderboardStats(
  dungeonId: string,
  difficultyId: number,
  leaderboardCycleId = 'default',
): MeterPublicAggregates | null {
  const key = leaderboardCacheKey(dungeonId, difficultyId, leaderboardCycleId)
  const entry = memory.get(key)
  return isFresh(entry) ? entry.stats : null
}

export function setCachedLeaderboardStats(
  dungeonId: string,
  difficultyId: number,
  stats: MeterPublicAggregates,
  leaderboardCycleId = 'default',
): void {
  const key = leaderboardCacheKey(dungeonId, difficultyId, leaderboardCycleId)
  memory.set(key, { stats, fetchedAt: Date.now() })
}
