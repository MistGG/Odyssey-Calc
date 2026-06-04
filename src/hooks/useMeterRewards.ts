import { useCallback, useEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

import { fetchMyMeterParses } from '../lib/meterDataSource'
import { fetchPrecomputedMeterLeaderboard } from '../lib/meterLeaderboardPrecomputed'
import { claimAnonymousMeterParsesForTamer } from '../lib/meterParseTamerClaim'
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
  poolDpsValuesFromPrecomputed,
  syncMeterPointGrants,
} from '../lib/meterPointGrants'
import { loadWikiDungeonsForMeter } from '../lib/wikiDungeons'
import type { WikiDungeonListItem } from '../types/wikiApi'
import { resolveSignedInMeterIdentity, normalizeRoutePlayerKey } from '../lib/meterPlayerProfile'
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
import { markMeterGrantSyncDone, shouldRunMeterGrantSync } from '../lib/meterGrantSyncSession'
import {
  readMeterRewardsWalletCache,
  writeMeterRewardsWalletCache,
} from '../lib/meterRewardsWalletCache'

function applyEquippedTheme(equipped: string | null): void {
  if (equipped && getMeterPartyBarTheme(equipped)) {
    writeEquippedMeterPartyBarThemeId(equipped as MeterPartyBarThemeId)
  } else {
    clearEquippedMeterPartyBarThemeId()
  }
}

export function useMeterRewards(
  supabase: SupabaseClient | null,
  profileDisplayName: string | null,
  enabled: boolean,
) {
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
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
  const syncGenRef = useRef(0)

  const applyWalletState = useCallback(
    (
      state: Awaited<ReturnType<typeof fetchMeterRewardsState>>,
      userId: string | null,
      balanceOverride?: number,
    ) => {
      const equipped = state.equippedThemeId?.trim() || null
      const nextBalance = balanceOverride ?? state.balance
      setBalance(nextBalance)
      setOwnedThemeIds(state.ownedThemeIds)
      setEquippedThemeId(equipped)
      setDailyCompletedToday(state.dailyCompletedToday)
      applyEquippedTheme(equipped)
      if (userId) {
        writeMeterRewardsWalletCache({
          userId,
          balance: nextBalance,
          ownedThemeIds: state.ownedThemeIds,
          equippedThemeId: equipped,
          dailyCompletedToday: state.dailyCompletedToday,
          at: Date.now(),
        })
      }
    },
    [],
  )

  const refreshWallet = useCallback(async (): Promise<string | null> => {
    if (!supabase) return null
    const { data: auth } = await supabase.auth.getUser()
    const userId = auth.user?.id ?? null
    if (!userId) {
      setLoading(false)
      return null
    }

    const cached = readMeterRewardsWalletCache(userId)
    if (cached) {
      setBalance(cached.balance)
      setOwnedThemeIds(cached.ownedThemeIds)
      setEquippedThemeId(cached.equippedThemeId)
      setDailyCompletedToday(cached.dailyCompletedToday)
      applyEquippedTheme(cached.equippedThemeId)
      setLoading(false)
    }

    const state = await fetchMeterRewardsState(supabase)
    if (state.error) {
      if (!cached) setError(state.error)
      setLoading(false)
      return userId
    }
    applyWalletState(state, userId)
    setLoading(false)
    return userId
  }, [supabase, applyWalletState])

  const refreshGrantSync = useCallback(
    async (userId: string) => {
      if (!supabase) return
      const gen = ++syncGenRef.current
      setSyncing(true)

      const cachedTamer = readCachedConfirmedTamer()
      if (cachedTamer) {
        await claimAnonymousMeterParsesForTamer(supabase, cachedTamer)
      }

      const myRes = await fetchMyMeterParses(supabase)
      if (gen !== syncGenRef.current) return
      if (myRes.error) {
        setError(myRes.error)
        setSyncing(false)
        return
      }
      setMyParses(myRes.rows)

      const identity = resolveSignedInMeterIdentity(profileDisplayName, myRes.rows)
      const confirmedFromParses = hasConfirmedTamerFromParses(myRes.rows)
      const parsedTamerName =
        identity?.confirmedFromUpload ? identity.displayName?.trim() || null : null
      if (parsedTamerName) writeCachedConfirmedTamer(parsedTamerName)
      const tamerName = parsedTamerName ?? cachedTamer
      const confirmed = confirmedFromParses || Boolean(cachedTamer)
      setIdentityConfirmed(confirmed)
      setConfirmedTamerName(tamerName)
      setShowIdentityNotice(!confirmed)
      const mistDev = isMistMeterShopDev(profileDisplayName, tamerName)
      setMistShopDev(mistDev)

      const wikiDungeons: WikiDungeonListItem[] = await loadWikiDungeonsForMeter().catch(() => [])
      if (gen !== syncGenRef.current) return
      const hardList = hardMeterDungeons(wikiDungeons)
      setHardDungeons(hardList)

      const dungeonIds = new Set<string>()
      for (const row of myRes.rows) {
        const d = row.dungeon_id?.trim() || dungeonFromPayload(row.payload)?.dungeonId?.trim() || ''
        const diff = row.difficulty_id ?? dungeonFromPayload(row.payload)?.difficultyId
        if (d && diff === HARD_DIFFICULTY_ID) dungeonIds.add(d)
      }

      const hardDungeonPools = new Map<string, number[]>()
      await Promise.all(
        [...dungeonIds].map(async (dungeonId) => {
          const pre = await fetchPrecomputedMeterLeaderboard({
            dungeonId,
            difficultyId: HARD_DIFFICULTY_ID,
          })
          if (pre.stats) {
            hardDungeonPools.set(dungeonId, poolDpsValuesFromPrecomputed(pre.stats))
          }
        }),
      )
      if (gen !== syncGenRef.current) return

      const keys = await fetchMeterGrantKeys(supabase)
      setGrantKeys(keys)
      setDungeonEarnProgress(buildDungeonEarnProgress(hardList, keys, myRes.rows, new Map()))

      const grants = computeMeterPointGrants(
        myRes.rows,
        new Map(),
        hardDungeonPools,
        tamerName ? normalizeRoutePlayerKey(tamerName) : null,
      )
      const syncRes = await syncMeterPointGrants(supabase, grants)
      if (gen !== syncGenRef.current) return

      if (syncRes.error?.includes('meter_apply_point_grants')) {
        setError(
          'Rewards database is not set up yet. Run the meter theme shop SQL in the Supabase SQL Editor.',
        )
      } else if (syncRes.error) {
        setError(syncRes.error)
      }

      const state = await fetchMeterRewardsState(supabase)
      if (gen !== syncGenRef.current) return
      if (state.error && !syncRes.error) setError(state.error)
      const nextBalance = syncRes.error ? state.balance : syncRes.balance || state.balance
      applyWalletState(state, userId, nextBalance)
      setSyncing(false)
    },
    [supabase, profileDisplayName, applyWalletState],
  )

  const refresh = useCallback(
    async (opts?: { syncGrants?: boolean }) => {
      if (!supabase || !enabled) {
        setLoading(false)
        setSyncing(false)
        return
      }
      setError(null)
      const walletOnly = opts?.syncGrants === false
      if (!walletOnly) setLoading(true)

      const userId = await refreshWallet()
      if (!userId) return

      if (walletOnly) return

      const runGrantSync = opts?.syncGrants === true || shouldRunMeterGrantSync()
      if (runGrantSync) {
        void refreshGrantSync(userId).finally(() => markMeterGrantSyncDone())
      }
    },
    [supabase, enabled, refreshWallet, refreshGrantSync],
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    loading,
    syncing,
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
