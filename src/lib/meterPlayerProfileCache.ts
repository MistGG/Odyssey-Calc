import type { PlayerLeaderboardEntryRow } from './meterDataSource'
import type { ProfileHallOfFameEntry } from './meterHallOfFame'
import type { MeterRoleBucket } from './meterRoleBuckets'

/** Player profile snapshots; avoid empty reload flash on refresh / back-nav. */
const TTL_MS = 30 * 60 * 1000
const SESSION_KEY = 'odyssey-meter-player-profile-v1'
const MAX_PLAYERS = 12

export type MeterPlayerProfileScopePools = Record<string, Partial<Record<MeterRoleBucket, number[]>>>

export type MeterPlayerProfileCacheEntry = {
  playerKey: string
  /** Live cycle id when this snapshot was built (invalidate on season rollover). */
  cycleId: string
  entries: PlayerLeaderboardEntryRow[]
  scopePools: MeterPlayerProfileScopePools
  hofEntries: ProfileHallOfFameEntry[]
  hofCurrentCycleId: string
  hofCurrentCycleShortLabel: string
  hofCurrentSeasonCount: number
  fetchedAt: number
}

type PersistedPayload = {
  players: Record<string, MeterPlayerProfileCacheEntry>
}

const memory = new Map<string, MeterPlayerProfileCacheEntry>()
let hydrated = false

function isFresh(entry: MeterPlayerProfileCacheEntry | null | undefined): entry is MeterPlayerProfileCacheEntry {
  return entry != null && Date.now() - entry.fetchedAt < TTL_MS
}

function hydrateFromSession(): void {
  if (hydrated) return
  hydrated = true
  if (typeof sessionStorage === 'undefined') return
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as PersistedPayload
    for (const [key, entry] of Object.entries(parsed.players ?? {})) {
      if (isFresh(entry)) memory.set(key, entry)
    }
  } catch {
    /* ignore quota / corrupt */
  }
}

function persistToSession(): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    const players: Record<string, MeterPlayerProfileCacheEntry> = {}
    let n = 0
    for (const [key, entry] of memory) {
      if (!isFresh(entry)) continue
      players[key] = entry
      n += 1
      if (n >= MAX_PLAYERS) break
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ players } satisfies PersistedPayload))
  } catch {
    /* quota — drop pools and retry compact entries+hof only */
    try {
      const players: Record<string, MeterPlayerProfileCacheEntry> = {}
      let n = 0
      for (const [key, entry] of memory) {
        if (!isFresh(entry)) continue
        players[key] = { ...entry, scopePools: {} }
        n += 1
        if (n >= MAX_PLAYERS) break
      }
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ players } satisfies PersistedPayload))
    } catch {
      /* ignore */
    }
  }
}

export function serializeScopeLeaderboardPools(
  pools: Map<string, Record<MeterRoleBucket, number[]>>,
): MeterPlayerProfileScopePools {
  const out: MeterPlayerProfileScopePools = {}
  for (const [key, byRole] of pools) {
    out[key] = byRole
  }
  return out
}

export function deserializeScopeLeaderboardPools(
  pools: MeterPlayerProfileScopePools | null | undefined,
): Map<string, Record<MeterRoleBucket, number[]>> {
  const out = new Map<string, Record<MeterRoleBucket, number[]>>()
  if (!pools) return out
  for (const [key, byRole] of Object.entries(pools)) {
    if (!byRole || typeof byRole !== 'object') continue
    out.set(key, byRole as Record<MeterRoleBucket, number[]>)
  }
  return out
}

export function readCachedPlayerProfile(
  playerKey: string,
  cycleId: string,
): MeterPlayerProfileCacheEntry | null {
  hydrateFromSession()
  const key = playerKey.trim().toLowerCase()
  if (!key) return null
  const entry = memory.get(key)
  if (!isFresh(entry)) return null
  if (entry.cycleId !== cycleId) return null
  return entry
}

export function writeCachedPlayerProfile(entry: MeterPlayerProfileCacheEntry): void {
  const key = entry.playerKey.trim().toLowerCase()
  if (!key) return
  const next: MeterPlayerProfileCacheEntry = {
    ...entry,
    playerKey: key,
    fetchedAt: Date.now(),
  }
  memory.set(key, next)
  persistToSession()
}
