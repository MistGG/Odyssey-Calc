import type { SupabaseClient } from '@supabase/supabase-js'

import {
  fetchPlayerHallOfFameForCycle,
  fetchPlayerHofCycleCountsMap,
  METER_HOF_PROFILE_SCOPE_LIMIT,
} from './meterHallOfFame'
import { getMeterLeaderboardCycle } from './meterLeaderboardCycles'
import { normalizeRoutePlayerKey } from './meterPlayerProfile'
import { fetchStoredConfirmedPlayerKey } from './meterPointGrants'
import type { OlympusHofBreakForGrant } from './meterPointGrants'
import type { WikiDungeonListItem } from '../types/wikiApi'
import {
  HALL_OF_FAME_THEME_ID,
  MAGIA_HALL_OF_FAME_THEME_ID,
  type MeterPartyBarThemeId,
} from './meterPartyBarThemes'

/** Demo record count for shop / theme previews. */
export const HOF_PREVIEW_DEMO_RECORD_COUNT = 7

function hofThemeCycleId(themeId: MeterPartyBarThemeId): string | null {
  if (themeId === HALL_OF_FAME_THEME_ID) return 'olympus'
  if (themeId === MAGIA_HALL_OF_FAME_THEME_ID) return 'magia'
  return null
}

/** Break count for a HoF reward theme card (Olympus vs Magia cycle). */
export function hofRecordCountForThemeId(
  themeId: MeterPartyBarThemeId,
  counts: Record<string, number>,
): number {
  const cycleId = hofThemeCycleId(themeId)
  if (!cycleId) return 0
  return counts[cycleId] ?? 0
}

/** Induction count for a cycle — reads meter_hof_cycle_player_summary. */
export async function fetchMeterPlayerHofRecordCount(
  _client: SupabaseClient,
  playerKey: string,
  options?: { cycleId?: string },
): Promise<{ count: number; error: string | null }> {
  const key = playerKey.trim().toLowerCase()
  if (!key) return { count: 0, error: null }

  const cycleId = options?.cycleId?.trim() || 'magia'
  const { counts, error } = await fetchPlayerHofCycleCountsMap(key)
  if (error) return { count: 0, error }

  return { count: counts[cycleId] ?? 0, error: null }
}

export async function fetchMeterPlayerHofRecordCountForTheme(
  client: SupabaseClient,
  playerKey: string,
  themeId: MeterPartyBarThemeId,
): Promise<{ count: number; error: string | null }> {
  const cycleId = hofThemeCycleId(themeId)
  if (!cycleId) return { count: 0, error: null }
  return fetchMeterPlayerHofRecordCount(client, playerKey, { cycleId })
}

export async function fetchMeterPlayerHofRecordCountsByCycle(
  _client: SupabaseClient,
  playerKey: string,
): Promise<{ counts: Record<string, number>; error: string | null }> {
  return fetchPlayerHofCycleCountsMap(playerKey)
}

/** Olympus-cycle record breaks used for shop point grants (2 pts each). */
export async function fetchOlympusHofBreaksForPointGrants(
  playerKey: string,
  wikiDungeons: WikiDungeonListItem[],
): Promise<{ breaks: OlympusHofBreakForGrant[]; error: string | null }> {
  const key = playerKey.trim().toLowerCase()
  if (!key) return { breaks: [], error: null }

  const cycle = getMeterLeaderboardCycle('olympus')
  if (!cycle) return { breaks: [], error: null }

  const { summary, error } = await fetchPlayerHallOfFameForCycle(key, wikiDungeons, cycle, {
    maxScopes: METER_HOF_PROFILE_SCOPE_LIMIT,
  })
  if (error) return { breaks: [], error }

  const breaks = summary.entries.map((entry) => ({
    parseId: entry.parseId,
    dungeonId: entry.dungeonId,
    difficultyId: entry.difficultyId,
    roleBucket: entry.roleBucket,
  }))
  return { breaks, error: null }
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
