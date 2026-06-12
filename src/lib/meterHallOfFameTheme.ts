import type { SupabaseClient } from '@supabase/supabase-js'

import { normalizeRoutePlayerKey } from './meterPlayerProfile'
import { fetchStoredConfirmedPlayerKey } from './meterPointGrants'

const HOF_SCOPE_LIMIT = 48

/** Demo record count for shop / theme previews. */
export const HOF_PREVIEW_DEMO_RECORD_COUNT = 7

export async function fetchMeterPlayerHofRecordCount(
  client: SupabaseClient,
  playerKey: string,
): Promise<{ count: number; error: string | null }> {
  const key = playerKey.trim().toLowerCase()
  if (!key) return { count: 0, error: null }

  const { data, error } = await client.rpc('get_meter_player_hof_gold_breaks', {
    p_player_key: key,
    p_scope_limit: HOF_SCOPE_LIMIT,
  })

  if (error) return { count: 0, error: error.message }
  return { count: (data ?? []).length, error: null }
}

export async function resolveMeterPlayerKeyForHof(
  client: SupabaseClient,
  profileDisplayName: string | null,
): Promise<string | null> {
  const stored = await fetchStoredConfirmedPlayerKey(client)
  if (stored) return stored
  const name = profileDisplayName?.trim()
  return name ? normalizeRoutePlayerKey(name) : null
}

export function userQualifiesForHallOfFameTheme(recordCount: number): boolean {
  return recordCount > 0
}
