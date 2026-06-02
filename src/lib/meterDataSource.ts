import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import {
  leaderboardEligibleParses,
  mostRecentMeterParseSelection,
  type MeterParseSelection,
  type PublicMeterParseRow,
} from './meterPublicStats'
import { METER_ROLE_BUCKETS, type MeterRoleBucket } from './meterRoleBuckets'

import {
  getCachedGlobalRecentParses,
  getCachedScopeParses,
  meterScopeKey,
  setCachedGlobalRecentParses,
  setCachedScopeParses,
} from './meterParseCache'
import { resolveMeterParseRowPayloads } from './meterParseDigimonNames'
import { fetchDigimonRoleMap } from './meterRoleBuckets'
import { mapPool } from './meterPlayerProfile'
import type { MeterUploadScope } from './meterScopeList'



const PARSE_SELECT =

  'id, created_at, duration_sec, app_version, total_damage, hit_count, payload, parse_kind, dungeon_id, dungeon_name, difficulty, difficulty_id'



/** Anon-only client (no session). Used for public leaderboard so signed-in users do not inherit broad SELECT RLS. */

let meterAnonClient: SupabaseClient | null | undefined



export function getMeterAnonSupabase(): SupabaseClient | null {

  if (meterAnonClient !== undefined) return meterAnonClient

  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()

  const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

  if (!url || !key) {

    meterAnonClient = null

    return null

  }

  meterAnonClient = createClient(url, key, {

    auth: {

      persistSession: false,

      autoRefreshToken: false,

      detectSessionInUrl: false,

    },

  })

  return meterAnonClient

}



export function isMeterSupabaseConfigured(): boolean {

  return getMeterAnonSupabase() != null

}



type MeterParseRowDb = PublicMeterParseRow & { user_id?: string }



function rowsOwnedByUser(rows: MeterParseRowDb[], userId: string): PublicMeterParseRow[] {

  return rows

    .filter((r) => r.user_id === userId)

    .map(({ user_id: _omit, ...rest }) => rest)

}



const PUBLIC_PARSE_LIMIT_PER_DUNGEON = 500
const GLOBAL_RECENT_PARSE_LIMIT = 400
/** Max signed-in uploads considered for meter point grants (shop / rewards sync). */
const MY_METER_PARSES_LIMIT = 150
const METER_TAMER_COUNT_CACHE_KEY = 'odyssey-meter-total-tamers-v1'
const METER_TAMER_COUNT_TTL_MS = 10 * 60 * 1000
const METER_TAMER_SCAN_PAGE_SIZE = 1000
const METER_TAMER_SCAN_MAX_ROWS = 200_000
const METER_PARSE_COUNT_CACHE_KEY = 'odyssey-meter-total-parses-v1'
const METER_ROLE_COUNT_CACHE_KEY = 'odyssey-meter-total-role-counts-v2'

/** Recent dungeon+difficulty for default leaderboard filters (no full payloads). */

export async function fetchRecentMeterParseSelection(

  allowedDungeonIds: Iterable<string>,

): Promise<MeterParseSelection | null> {

  const supabase = getMeterAnonSupabase()

  if (!supabase) return null

  const { data, error } = await supabase

    .from('meter_parses')

    .select('dungeon_id, difficulty_id, difficulty, payload, created_at, duration_sec, app_version')

    .eq('parse_kind', 'dungeon_party')

    .gte('difficulty_id', 2)

    .order('created_at', { ascending: false })

    .limit(80)

  if (error || !data?.length) return null

  return mostRecentMeterParseSelection(data as PublicMeterParseRow[], allowedDungeonIds)

}

export type FetchPublicDungeonParsesParams = {
  dungeonId: string
  difficultyId: number
  limit?: number
}

export type ScopeParsesResult = {
  rows: PublicMeterParseRow[]
  error: string | null
  fromCache?: boolean
}

/** Eligible dungeon parses for one scope (used by leaderboard fallback and HoF history). */
export async function fetchScopeEligibleParses(
  params: FetchPublicDungeonParsesParams,
): Promise<{ rows: PublicMeterParseRow[]; error: string | null }> {
  const res = await fetchScopeParsesRaw(params)
  if (res.error) return res
  return { rows: leaderboardEligibleParses(res.rows), error: null }
}

