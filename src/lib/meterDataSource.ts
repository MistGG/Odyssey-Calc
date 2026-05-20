import type { SupabaseClient } from '@supabase/supabase-js'
import { leaderboardEligibleParses, type PublicMeterParseRow } from './meterPublicStats'
import { fetchDigimonRoleMap } from './meterRoleBuckets'

const PARSE_SELECT =
  'id, created_at, duration_sec, app_version, total_damage, hit_count, payload, parse_kind, dungeon_id, dungeon_name, difficulty, difficulty_id'

export async function fetchPublicDungeonParses(
  supabase: SupabaseClient | null,
): Promise<{ rows: PublicMeterParseRow[]; error: string | null }> {
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
  if (error) {
    const msg = error.message
    if (/permission denied/i.test(msg)) {
      return {
        rows: [],
        error:
          'Meter leaderboard is not readable yet. In Supabase SQL Editor, run supabase/meter_parses_public_leaderboard.sql from the Odyssey-Calc repo.',
      }
    }
    return { rows: [], error: msg }
  }
  return { rows: leaderboardEligibleParses((data ?? []) as PublicMeterParseRow[]), error: null }
}

export async function fetchMyMeterParses(
  supabase: SupabaseClient | null,
  userId: string | undefined,
): Promise<{ rows: PublicMeterParseRow[]; error: string | null }> {
  if (!supabase || !userId) {
    return { rows: [], error: null }
  }
  const { data, error } = await supabase
    .from('meter_parses')
    .select(PARSE_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(80)
  if (error) return { rows: [], error: error.message }
  return { rows: (data ?? []) as PublicMeterParseRow[], error: null }
}

export async function loadDigimonRoleMapForMeter(): Promise<Map<string, string>> {
  return fetchDigimonRoleMap()
}
