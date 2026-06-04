import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import {
  leaderboardEligibleParses,
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



const METER_PARSES_PUBLIC_TABLE = 'meter_parses_public'

const PUBLIC_PARSE_SELECT =
  'id, created_at, duration_sec, app_version, total_damage, hit_count, parse_kind, dungeon_id, dungeon_name, difficulty, difficulty_id, leaderboard_summary'

const FEED_PARSE_SELECT =
  'id, created_at, duration_sec, dungeon_id, dungeon_name, difficulty, difficulty_id, leaderboard_summary'



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

    global: {
      headers: {
        'x-odyssey-client': 'odyssey-calc',
      },
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



const PUBLIC_PARSE_LIMIT_PER_DUNGEON = 150
const GLOBAL_RECENT_PARSE_LIMIT = 80
const METER_PARSE_COUNT_CACHE_KEY = 'odyssey-meter-total-parses-v1'
const MY_METER_PARSES_LIMIT = 150
const MY_METER_PARSE_LIST_SELECT =
  'id, created_at, duration_sec, app_version, total_damage, hit_count, parse_kind, dungeon_id, dungeon_name, difficulty, difficulty_id, leaderboard_summary'
const MY_METER_PARSE_PAYLOAD_SELECT = 'id, payload'
const METER_TAMER_COUNT_CACHE_KEY = 'odyssey-meter-total-tamers-v1'
/** Site-wide stats scans are expensive; refresh at most once per day per browser. */
const METER_TAMER_COUNT_TTL_MS = 24 * 60 * 60 * 1000

const scopeRefreshInflight = new Map<string, Promise<ScopeParsesResult>>()
let globalRecentRefreshInflight: Promise<{ rows: PublicMeterParseRow[]; error: string | null }> | null =
  null

let myMeterParsesInflight: Promise<{ rows: PublicMeterParseRow[]; error: string | null }> | null = null
let myMeterParsesInflightUserId: string | null = null
const METER_ROLE_COUNT_CACHE_KEY = 'odyssey-meter-total-role-counts-v2'

/** Recent dungeon+difficulty for default leaderboard filters (no full payloads). */

export async function fetchRecentMeterParseSelection(

  allowedDungeonIds: Iterable<string>,

): Promise<MeterParseSelection | null> {

  const supabase = getMeterAnonSupabase()

  if (!supabase) return null

  const { data, error } = await supabase
    .from(METER_PARSES_PUBLIC_TABLE)
    .select('dungeon_id, difficulty_id, difficulty, created_at')

    .eq('parse_kind', 'dungeon_party')

    .gte('difficulty_id', 2)

    .order('created_at', { ascending: false })

    .limit(80)

  if (error || !data?.length) return null

  return mostRecentMeterParseSelectionFromColumns(data, allowedDungeonIds)
}

/** Default filters when only row columns are available (no payload). */
function mostRecentMeterParseSelectionFromColumns(
  rows: Array<{ dungeon_id?: string | null; difficulty_id?: number | null }>,
  allowedDungeonIds: Iterable<string>,
): MeterParseSelection | null {
  const allowed = new Set(allowedDungeonIds)
  for (const row of rows) {
    const dungeonId = row.dungeon_id?.trim()
    const difficultyId = row.difficulty_id ?? 0
    if (!dungeonId || !allowed.has(dungeonId) || difficultyId < 2) continue
    return { dungeonId, difficultyId }
  }
  return null

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

/** All stored parses for a scope (summary-backed public rows; no raw payload). */
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
    .from(METER_PARSES_PUBLIC_TABLE)
    .select(PUBLIC_PARSE_SELECT)
    .eq('parse_kind', 'dungeon_party')
    .eq('dungeon_id', dungeonId)
    .eq('difficulty_id', difficultyId)
    .not('leaderboard_summary', 'is', null)
    .order('created_at', { ascending: false })
    .limit(params.limit ?? PUBLIC_PARSE_LIMIT_PER_DUNGEON)

  if (error) return { rows: [], error: error.message }
  return { rows: feedRowsFromSummaryQuery((data ?? []) as FeedSummaryRow[]), error: null }
}

async function finalizeScopeParses(
  eligible: PublicMeterParseRow[],
  cacheKey: string,
  onUpdated?: (rows: PublicMeterParseRow[]) => void,
): Promise<PublicMeterParseRow[]> {
  setCachedScopeParses(cacheKey, eligible)
  onUpdated?.(eligible)
  return eligible
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

function refreshScopeParsesDeduped(
  params: FetchPublicDungeonParsesParams,
  cacheKey: string,
  onUpdated?: (rows: PublicMeterParseRow[]) => void,
): Promise<ScopeParsesResult> {
  const existing = scopeRefreshInflight.get(cacheKey)
  if (existing) return existing
  const promise = refreshScopeParses(params, cacheKey, onUpdated).finally(() => {
    scopeRefreshInflight.delete(cacheKey)
  })
  scopeRefreshInflight.set(cacheKey, promise)
  return promise
}

function refreshGlobalRecentParsesDeduped(
  limit: number,
  onUpdated?: (rows: PublicMeterParseRow[]) => void,
): Promise<{ rows: PublicMeterParseRow[]; error: string | null }> {
  if (globalRecentRefreshInflight) return globalRecentRefreshInflight
  globalRecentRefreshInflight = refreshGlobalRecentPublicParses(limit, onUpdated).finally(() => {
    globalRecentRefreshInflight = null
  })
  return globalRecentRefreshInflight
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
    .from(METER_PARSES_PUBLIC_TABLE)
    .select(FEED_PARSE_SELECT)
    .eq('parse_kind', 'dungeon_party')
    .gte('difficulty_id', 2)
    .not('leaderboard_summary', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return { rows: [], error: error.message }
  const rows = feedRowsFromSummaryQuery((data ?? []) as FeedSummaryRow[])
  onUpdated?.(rows)
  setCachedGlobalRecentParses(rows)
  onUpdated?.(rows)
  return { rows, error: null }
}

type FeedSummaryRow = {
  id: string
  created_at: string
  duration_sec: number | null
  dungeon_id: string | null
  dungeon_name: string | null
  difficulty: string | null
  difficulty_id: number | null
  leaderboard_summary: unknown
}

function feedRowsFromSummaryQuery(rows: FeedSummaryRow[]): PublicMeterParseRow[] {
  const out: PublicMeterParseRow[] = []
  for (const row of rows) {
    const summary = row.leaderboard_summary
    if (!summary || typeof summary !== 'object') continue
    const rawMembers = (summary as { members?: unknown }).members
    if (!Array.isArray(rawMembers) || !rawMembers.length) continue

    const durationSec = Math.max(row.duration_sec ?? 0, 1)
    const members = rawMembers.map((raw) => {
      const sm = raw as {
        playerKey?: string
        displayName?: string
        dps?: number
        digimonId?: string
        digimonName?: string
        iconId?: string | null
        portraitUrl?: string
      }
      const playerKey = sm.playerKey?.trim() ?? ''
      const dps = Number(sm.dps) || 0
      const digimonId = sm.digimonId?.trim() ?? ''
      const totalDamage = dps * durationSec
      return {
        memberKey: playerKey,
        displayLabel: sm.displayName?.trim() || playerKey,
        tamerName: sm.displayName?.trim() || playerKey,
        totalDamage,
        durationSec,
        skills: [],
        currentDigimonId: digimonId || null,
        currentDigimonName: sm.digimonName?.trim() || null,
        portraitIconId: sm.iconId ?? null,
        portraitUrl: sm.portraitUrl,
        digimons: digimonId
          ? [
              {
                digimonId,
                digimonName: sm.digimonName?.trim() ?? '',
                iconId: sm.iconId ?? null,
                portraitUrl: sm.portraitUrl,
                totalDamage,
                skills: [],
              },
            ]
          : [],
      }
    })

    out.push({
      id: row.id,
      created_at: row.created_at,
      duration_sec: row.duration_sec ?? 0,
      app_version: undefined,
      total_damage: undefined,
      hit_count: undefined,
      parse_kind: 'dungeon_party',
      dungeon_id: row.dungeon_id,
      dungeon_name: row.dungeon_name,
      difficulty: row.difficulty,
      difficulty_id: row.difficulty_id,
      payload: {
        schemaVersion: 3,
        kind: 'dungeon_party',
        capturedAtMs: new Date(row.created_at).getTime(),
        sessionDurationSec: durationSec,
        digimonNamesRequireWikiLookup: false,
        dungeon: {
          dungeonId: row.dungeon_id?.trim() ?? '',
          dungeonName: row.dungeon_name,
          difficulty: row.difficulty?.trim() ?? '',
          difficultyId: row.difficulty_id ?? 0,
          mapName: null,
          partyId: null,
          bossTargets: [],
          runOutcome: 'clear',
        },
        members,
      },
    })
  }
  return out
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
    return { rows: cached, error: null, fromCache: true }
  }

  return refreshScopeParsesDeduped(params, key, onUpdated)
}

export async function getGlobalRecentPublicParsesCached(
  limit = GLOBAL_RECENT_PARSE_LIMIT,
  onUpdated?: (rows: PublicMeterParseRow[]) => void,
): Promise<{ rows: PublicMeterParseRow[]; error: string | null }> {
  const cached = getCachedGlobalRecentParses()
  if (cached) {
    return { rows: cached.slice(0, limit), error: null }
  }

  return refreshGlobalRecentParsesDeduped(limit, onUpdated)
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
export async function fetchMeterSiteStats(): Promise<{
  totalParses: number
  uniqueTamers: number
  roleCounts: Record<MeterRoleBucket, number>
  error: string | null
}> {
  const emptyRoleCounts = METER_ROLE_BUCKETS.reduce(
    (acc, role) => ({ ...acc, [role]: 0 }),
    {} as Record<MeterRoleBucket, number>,
  )

  const cachedTamers = readCachedMeterTamerCount()
  const cachedParses = readCachedNumber(METER_PARSE_COUNT_CACHE_KEY)
  const cachedRoles = readCachedRoleCounts()
  if (cachedTamers != null && cachedParses != null && cachedRoles) {
    return {
      totalParses: cachedParses,
      uniqueTamers: cachedTamers,
      roleCounts: cachedRoles,
      error: null,
    }
  }

  const supabase = getMeterAnonSupabase()
  if (!supabase) {
    return { totalParses: 0, uniqueTamers: 0, roleCounts: emptyRoleCounts, error: 'Supabase is not configured.' }
  }

  const { data, error } = await supabase.rpc('get_meter_site_stats')
  if (error) {
    return { totalParses: 0, uniqueTamers: 0, roleCounts: emptyRoleCounts, error: error.message }
  }

  const raw = (data ?? {}) as {
    total_parses?: number
    unique_tamers?: number
    role_counts?: Record<string, number>
  }
  const totalParses = Math.max(0, Math.floor(Number(raw.total_parses) || 0))
  const uniqueTamers = Math.max(0, Math.floor(Number(raw.unique_tamers) || 0))
  const roleCounts = { ...emptyRoleCounts }
  for (const role of METER_ROLE_BUCKETS) {
    const n = raw.role_counts?.[role]
    roleCounts[role] = Number.isFinite(n) ? Math.max(0, Math.floor(n!)) : 0
  }

  writeCachedMeterTamerCount(uniqueTamers)
  writeCachedNumber(METER_PARSE_COUNT_CACHE_KEY, totalParses)
  writeCachedRoleCounts(roleCounts)

  return { totalParses, uniqueTamers, roleCounts, error: null }
}

/** @deprecated Prefer fetchMeterSiteStats — kept for callers migrating gradually. */
export async function fetchTotalMeterTamersParsed(): Promise<{ total: number; error: string | null }> {
  const res = await fetchMeterSiteStats()
  return { total: res.uniqueTamers, error: res.error }
}

/** @deprecated Prefer fetchMeterSiteStats */
export async function fetchTotalMeterParsesStored(): Promise<{ total: number; error: string | null }> {
  const res = await fetchMeterSiteStats()
  return { total: res.totalParses, error: res.error }
}

/** @deprecated Prefer fetchMeterSiteStats */
export async function fetchTotalMeterRoleCounts(): Promise<{
  counts: Record<MeterRoleBucket, number>
  error: string | null
}> {
  const res = await fetchMeterSiteStats()
  return { counts: res.roleCounts, error: res.error }
}

export type PlayerLeaderboardEntryRow = {
  parseId: string
  dungeonId: string
  difficultyId: number
  roleBucket: MeterRoleBucket
  playerKey: string
  displayName: string
  dps: number
  digimonId: string
  digimonName: string
  iconId: string | null
  portraitUrl?: string
  createdAt: string
}

const PLAYER_LEADERBOARD_SCAN_PAGE_SIZE = 1000
const PLAYER_LEADERBOARD_SCAN_MAX_ROWS = 500
const PLAYER_LEADERBOARD_RPC_LIMIT = 500

type PlayerLeaderboardRpcRow = {
  parse_id?: string | null
  created_at?: string
  role_bucket?: string | null
  player_key?: string | null
  display_name?: string | null
  dps?: number | null
  digimon_id?: string | null
  digimon_name?: string | null
  icon_id?: string | null
  portrait_url?: string | null
  dungeon_id?: string | null
  difficulty_id?: number | null
}

function mapPlayerLeaderboardRpcRow(
  row: PlayerLeaderboardRpcRow,
  fallbackKey: string,
): PlayerLeaderboardEntryRow | null {
  const role = row.role_bucket?.trim() as MeterRoleBucket | undefined
  if (!role || !METER_ROLE_BUCKETS.includes(role)) return null
  const parseId = row.parse_id?.trim?.() ?? String(row.parse_id ?? '').trim()
  const dungeonId = row.dungeon_id?.trim() ?? ''
  const difficultyId = row.difficulty_id ?? 0
  if (!parseId || !dungeonId || difficultyId < 2) return null
  const dps = Number(row.dps) || 0
  if (dps <= 0) return null
  const key = row.player_key?.trim().toLowerCase() ?? fallbackKey
  return {
    parseId,
    dungeonId,
    difficultyId,
    roleBucket: role,
    playerKey: key,
    displayName: row.display_name?.trim() || key,
    dps,
    digimonId: row.digimon_id?.trim() ?? '',
    digimonName: row.digimon_name?.trim() ?? '',
    iconId: row.icon_id ?? null,
    portraitUrl: row.portrait_url ?? undefined,
    createdAt: row.created_at ?? '',
  }
}

/** All precomputed leaderboard rows for one tamer (small columns, no parse payloads). */
export async function fetchPlayerMeterLeaderboardEntries(
  playerKey: string,
): Promise<{ entries: PlayerLeaderboardEntryRow[]; error: string | null }> {
  const supabase = getMeterAnonSupabase()
  if (!supabase) return { entries: [], error: 'Supabase is not configured.' }

  const key = playerKey.trim().toLowerCase()
  if (!key) return { entries: [], error: null }

  const { data, error } = await supabase.rpc('get_meter_player_leaderboard_entries', {
    p_player_key: key,
    p_limit: PLAYER_LEADERBOARD_RPC_LIMIT,
  })

  if (!error && data?.length) {
    const entries: PlayerLeaderboardEntryRow[] = []
    for (const row of data as PlayerLeaderboardRpcRow[]) {
      const mapped = mapPlayerLeaderboardRpcRow(row, key)
      if (mapped) entries.push(mapped)
    }
    return { entries, error: null }
  }

  if (error && !/could not find the function|schema cache/i.test(error.message)) {
    return { entries: [], error: error.message }
  }

  const entries: PlayerLeaderboardEntryRow[] = []
  let offset = 0

  while (offset < PLAYER_LEADERBOARD_SCAN_MAX_ROWS) {
    const to = offset + PLAYER_LEADERBOARD_SCAN_PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('meter_leaderboard_entries')
      .select(
        'parse_id, created_at, role_bucket, player_key, display_name, dps, digimon_id, digimon_name, icon_id, portrait_url, dungeon_id, difficulty_id',
      )
      .eq('player_key', key)
      .gte('difficulty_id', 2)
      .order('created_at', { ascending: false })
      .range(offset, to)

    if (error) return { entries: [], error: error.message }
    const page = (data ?? []) as Array<{
      parse_id?: string | null
      created_at?: string
      role_bucket?: string | null
      player_key?: string | null
      display_name?: string | null
      dps?: number | null
      digimon_id?: string | null
      digimon_name?: string | null
      icon_id?: string | null
      portrait_url?: string | null
      dungeon_id?: string | null
      difficulty_id?: number | null
    }>
    if (!page.length) break

    for (const row of page) {
      const role = row.role_bucket?.trim() as MeterRoleBucket | undefined
      if (!role || !METER_ROLE_BUCKETS.includes(role)) continue
      const parseId = row.parse_id?.trim() ?? ''
      const dungeonId = row.dungeon_id?.trim() ?? ''
      const difficultyId = row.difficulty_id ?? 0
      if (!parseId || !dungeonId || difficultyId < 2) continue
      const dps = Number(row.dps) || 0
      if (dps <= 0) continue
      entries.push({
        parseId,
        dungeonId,
        difficultyId,
        roleBucket: role,
        playerKey: row.player_key?.trim().toLowerCase() ?? key,
        displayName: row.display_name?.trim() || key,
        dps,
        digimonId: row.digimon_id?.trim() ?? '',
        digimonName: row.digimon_name?.trim() ?? '',
        iconId: row.icon_id ?? null,
        portraitUrl: row.portrait_url ?? undefined,
        createdAt: row.created_at ?? '',
      })
    }

    if (page.length < PLAYER_LEADERBOARD_SCAN_PAGE_SIZE) break
    offset += PLAYER_LEADERBOARD_SCAN_PAGE_SIZE
  }

  return { entries, error: null }
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

/** Signed-in user's uploads — metadata only (no payloads). Use fetchMyMeterParsePayload for replay. */
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

  if (myMeterParsesInflight && myMeterParsesInflightUserId === userId) {
    return myMeterParsesInflight
  }

  myMeterParsesInflightUserId = userId
  myMeterParsesInflight = (async () => {
    const { data, error } = await supabase
      .from('meter_parses')
      .select(`${MY_METER_PARSE_LIST_SELECT}, user_id`)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(MY_METER_PARSES_LIMIT)

    if (error) return { rows: [], error: error.message }

    const owned = rowsOwnedByUser((data ?? []) as MeterParseRowDb[], userId).map((row) => ({
      ...row,
      payload: null,
    }))
    return { rows: owned, error: null }
  })().finally(() => {
    myMeterParsesInflight = null
    myMeterParsesInflightUserId = null
  })

  return myMeterParsesInflight
}

/** Fetch one owned parse payload for replay (lazy load on expand). */
export async function fetchMyMeterParsePayload(
  supabase: SupabaseClient | null,
  parseId: string,
): Promise<{ row: PublicMeterParseRow | null; error: string | null }> {
  if (!supabase) return { row: null, error: null }

  const id = parseId.trim()
  if (!id) return { row: null, error: null }

  const { data: authData, error: authError } = await supabase.auth.getUser()
  const userId = authData.user?.id
  if (authError || !userId) return { row: null, error: null }

  const { data, error } = await supabase
    .from('meter_parses')
    .select(`${MY_METER_PARSE_PAYLOAD_SELECT}, user_id`)
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) return { row: null, error: error.message }
  if (!data) return { row: null, error: null }

  const dbRow = data as MeterParseRowDb
  if (dbRow.user_id !== userId) return { row: null, error: null }

  const { user_id: _omit, ...rest } = dbRow
  const rows = await resolveMeterParseRowPayloads([rest as PublicMeterParseRow])
  return { row: rows[0] ?? null, error: null }
}



export async function loadDigimonRoleMapForMeter(): Promise<Map<string, string>> {

  return fetchDigimonRoleMap()

}


