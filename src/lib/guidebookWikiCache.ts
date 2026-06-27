import { fetchAllWikiDungeons, fetchWikiDungeonDetail, wikiDungeonDetailUrl } from '../api/dungeonService'
import { fetchWikiItemDetail, fetchWikiItemsPage, wikiItemDetailUrl, wikiItemsListUrl } from '../api/itemService'
import { fetchWikiMonsterDetail, wikiMonsterDetailUrl } from '../api/monsterService'
import {
  fetchDigimonDetail,
  fetchDigimonPage,
  wikiDigimonDetailUrl,
  wikiDigimonListUrl,
  type DigimonFilters,
} from '../api/digimonService'
import { fetchWikiNpcDetail, wikiNpcDetailUrl } from '../api/npcService'
import {
  fetchAllWikiQuests,
  fetchWikiQuestDetail,
  fetchWikiQuestsPage,
  wikiQuestDetailUrl,
  wikiQuestsListUrl,
} from '../api/questService'
import { digimonPortraitUrl } from './digimonImage'
import { wikiHttpCacheGet, wikiHttpCacheStoredAt } from './wikiHttpCache'

/** Skip network revalidation when entity/http cache is newer than this. */
export const GUIDEBOOK_WIKI_MAX_AGE_MS = 30 * 60 * 1000
import type {
  WikiDigimonDetail,
  WikiDigimonListItem,
  WikiDigimonListResponse,
  WikiDungeonDetail,
  WikiDungeonListItem,
  WikiItemDetail,
  WikiItemListResponse,
  WikiMonsterDetail,
  WikiNpcDetail,
  WikiQuestDetail,
  WikiQuestListItem,
  WikiQuestListResponse,
} from '../types/wikiApi'

const GUIDEBOOK_ENTITY_CACHE_KEY = 'odysseyCalc.guidebookWikiEntities.v1'
const MAX_ENTITY_ENTRIES = 400

type EntityEntry = {
  body: unknown
  storedAt: number
}

