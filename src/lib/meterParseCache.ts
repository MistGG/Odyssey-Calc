import type { PublicMeterParseRow } from './meterPublicStats'

const TTL_MS = 8 * 60 * 1000
const SESSION_KEY = 'odyssey-meter-parse-cache-v1'
const MAX_PERSISTED_SCOPES = 6

type CacheEntry = {
  rows: PublicMeterParseRow[]
  fetchedAt: number
}

type PersistedPayload = {
  scopes: Record<string, CacheEntry>
  globalRecent: CacheEntry | null
}

const scopeMemory = new Map<string, CacheEntry>()
let globalRecentMemory: CacheEntry | null = null
let hydrated = false

export function meterScopeKey(dungeonId: string, difficultyId: number): string {
  return `${dungeonId.trim()}:${difficultyId}`
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
    const parsed = JSON.parse(raw) as PersistedPayload
    for (const [key, entry] of Object.entries(parsed.scopes ?? {})) {
      if (isFresh(entry)) scopeMemory.set(key, entry)
    }
    if (isFresh(parsed.globalRecent)) globalRecentMemory = parsed.globalRecent
  } catch {
    /* ignore quota / corrupt */
  }
}

function persistToSession(): void {
  try {
    const scopes: Record<string, CacheEntry> = {}
    let n = 0
    for (const [key, entry] of scopeMemory) {
      if (!isFresh(entry)) continue
      scopes[key] = entry
      n += 1
      if (n >= MAX_PERSISTED_SCOPES) break
    }
    const payload: PersistedPayload = {
      scopes,
      globalRecent: isFresh(globalRecentMemory) ? globalRecentMemory : null,
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload))
  } catch {
    /* quota */
  }
}

export function getCachedScopeParses(key: string): PublicMeterParseRow[] | null {
  hydrateFromSession()
  const entry = scopeMemory.get(key)
  return isFresh(entry) ? entry.rows : null
}

export function setCachedScopeParses(key: string, rows: PublicMeterParseRow[]): void {
  scopeMemory.set(key, { rows, fetchedAt: Date.now() })
  persistToSession()
}

export function getCachedGlobalRecentParses(): PublicMeterParseRow[] | null {
  hydrateFromSession()
  return isFresh(globalRecentMemory) ? globalRecentMemory.rows : null
}

export function setCachedGlobalRecentParses(rows: PublicMeterParseRow[]): void {
  globalRecentMemory = { rows, fetchedAt: Date.now() }
  persistToSession()
}
