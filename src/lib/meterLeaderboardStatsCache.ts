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

export function getCachedLeaderboardStats(
  dungeonId: string,
  difficultyId: number,
): MeterPublicAggregates | null {
  const key = meterScopeKey(dungeonId, difficultyId)
  const entry = memory.get(key)
  return isFresh(entry) ? entry.stats : null
}

export function setCachedLeaderboardStats(
  dungeonId: string,
  difficultyId: number,
  stats: MeterPublicAggregates,
): void {
  const key = meterScopeKey(dungeonId, difficultyId)
  memory.set(key, { stats, fetchedAt: Date.now() })
}