/** All stored parses for a scope (includes ineligible — used for dual-meter supersession). */
export async function fetchScopeParsesRaw(
  params: FetchPublicDungeonParsesParams,
): Promise<{ rows: PublicMeterParseRow[]; error: string | null }> {
  const supabase = getMeterAnonSupabase()
  if (!supabase) {
    return { rows: [], error: 'Supabase is not configured.' }
  }

  const dungeonId = params.dungeonId.trim()
  const difficultyId = params.difficultyId
  if (!dungeonId || difficultyId < 2) {
    return { rows: [], error: 'Select a dungeon and difficulty.' }
  }

  const { data, error } = await supabase
    .from('meter_parses')
    .select(PARSE_SELECT)
    .eq('parse_kind', 'dungeon_party')
    .eq('dungeon_id', dungeonId)
    .eq('difficulty_id', difficultyId)
    .order('created_at', { ascending: false })
    .limit(params.limit ?? PUBLIC_PARSE_LIMIT_PER_DUNGEON)

  if (error) return { rows: [], error: error.message }
  return { rows: (data ?? []) as PublicMeterParseRow[], error: null }
}

async function finalizeScopeParses(
  eligible: PublicMeterParseRow[],
  cacheKey: string,
  onUpdated?: (rows: PublicMeterParseRow[]) => void,
): Promise<PublicMeterParseRow[]> {
  if (!eligible.length) {
    setCachedScopeParses(cacheKey, eligible)
    onUpdated?.(eligible)
    return eligible
  }
  onUpdated?.(eligible)
  const resolved = await resolveMeterParseRowPayloads(eligible)
  setCachedScopeParses(cacheKey, resolved)
  onUpdated?.(resolved)
  return resolved
}

async function refreshScopeParses(
  params: FetchPublicDungeonParsesParams,
  cacheKey: string,
  onUpdated?: (rows: PublicMeterParseRow[]) => void,
): Promise<ScopeParsesResult> {
  const db = await fetchScopeEligibleParses(params)
  if (db.error) return { rows: [], error: db.error, fromCache: false }
  const rows = await finalizeScopeParses(db.rows, cacheKey, onUpdated)
  return { rows, error: null, fromCache: false }
}

/** Public leaderboard for one dungeon + difficulty (anon role, not signed-in JWT). */
export async function fetchPublicDungeonParses(
  params: FetchPublicDungeonParsesParams,
): Promise<{
  rows: PublicMeterParseRow[]
  error: string | null
}> {
  const db = await fetchScopeEligibleParses(params)
  if (db.error) return db
  const rows = await resolveMeterParseRowPayloads(db.rows)
  return { rows, error: null }
}

async function refreshGlobalRecentPublicParses(
  limit: number,
  onUpdated?: (rows: PublicMeterParseRow[]) => void,
): Promise<{ rows: PublicMeterParseRow[]; error: string | null }> {
  const supabase = getMeterAnonSupabase()
  if (!supabase) {
    return { rows: [], error: 'Supabase is not configured.' }
  }

  const { data, error } = await supabase
    .from('meter_parses')
    .select(PARSE_SELECT)
    .eq('parse_kind', 'dungeon_party')
    .gte('difficulty_id', 2)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return { rows: [], error: error.message }
  const eligible = leaderboardEligibleParses((data ?? []) as PublicMeterParseRow[])
  onUpdated?.(eligible)
  const rows = await resolveMeterParseRowPayloads(eligible)
  setCachedGlobalRecentParses(rows)
  onUpdated?.(rows)
  return { rows, error: null }
}

/** Recent public party parses across all dungeons (profile fast tier). */
export async function fetchGlobalRecentPublicParses(
  limit = GLOBAL_RECENT_PARSE_LIMIT,
): Promise<{ rows: PublicMeterParseRow[]; error: string | null }> {
  return refreshGlobalRecentPublicParses(limit)
}

/**
 * Cached public parses for one dungeon scope.
 * Returns session cache immediately when available, revalidates in the background,
 * and streams row updates via `onUpdated` (Supabase rows first, wiki names second).
 */
export async function getPublicDungeonParsesCached(
  params: FetchPublicDungeonParsesParams,
  onUpdated?: (rows: PublicMeterParseRow[]) => void,
): Promise<ScopeParsesResult> {
  const dungeonId = params.dungeonId.trim()
  const difficultyId = params.difficultyId
  const key = meterScopeKey(dungeonId, difficultyId)
  const cached = getCachedScopeParses(key)
  if (cached) {
    void refreshScopeParses(params, key, onUpdated)
    return { rows: cached, error: null, fromCache: true }
  }

  return refreshScopeParses(params, key, onUpdated)
}

