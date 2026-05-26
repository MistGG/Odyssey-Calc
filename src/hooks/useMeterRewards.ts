import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

import { fetchMyMeterParses, getPublicDungeonParsesCached } from '../lib/meterDataSource'
import {
  buildDungeonEarnProgress,
  hardMeterDungeons,
  type MeterDungeonEarnProgress,
} from '../lib/meterPointEarnProgress'
import {
  computeMeterPointGrants,
  fetchMeterGrantKeys,
  fetchMeterRewardsState,
  hasConfirmedTamerFromParses,
  syncMeterPointGrants,
} from '../lib/meterPointGrants'
import { loadWikiDungeonsForMeter } from '../lib/wikiDungeons'
import type { WikiDungeonListItem } from '../types/wikiApi'
import { resolveSignedInMeterIdentity } from '../lib/meterPlayerProfile'
import type { PublicMeterParseRow } from '../lib/meterPublicStats'
import { dungeonFromPayload } from '../lib/meterParsePayload'
import {
  readCachedConfirmedTamer,
  writeCachedConfirmedTamer,
} from '../lib/meterConfirmedTamerCache'
import { isMistMeterShopDev } from '../lib/meterDevShop'
import {
  clearEquippedMeterPartyBarThemeId,
  getMeterPartyBarTheme,
  writeEquippedMeterPartyBarThemeId,
  type MeterPartyBarThemeId,
} from '../lib/meterPartyBarThemes'
import { HARD_DIFFICULTY_ID } from '../lib/meterPointGrants'

export function useMeterRewards(
  supabase: SupabaseClient | null,
  profileDisplayName: string | null,
  enabled: boolean,
) {
  const [loading, setLoading] = useState(true)
  const [balance, setBalance] = useState(0)
  const [ownedThemeIds, setOwnedThemeIds] = useState<string[]>([])
  const [equippedThemeId, setEquippedThemeId] = useState<string | null>(null)
  const [dailyCompletedToday, setDailyCompletedToday] = useState(false)
  const [identityConfirmed, setIdentityConfirmed] = useState(false)
  const [confirmedTamerName, setConfirmedTamerName] = useState<string | null>(() =>
    readCachedConfirmedTamer(),
  )
  const [showIdentityNotice, setShowIdentityNotice] = useState(() => !readCachedConfirmedTamer())
  const [mistShopDev, setMistShopDev] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [myParses, setMyParses] = useState<PublicMeterParseRow[]>([])
  const [dungeonEarnProgress, setDungeonEarnProgress] = useState<MeterDungeonEarnProgress[]>([])
  const [grantKeys, setGrantKeys] = useState<Set<string>>(() => new Set())
  const [hardDungeons, setHardDungeons] = useState<{ dungeonId: string; dungeonName: string }[]>([])

  const refresh = useCallback(async () => {
    if (!supabase || !enabled) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)

    const myRes = await fetchMyMeterParses(supabase)
    if (myRes.error) {
      setError(myRes.error)
      setLoading(false)
      return
    }
    setMyParses(myRes.rows)

    const identity = resolveSignedInMeterIdentity(profileDisplayName, myRes.rows)
    const confirmedFromParses = hasConfirmedTamerFromParses(myRes.rows)
    const parsedTamerName =
      identity?.confirmedFromUpload ? identity.displayName?.trim() || null : null
    const cachedTamer = readCachedConfirmedTamer()
    if (parsedTamerName) writeCachedConfirmedTamer(parsedTamerName)
    const tamerName = parsedTamerName ?? cachedTamer
    const confirmed = confirmedFromParses || Boolean(cachedTamer)
    setIdentityConfirmed(confirmed)
    setConfirmedTamerName(tamerName)
    setShowIdentityNotice(!confirmed)
    const mistDev = isMistMeterShopDev(profileDisplayName, tamerName)
    setMistShopDev(mistDev)

    const wikiDungeons: WikiDungeonListItem[] = await loadWikiDungeonsForMeter().catch(() => [])
    const hardList = hardMeterDungeons(wikiDungeons)
    setHardDungeons(hardList)

    const dungeonIds = new Set<string>()
    for (const row of myRes.rows) {
      const d = row.dungeon_id?.trim() || dungeonFromPayload(row.payload)?.dungeonId?.trim() || ''
      const diff = row.difficulty_id ?? dungeonFromPayload(row.payload)?.difficultyId
      if (d && diff === HARD_DIFFICULTY_ID) dungeonIds.add(d)
    }

    const publicRowsByDungeon = new Map<string, PublicMeterParseRow[]>()
    await Promise.all(
      [...dungeonIds].map(async (dungeonId) => {
        const pub = await getPublicDungeonParsesCached({
          dungeonId,
          difficultyId: HARD_DIFFICULTY_ID,
        })
        if (!pub.error) publicRowsByDungeon.set(dungeonId, pub.rows)
      }),
    )

    const keys = await fetchMeterGrantKeys(supabase)
    setGrantKeys(keys)
    setDungeonEarnProgress(buildDungeonEarnProgress(hardList, keys, myRes.rows, publicRowsByDungeon))

    const grants = computeMeterPointGrants(myRes.rows, publicRowsByDungeon)
    const syncRes = await syncMeterPointGrants(supabase, grants)
    if (syncRes.error?.includes('meter_apply_point_grants')) {
      setError(
        'Rewards database is not set up yet. Run supabase/migrations/20260521_meter_theme_shop.sql in Supabase.',
      )
    } else if (syncRes.error) {
      setError(syncRes.error)
    }

    const state = await fetchMeterRewardsState(supabase)
    if (state.error && !syncRes.error) setError(state.error)
    setBalance(syncRes.error ? state.balance : syncRes.balance || state.balance)
    setOwnedThemeIds(state.ownedThemeIds)
    const equipped = state.equippedThemeId?.trim() || null
    if (equipped && getMeterPartyBarTheme(equipped)) {
      writeEquippedMeterPartyBarThemeId(equipped as MeterPartyBarThemeId)
    } else {
      clearEquippedMeterPartyBarThemeId()
    }
    setEquippedThemeId(equipped)
    setDailyCompletedToday(state.dailyCompletedToday)
    setLoading(false)
  }, [supabase, enabled, profileDisplayName])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    loading,
    balance,
    ownedThemeIds,
    equippedThemeId,
    dailyCompletedToday,
    identityConfirmed,
    confirmedTamerName,
    showIdentityNotice,
    mistShopDev,
    myParses,
    dungeonEarnProgress,
    grantKeys,
    hardDungeons,
    error,
    refresh,
    setBalance,
    setOwnedThemeIds,
    setEquippedThemeId,
  }
}
