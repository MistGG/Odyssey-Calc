import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { leaderboardEligibleParses, type PublicMeterParseRow } from './meterPublicStats'
import { fetchDigimonRoleMap } from './meterRoleBuckets'

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

/** Public leaderboard — always uses the anon role (not the signed-in JWT). */
export async function fetchPublicDungeonParses(): Promise<{
  rows: PublicMeterParseRow[]
  error: string | null
}> {
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
    .limit(2000)
  if (error) return { rows: [], error: error.message }
  return { rows: leaderboardEligibleParses((data ?? []) as PublicMeterParseRow[]), error: null }
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
    .limit(80)

  if (error) return { rows: [], error: error.message }
  return { rows: rowsOwnedByUser((data ?? []) as MeterParseRowDb[], userId), error: null }
}

export async function loadDigimonRoleMapForMeter(): Promise<Map<string, string>> {
  return fetchDigimonRoleMap()
}