export async function getGlobalRecentPublicParsesCached(
  limit = GLOBAL_RECENT_PARSE_LIMIT,
  onUpdated?: (rows: PublicMeterParseRow[]) => void,
): Promise<{ rows: PublicMeterParseRow[]; error: string | null }> {
  const cached = getCachedGlobalRecentParses()
  if (cached) {
    void refreshGlobalRecentPublicParses(limit, onUpdated)
    return { rows: cached.slice(0, limit), error: null }
  }

  return refreshGlobalRecentPublicParses(limit, onUpdated)
}

type MeterTamerCountCache = {
  value: number
  fetchedAt: number
}

function readCachedMeterTamerCount(): number | null {
  try {
    const raw = sessionStorage.getItem(METER_TAMER_COUNT_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as MeterTamerCountCache
    if (!Number.isFinite(parsed.value) || !Number.isFinite(parsed.fetchedAt)) return null
    if (Date.now() - parsed.fetchedAt > METER_TAMER_COUNT_TTL_MS) return null
    return Math.max(0, Math.floor(parsed.value))
  } catch {
    return null
  }
}

function writeCachedMeterTamerCount(value: number): void {
  try {
    const payload: MeterTamerCountCache = {
      value: Math.max(0, Math.floor(value)),
      fetchedAt: Date.now(),
    }
    sessionStorage.setItem(METER_TAMER_COUNT_CACHE_KEY, JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}

function readCachedNumber(key: string): number | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as MeterTamerCountCache
    if (!Number.isFinite(parsed.value) || !Number.isFinite(parsed.fetchedAt)) return null
    if (Date.now() - parsed.fetchedAt > METER_TAMER_COUNT_TTL_MS) return null
    return Math.max(0, Math.floor(parsed.value))
  } catch {
    return null
  }
}

function writeCachedNumber(key: string, value: number): void {
  try {
    const payload: MeterTamerCountCache = {
      value: Math.max(0, Math.floor(value)),
      fetchedAt: Date.now(),
    }
    sessionStorage.setItem(key, JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}

type MeterRoleCountCache = {
  value: Record<MeterRoleBucket, number>
  fetchedAt: number
}

function readCachedRoleCounts(): Record<MeterRoleBucket, number> | null {
  try {
    const raw = sessionStorage.getItem(METER_ROLE_COUNT_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as MeterRoleCountCache
    if (!parsed?.value || !Number.isFinite(parsed.fetchedAt)) return null
    if (Date.now() - parsed.fetchedAt > METER_TAMER_COUNT_TTL_MS) return null
    const out = {} as Record<MeterRoleBucket, number>
    for (const role of METER_ROLE_BUCKETS) {
      const n = parsed.value[role]
      out[role] = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
    }
    return out
  } catch {
    return null
  }
}

function writeCachedRoleCounts(value: Record<MeterRoleBucket, number>): void {
  try {
    const payload: MeterRoleCountCache = { value, fetchedAt: Date.now() }
    sessionStorage.setItem(METER_ROLE_COUNT_CACHE_KEY, JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}

/** Unique player keys present in precomputed leaderboard entries (all-time). */
export async function fetchTotalMeterTamersParsed(): Promise<{ total: number; error: string | null }> {
  const cached = readCachedMeterTamerCount()
  if (cached != null) return { total: cached, error: null }

  const supabase = getMeterAnonSupabase()
  if (!supabase) return { total: 0, error: 'Supabase is not configured.' }

  const keys = new Set<string>()
  let offset = 0

  while (offset < METER_TAMER_SCAN_MAX_ROWS) {
    const to = offset + METER_TAMER_SCAN_PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('meter_leaderboard_entries')
      .select('player_key, created_at')
      .order('created_at', { ascending: false })
      .range(offset, to)

    if (error) return { total: 0, error: error.message }
    const rows = (data ?? []) as Array<{ player_key?: string | null }>
    if (!rows.length) break

    for (const row of rows) {
      const key = row.player_key?.trim().toLowerCase()
      if (key) keys.add(key)
    }

    if (rows.length < METER_TAMER_SCAN_PAGE_SIZE) break
    offset += METER_TAMER_SCAN_PAGE_SIZE
  }

  const total = keys.size
  writeCachedMeterTamerCount(total)
  return { total, error: null }
}

/** All stored dungeon-party parses count. */
export async function fetchTotalMeterParsesStored(): Promise<{ total: number; error: string | null }> {
  const cached = readCachedNumber(METER_PARSE_COUNT_CACHE_KEY)
  if (cached != null) return { total: cached, error: null }

  const supabase = getMeterAnonSupabase()
  if (!supabase) return { total: 0, error: 'Supabase is not configured.' }
  const { count, error } = await supabase
    .from('meter_parses')
    .select('id', { count: 'exact', head: true })
    .eq('parse_kind', 'dungeon_party')
  if (error) return { total: 0, error: error.message }
  const total = Math.max(0, count ?? 0)
  writeCachedNumber(METER_PARSE_COUNT_CACHE_KEY, total)
  return { total, error: null }
}

/** All-time role entry counts from precomputed leaderboard rows. */
export async function fetchTotalMeterRoleCounts(): Promise<{
  counts: Record<MeterRoleBucket, number>
  error: string | null
}> {
  const cached = readCachedRoleCounts()
  if (cached) return { counts: cached, error: null }

  const supabase = getMeterAnonSupabase()
  if (!supabase) {
    return {
      counts: METER_ROLE_BUCKETS.reduce(
        (acc, role) => ({ ...acc, [role]: 0 }),
        {} as Record<MeterRoleBucket, number>,
      ),
      error: 'Supabase is not configured.',
    }
  }

  const uniqueByRole = METER_ROLE_BUCKETS.reduce(
    (acc, role) => ({ ...acc, [role]: new Set<string>() }),
    {} as Record<MeterRoleBucket, Set<string>>,
  )

  let offset = 0
  while (offset < METER_TAMER_SCAN_MAX_ROWS) {
    const to = offset + METER_TAMER_SCAN_PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('meter_leaderboard_entries')
      .select('role_bucket, player_key, created_at')
      .order('created_at', { ascending: false })
      .range(offset, to)
    if (error) {
      return {
        counts: METER_ROLE_BUCKETS.reduce(
          (acc, role) => ({ ...acc, [role]: 0 }),
          {} as Record<MeterRoleBucket, number>,
        ),
        error: error.message,
      }
    }
    const rows = (data ?? []) as Array<{ role_bucket?: string | null; player_key?: string | null }>
    if (!rows.length) break

    for (const row of rows) {
      const role = row.role_bucket?.trim() as MeterRoleBucket | undefined
      const key = row.player_key?.trim().toLowerCase()
      if (!role || !key) continue
      if (!METER_ROLE_BUCKETS.includes(role)) continue
      uniqueByRole[role].add(key)
    }

    if (rows.length < METER_TAMER_SCAN_PAGE_SIZE) break
    offset += METER_TAMER_SCAN_PAGE_SIZE
  }

  const counts = {} as Record<MeterRoleBucket, number>
  for (const role of METER_ROLE_BUCKETS) counts[role] = uniqueByRole[role].size
  writeCachedRoleCounts(counts)
  return { counts, error: null }
}

export async function fetchAllScopeParsesCached(
  scopes: MeterUploadScope[],
  concurrency = 4,
  onProgress?: (done: number, total: number) => void,
): Promise<{ rows: PublicMeterParseRow[]; error: string | null }> {
  const byId = new Map<string, PublicMeterParseRow>()
  let firstError: string | null = null
  let done = 0

  await mapPool(scopes, concurrency, async (scope) => {
    const res = await getPublicDungeonParsesCached({
      dungeonId: scope.dungeonId,
      difficultyId: scope.difficultyId,
    })
    done += 1
    onProgress?.(done, scopes.length)
    if (res.error && !firstError) firstError = res.error
    for (const row of res.rows) {
      if (!byId.has(row.id)) byId.set(row.id, row)
    }
  })

  return { rows: [...byId.values()], error: firstError }
}

/** Signed-in user's uploads only (session uid + server filter + client verification). */

export async function fetchMyMeterParses(

  supabase: SupabaseClient | null,

): Promise<{ rows: PublicMeterParseRow[]; error: string | null }> {

  if (!supabase) {

    return { rows: [], error: null }

  }

  const { data: authData, error: authError } = await supabase.auth.getUser()

  const userId = authData.user?.id

  if (authError || !userId) {

    return { rows: [], error: null }

  }



  const { data, error } = await supabase

    .from('meter_parses')

    .select(`${PARSE_SELECT}, user_id`)

    .eq('user_id', userId)

    .order('created_at', { ascending: false })

    .limit(MY_METER_PARSES_LIMIT)



  if (error) return { rows: [], error: error.message }

  const owned = rowsOwnedByUser((data ?? []) as MeterParseRowDb[], userId)
  const rows = await resolveMeterParseRowPayloads(owned)
  return { rows, error: null }

}



export async function loadDigimonRoleMapForMeter(): Promise<Map<string, string>> {

  return fetchDigimonRoleMap()

}


