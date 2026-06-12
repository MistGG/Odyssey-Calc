import type { SupabaseClient } from '@supabase/supabase-js'

import { fetchPlayerHallOfFameEntries } from './meterHallOfFame'
import { normalizeRoutePlayerKey } from './meterPlayerProfile'
import { fetchStoredConfirmedPlayerKey } from './meterPointGrants'
import { loadWikiDungeonsForMeter } from './wikiDungeons'

/** Matches `get_meter_player_scopes` RPC cap (50). */
const HOF_SCOPE_LIMIT = 50

/** Demo record count for shop / theme previews. */
export const HOF_PREVIEW_DEMO_RECORD_COUNT = 7

/** Induction count — same rules as the profile page (excludes self-record improvements). */
export async function fetchMeterPlayerHofRecordCount(
  _client: SupabaseClient,
  playerKey: string,
): Promise<{ count: number; error: string | null }> {
  const key = playerKey.trim().toLowerCase()
  if (!key) return { count: 0, error: null }

  const dungeons = await loadWikiDungeonsForMeter().catch(() => [])
  const { entries, error } = await fetchPlayerHallOfFameEntries(key, dungeons, {
    maxScopes: HOF_SCOPE_LIMIT,
  })
  return { count: entries.length, error }
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
