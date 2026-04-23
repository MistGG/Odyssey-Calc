/** Serialized wiki JSON keyed by full request URL (same origin + path + query). */

const WIKI_HTTP_CACHE_KEY = 'odysseyCalc.wikiHttpCache.v1'
const MAX_ENTRIES = 450

type CacheEntry = {
  body: unknown
  storedAt: number
}

function readMap(): Record<string, CacheEntry> {
  try {
    const raw = localStorage.getItem(WIKI_HTTP_CACHE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, CacheEntry>
  } catch {
    return {}
  }
}

function evictOldestFraction(map: Record<string, CacheEntry>, fraction: number) {
  const keys = Object.keys(map)
  if (keys.length === 0) return
  keys.sort((a, b) => map[a].storedAt - map[b].storedAt)
  const drop = Math.max(1, Math.ceil(keys.length * fraction))
  for (let i = 0; i < drop; i++) delete map[keys[i]]
}

function writeMap(map: Record<string, CacheEntry>) {
  try {
    localStorage.setItem(WIKI_HTTP_CACHE_KEY, JSON.stringify(map))
  } catch {
    evictOldestFraction(map, 0.5)
    try {
      localStorage.setItem(WIKI_HTTP_CACHE_KEY, JSON.stringify(map))
    } catch {
      evictOldestFraction(map, 0.5)
      try {
        localStorage.setItem(WIKI_HTTP_CACHE_KEY, JSON.stringify(map))
      } catch {
        /* quota / private mode */
      }
    }
  }
}

export function wikiHttpCacheGet<T>(url: string): T | null {
  const map = readMap()
  const e = map[url]
  return e ? (e.body as T) : null
}

export function wikiHttpCacheSet(url: string, body: unknown): void {
  const map = readMap()
  map[url] = { body, storedAt: Date.now() }
  const keys = Object.keys(map)
  if (keys.length > MAX_ENTRIES) {
    keys.sort((a, b) => map[a].storedAt - map[b].storedAt)
    for (let i = 0; i < keys.length - MAX_ENTRIES; i++) delete map[keys[i]]
  }
  writeMap(map)
}
