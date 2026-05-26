import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import {
  leaderboardEligibleParses,
  mostRecentMeterParseSelection,
  type MeterParseSelection,
  type PublicMeterParseRow,
} from './meterPublicStats'

import {
  getCachedGlobalRecentParses,
  getCachedScopeParses,
  meterScopeKey,
  setCachedGlobalRecentParses,
  setCachedScopeParses,
} from './meterParseCache'
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

/** Recent dungeon+difficulty for default leaderboard filters (no full payloads). */

export async function fetchRecentMeterParseSelection(

  allowedDungeonIds: Iterable<string>,

): Promise<MeterParseSelection | null> {

  const supabase = getMeterAnonSupabase()

  if (!supabase) return null

  const { data, error } = await supabase

    .from('meter_parses')

    .select('dungeon_id, difficulty_id, difficulty, payload, created_at')

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

/** Public leaderboard for one dungeon + difficulty (anon role, not signed-in JWT). */

export async function fetchPublicDungeonParses(

  params: FetchPublicDungeonParsesParams,

): Promise<{

  rows: PublicMeterParseRow[]

  error: string | null

}> {

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

  return { rows: leaderboardEligibleParses((data ?? []) as PublicMeterParseRow[]), error: null }

}

/** Recent public party parses across all dungeons (profile fast tier). */
export async function fetchGlobalRecentPublicParses(
  limit = GLOBAL_RECENT_PARSE_LIMIT,
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
  return { rows: leaderboardEligibleParses((data ?? []) as PublicMeterParseRow[]), error: null }
}

export async function getPublicDungeonParsesCached(
  params: FetchPublicDungeonParsesParams,
): Promise<{ rows: PublicMeterParseRow[]; error: string | null }> {
  const dungeonId = params.dungeonId.trim()
  const difficultyId = params.difficultyId
  const key = meterScopeKey(dungeonId, difficultyId)
  const cached = getCachedScopeParses(key)
  if (cached) return { rows: cached, error: null }

  const res = await fetchPublicDungeonParses(params)
  if (!res.error) setCachedScopeParses(key, res.rows)
  return res
}

export async function getGlobalRecentPublicParsesCached(
  limit = GLOBAL_RECENT_PARSE_LIMIT,
): Promise<{ rows: PublicMeterParseRow[]; error: string | null }> {
  const cached = getCachedGlobalRecentParses()
  if (cached) return { rows: cached, error: null }

  const res = await fetchGlobalRecentPublicParses(limit)
  if (!res.error) setCachedGlobalRecentParses(res.rows)
  return res
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

  return { rows: rowsOwnedByUser((data ?? []) as MeterParseRowDb[], userId), error: null }

}



export async function loadDigimonRoleMapForMeter(): Promise<Map<string, string>> {

  return fetchDigimonRoleMap()

}


