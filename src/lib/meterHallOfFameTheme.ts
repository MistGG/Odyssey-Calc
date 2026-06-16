import type { SupabaseClient } from '@supabase/supabase-js'

import {
  fetchPlayerHallOfFameByCycles,
  fetchPlayerHallOfFameEntries,
  fetchPlayerHallOfFameForCycle,
  METER_HOF_PROFILE_SCOPE_LIMIT,
} from './meterHallOfFame'
import {
  getMeterLeaderboardCycle,
  meterLeaderboardCycleWindow,
} from './meterLeaderboardCycles'
import { normalizeRoutePlayerKey } from './meterPlayerProfile'
import { fetchStoredConfirmedPlayerKey } from './meterPointGrants'
import type { OlympusHofBreakForGrant } from './meterPointGrants'
import type { WikiDungeonListItem } from '../types/wikiApi'
import { loadWikiDungeonsForMeter } from './wikiDungeons'
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

/** Induction count for a cycle — same rules as the profile page (excludes self-record improvements). */
export async function fetchMeterPlayerHofRecordCount(
  _client: SupabaseClient,
  playerKey: string,
  options?: { cycleId?: string },
): Promise<{ count: number; error: string | null }> {
  const key = playerKey.trim().toLowerCase()
  if (!key) return { count: 0, error: null }

  const cycleId = options?.cycleId?.trim() || 'magia'
  const cycle = getMeterLeaderboardCycle(cycleId)
  if (!cycle) return { count: 0, error: null }

  const window = meterLeaderboardCycleWindow(cycle)
  const dungeons = await loadWikiDungeonsForMeter().catch(() => [])
  const { entries, error } = await fetchPlayerHallOfFameEntries(key, dungeons, {
    maxScopes: METER_HOF_PROFILE_SCOPE_LIMIT,
    stopAfterFirst: true,
    leaderboardCycleId: cycle.id,
    windowStart: window.windowStart,
    windowEnd: window.windowEnd,
  })
  return { count: entries.length, error }
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
  const key = playerKey.trim().toLowerCase()
  if (!key) return { counts: {}, error: null }

  const dungeons = await loadWikiDungeonsForMeter().catch(() => [])
  const { cycles, error } = await fetchPlayerHallOfFameByCycles(key, dungeons, {
    maxScopes: METER_HOF_PROFILE_SCOPE_LIMIT,
  })
  if (error) return { counts: {}, error }

  const counts: Record<string, number> = {}
  for (const row of cycles) counts[row.cycle.id] = row.recordCount
  return { counts, error: null }
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
