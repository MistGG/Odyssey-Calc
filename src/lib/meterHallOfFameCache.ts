import type { MeterHallOfFameEntry } from './meterHallOfFame'

const TTL_MS = 60 * 60 * 1000
const SESSION_KEY = 'odyssey-meter-hof-cache-v2'
const MAX_SCOPES = 32

type CacheEntry = {
  entries: MeterHallOfFameEntry[]
  fetchedAt: number
}

const memory = new Map<string, CacheEntry>()
let hydrated = false

export function meterHofScopeKey(dungeonId: string, difficultyId: number, cycleId?: string): string {
  return `${dungeonId.trim()}:${difficultyId}:${cycleId?.trim() || 'all'}`
}

function isFresh(entry: CacheEntry | null | undefined): entry is CacheEntry {
  return entry != null && Date.now() - entry.fetchedAt < TTL_MS
}

function hydrateFromSession(): void {
  if (hydrated) return
  hydrated = true
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, CacheEntry>
    let n = 0
    for (const [key, entry] of Object.entries(parsed ?? {})) {
      if (!isFresh(entry)) continue
      memory.set(key, entry)
      n += 1
      if (n >= MAX_SCOPES) break
    }
  } catch {
    /* ignore */
  }
}

function persistToSession(): void {
  try {
    const scopes: Record<string, CacheEntry> = {}
    let n = 0
    for (const [key, entry] of memory) {
      if (!isFresh(entry)) continue
      scopes[key] = entry
      n += 1
      if (n >= MAX_SCOPES) break
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(scopes))
  } catch {
    /* quota */
  }
}

export function getCachedScopeHallOfFame(key: string): MeterHallOfFameEntry[] | null {
  hydrateFromSession()
  const entry = memory.get(key)
  return isFresh(entry) ? entry.entries : null
}

export function setCachedScopeHallOfFame(key: string, entries: MeterHallOfFameEntry[]): void {
  memory.set(key, { entries, fetchedAt: Date.now() })
  persistToSession()
}

export function isScopeHallOfFameCacheFresh(key: string): boolean {
  hydrateFromSession()
  return isFresh(memory.get(key))
}