function readEntityMap(): Record<string, EntityEntry> {
  try {
    const raw = localStorage.getItem(GUIDEBOOK_ENTITY_CACHE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, EntityEntry>
  } catch {
    return {}
  }
}

function evictOldestFraction(map: Record<string, EntityEntry>, fraction: number) {
  const keys = Object.keys(map)
  if (keys.length === 0) return
  keys.sort((a, b) => map[a].storedAt - map[b].storedAt)
  const drop = Math.max(1, Math.ceil(keys.length * fraction))
  for (let i = 0; i < drop; i++) delete map[keys[i]]
}

function writeEntityMap(map: Record<string, EntityEntry>) {
  try {
    localStorage.setItem(GUIDEBOOK_ENTITY_CACHE_KEY, JSON.stringify(map))
  } catch {
    evictOldestFraction(map, 0.5)
    try {
      localStorage.setItem(GUIDEBOOK_ENTITY_CACHE_KEY, JSON.stringify(map))
    } catch {
      evictOldestFraction(map, 0.5)
      try {
        localStorage.setItem(GUIDEBOOK_ENTITY_CACHE_KEY, JSON.stringify(map))
      } catch {
        /* quota / private mode */
      }
    }
  }
}

function guidebookEntityGet<T>(storageKey: string): T | null {
  const map = readEntityMap()
  const entry = map[storageKey]
  return entry ? (entry.body as T) : null
}

function guidebookEntitySet(storageKey: string, body: unknown) {
  const map = readEntityMap()
  map[storageKey] = { body, storedAt: Date.now() }
  const keys = Object.keys(map)
  if (keys.length > MAX_ENTITY_ENTRIES) {
    keys.sort((a, b) => map[a].storedAt - map[b].storedAt)
    for (let i = 0; i < keys.length - MAX_ENTITY_ENTRIES; i++) delete map[keys[i]]
  }
  writeEntityMap(map)
}

type RevalidatingCacheOptions = {
  /** `localStorage` key segment, e.g. `item:m1abc`. */
  entityKey: (key: string) => string
  /** Optional wiki HTTP cache URL for hydration (same store as `fetchJson`). */
  urlForKey?: (key: string) => string | null
}

function guidebookEntityStoredAt(storageKey: string): number | null {
  const map = readEntityMap()
  return map[storageKey]?.storedAt ?? null
}

/**
 * In-memory cache with persisted fallback and TTL-gated revalidation.
 * `get` returns the last known value; `load` fetches only when missing or stale.
 */
function createRevalidatingCache<T>(options: RevalidatingCacheOptions) {
  const memory = new Map<string, T>()
  const memoryFetchedAt = new Map<string, number>()
  const inflight = new Map<string, Promise<T>>()

  const hydrate = (key: string): T | undefined => {
    const hit = memory.get(key)
    if (hit !== undefined) return hit

    const storageKey = options.entityKey(key)
    const fromEntity = guidebookEntityGet<T>(storageKey)
    if (fromEntity != null) {
      memory.set(key, fromEntity)
      const storedAt = guidebookEntityStoredAt(storageKey)
      if (storedAt != null) memoryFetchedAt.set(key, storedAt)
      return fromEntity
    }

    const url = options.urlForKey?.(key)
    if (url) {
      const fromHttp = wikiHttpCacheGet<T>(url)
      if (fromHttp != null) {
        memory.set(key, fromHttp)
        const httpStoredAt = wikiHttpCacheStoredAt(url)
        if (httpStoredAt != null) memoryFetchedAt.set(key, httpStoredAt)
        return fromHttp
      }
    }

    return undefined
  }

  const isFresh = (key: string): boolean => {
    const ts = memoryFetchedAt.get(key)
    if (ts == null) return false
    return Date.now() - ts < GUIDEBOOK_WIKI_MAX_AGE_MS
  }

  return {
    get(key: string): T | undefined {
      return hydrate(key)
    },
    load(key: string, loader: () => Promise<T>): Promise<T> {
      const cached = hydrate(key)
      if (cached !== undefined && isFresh(key)) {
        return Promise.resolve(cached)
      }

      let pending = inflight.get(key)
      if (!pending) {
        pending = loader()
          .then((value) => {
            const now = Date.now()
            memory.set(key, value)
            memoryFetchedAt.set(key, now)
            guidebookEntitySet(options.entityKey(key), value)
            inflight.delete(key)
            return value
          })
          .catch((err) => {
            inflight.delete(key)
            const fallback = memory.get(key)
            if (fallback !== undefined) return fallback
            throw err
          })
        inflight.set(key, pending)
      }
      return pending
    },
  }
}

const digimonDetailCache = createRevalidatingCache<WikiDigimonDetail>({
  entityKey: (id) => `digimon:${id}`,
  urlForKey: (id) => wikiDigimonDetailUrl(id),
})

const digimonListCache = createRevalidatingCache<WikiDigimonListResponse>({
  entityKey: (key) => `digimonList:${key}`,
  urlForKey: (key) => {
    const parsed = JSON.parse(key) as {
      page: number
      perPage: number
      search: string
      filters: DigimonFilters
    }
    return wikiDigimonListUrl(parsed.page + 1, parsed.perPage, parsed.search || undefined, parsed.filters)
  },
})

const dungeonsCache = createRevalidatingCache<WikiDungeonListItem[]>({
  entityKey: (key) => `dungeons:${key}`,
})

const dungeonDetailCache = createRevalidatingCache<WikiDungeonDetail>({
  entityKey: (id) => `dungeon:${id}`,
  urlForKey: (id) => wikiDungeonDetailUrl(id),
})

const itemDetailCache = createRevalidatingCache<WikiItemDetail>({
  entityKey: (id) => `item:${id}`,
  urlForKey: (id) => wikiItemDetailUrl(id),
})

const itemSearchCache = createRevalidatingCache<WikiItemListResponse>({
  entityKey: (key) => `itemSearch:${key}`,
  urlForKey: (key) => {
    const parsed = JSON.parse(key) as { page: number; perPage: number; search: string }
    return wikiItemsListUrl(parsed.page + 1, parsed.perPage, parsed.search || undefined)
  },
})

const questsCache = createRevalidatingCache<WikiQuestListItem[]>({
  entityKey: (key) => `quests:${key}`,
})

const questSearchCache = createRevalidatingCache<WikiQuestListResponse>({
  entityKey: (key) => `questSearch:${key}`,
  urlForKey: (key) => {
    const parsed = JSON.parse(key) as { page: number; perPage: number; search: string }
    return wikiQuestsListUrl(parsed.page + 1, parsed.perPage, parsed.search || undefined)
  },
})

const monsterDetailCache = createRevalidatingCache<WikiMonsterDetail>({
  entityKey: (id) => `monster:${id}`,
  urlForKey: (id) => wikiMonsterDetailUrl(id),
})

const questDetailCache = createRevalidatingCache<WikiQuestDetail>({
  entityKey: (id) => `quest:${id}`,
  urlForKey: (id) => wikiQuestDetailUrl(id),
})

const npcDetailCache = createRevalidatingCache<WikiNpcDetail>({
  entityKey: (id) => `npc:${id}`,
  urlForKey: (id) => wikiNpcDetailUrl(id),
})

const preloadedPortraitUrls = new Set<string>()

function digimonPageCacheKey(
  pageZeroBased: number,
  perPage: number,
  searchQuery?: string,
  filters?: DigimonFilters,
) {
  return JSON.stringify({
    page: pageZeroBased,
    perPage,
    search: searchQuery?.trim() ?? '',
    filters: filters ?? {},
  })
}

function preloadPortraitUrl(url: string | undefined) {
  if (!url || preloadedPortraitUrls.has(url)) return
  preloadedPortraitUrls.add(url)
  const img = new Image()
  img.decoding = 'async'
  img.src = url
}

export function preloadGuidebookPortraitsFromDetail(detail: WikiDigimonDetail) {
  preloadPortraitUrl(digimonPortraitUrl(detail.model_id, detail.id, detail.name))
}

export function preloadGuidebookPortraitsFromList(items: WikiDigimonListItem[]) {
  for (const item of items) {
    preloadPortraitUrl(digimonPortraitUrl(item.model_id, item.id, item.name))
  }
}

export function getGuidebookPortraitUrl(digimonId: string): string | undefined {
  const detail = getGuidebookDigimonDetailCached(digimonId)
  if (!detail) return undefined
  return digimonPortraitUrl(detail.model_id, detail.id, detail.name)
}

export function getGuidebookDigimonDetailCached(id: string): WikiDigimonDetail | null {
  return digimonDetailCache.get(id) ?? null
}

export function loadGuidebookDigimonDetail(id: string): Promise<WikiDigimonDetail> {
  return digimonDetailCache.load(id, () =>
    fetchDigimonDetail(id).then((detail) => {
      preloadGuidebookPortraitsFromDetail(detail)
      return detail
    }),
  )
}

export function getGuidebookDigimonPageCached(
  pageZeroBased: number,
  perPage: number,
  searchQuery?: string,
  filters?: DigimonFilters,
): WikiDigimonListResponse | null {
  return digimonListCache.get(digimonPageCacheKey(pageZeroBased, perPage, searchQuery, filters)) ?? null
}

export function loadGuidebookDigimonPage(
  pageZeroBased: number,
  perPage: number,
  searchQuery?: string,
  filters?: DigimonFilters,
): Promise<WikiDigimonListResponse> {
  const key = digimonPageCacheKey(pageZeroBased, perPage, searchQuery, filters)
  return digimonListCache.load(key, () =>
    fetchDigimonPage(pageZeroBased, perPage, searchQuery, filters).then((res) => {
      preloadGuidebookPortraitsFromList(res.data)
      return res
    }),
  )
}

export function getGuidebookDungeonsCached(perPage = 500): WikiDungeonListItem[] | null {
  return dungeonsCache.get(`all:${perPage}`) ?? null
}

export function loadGuidebookAllDungeons(perPage = 500): Promise<WikiDungeonListItem[]> {
  return dungeonsCache.load(`all:${perPage}`, () => fetchAllWikiDungeons(perPage))
}

export function getGuidebookDungeonDetailCached(id: string): WikiDungeonDetail | null {
  return dungeonDetailCache.get(id) ?? null
}

export function loadGuidebookDungeonDetail(id: string): Promise<WikiDungeonDetail> {
  return dungeonDetailCache.load(id, () => fetchWikiDungeonDetail(id))
}

export function getGuidebookItemDetailCached(id: string): WikiItemDetail | null {
  return itemDetailCache.get(id) ?? null
}

export function loadGuidebookItemDetail(id: string): Promise<WikiItemDetail> {
  return itemDetailCache.load(id, () => fetchWikiItemDetail(id))
}

function itemSearchCacheKey(pageZeroBased: number, perPage: number, searchQuery: string) {
  return JSON.stringify({ page: pageZeroBased, perPage, search: searchQuery.trim() })
}

export function loadGuidebookItemSearch(
  searchQuery: string,
  pageZeroBased = 0,
  perPage = 50,
): Promise<WikiItemListResponse> {
  const key = itemSearchCacheKey(pageZeroBased, perPage, searchQuery)
  return itemSearchCache.load(key, () => fetchWikiItemsPage(pageZeroBased, perPage, searchQuery))
}

export function getGuidebookQuestsCached(perPage = 500): WikiQuestListItem[] | null {
  return questsCache.get(`all:${perPage}`) ?? null
}

export function loadGuidebookAllQuests(perPage = 500): Promise<WikiQuestListItem[]> {
  return questsCache.load(`all:${perPage}`, () => fetchAllWikiQuests(perPage))
}

function questSearchCacheKey(pageZeroBased: number, perPage: number, searchQuery: string) {
  return JSON.stringify({ page: pageZeroBased, perPage, search: searchQuery.trim() })
}

export function loadGuidebookQuestSearch(
  searchQuery: string,
  pageZeroBased = 0,
  perPage = 500,
): Promise<WikiQuestListResponse> {
  const key = questSearchCacheKey(pageZeroBased, perPage, searchQuery)
  return questSearchCache.load(key, () => fetchWikiQuestsPage(pageZeroBased, perPage, searchQuery))
}

export function getGuidebookMonsterDetailCached(id: string): WikiMonsterDetail | null {
  return monsterDetailCache.get(id) ?? null
}

export function loadGuidebookMonsterDetail(id: string): Promise<WikiMonsterDetail> {
  return monsterDetailCache.load(id, () => fetchWikiMonsterDetail(id))
}

export function getGuidebookQuestDetailCached(id: string): WikiQuestDetail | null {
  return questDetailCache.get(id) ?? null
}

export function loadGuidebookQuestDetail(id: string): Promise<WikiQuestDetail> {
  return questDetailCache.load(id, () => fetchWikiQuestDetail(id))
}

export function preloadGuidebookPortraitsFromNpc(npc: WikiNpcDetail) {
  preloadPortraitUrl(digimonPortraitUrl(npc.model_id, npc.id, npc.name))
}

export function getGuidebookNpcDetailCached(id: string): WikiNpcDetail | null {
  return npcDetailCache.get(id) ?? null
}

export function getGuidebookNpcPortraitUrl(npcId: string): string | undefined {
  const npc = getGuidebookNpcDetailCached(npcId)
  if (!npc) return undefined
  return digimonPortraitUrl(npc.model_id, npc.id, npc.name)
}

export function loadGuidebookNpcDetail(id: string): Promise<WikiNpcDetail> {
  return npcDetailCache.load(id, () =>
    fetchWikiNpcDetail(id).then((npc) => {
      preloadGuidebookPortraitsFromNpc(npc)
      return npc
    }),
  )
}
