import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

import { isMistMeterShopDev } from '../lib/meterDevShop'
import {
  fetchMeterPlayerHofRecordCount,
  resolveMeterPlayerKeyForHof,
  userQualifiesForHallOfFameTheme,
} from '../lib/meterHallOfFameTheme'
import { getMeterPartyBarTheme, HALL_OF_FAME_THEME_ID } from '../lib/meterPartyBarThemes'
import {
  meterRewardsThemesForUser,
  type MeterRewardTheme,
} from '../lib/meterThemeShop'

/** Owned themes for My Rewards — wallet state plus grant-only themes (Mist, Hall of Fame). */
export function useMeterRewardsCatalog(
  supabase: SupabaseClient | null,
  walletLoading: boolean,
  ownedThemeIds: string[],
  profileDisplayName: string | null,
  confirmedTamerName: string | null,
) {
  const mistDev = isMistMeterShopDev(profileDisplayName, confirmedTamerName)
  const [hofLoading, setHofLoading] = useState(true)
  const [hofRecordCount, setHofRecordCount] = useState(0)
  const [catalogError, setCatalogError] = useState<string | null>(null)

  const purchasedThemes = useMemo(
    () => meterRewardsThemesForUser(ownedThemeIds, mistDev),
    [ownedThemeIds, mistDev],
  )

  useEffect(() => {
    if (!supabase) {
      setHofLoading(false)
      return
    }

    let cancelled = false
    setHofLoading(true)
    setCatalogError(null)

    void (async () => {
      const playerKey = await resolveMeterPlayerKeyForHof(supabase, profileDisplayName)
      if (cancelled) return
      if (!playerKey) {
        setHofRecordCount(0)
        setHofLoading(false)
        return
      }

      const { count, error } = await fetchMeterPlayerHofRecordCount(supabase, playerKey)
      if (cancelled) return
      if (error) setCatalogError(error)
      setHofRecordCount(count)
      setHofLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [supabase, profileDisplayName])

  const rewardThemes = useMemo((): MeterRewardTheme[] => {
    const themes: MeterRewardTheme[] = [...purchasedThemes]
    if (userQualifiesForHallOfFameTheme(hofRecordCount)) {
      const hof = getMeterPartyBarTheme(HALL_OF_FAME_THEME_ID)
      if (hof && !themes.some((t) => t.id === hof.id)) {
        themes.push({ ...hof, hofRecordCount })
      }
    }
    return themes
  }, [purchasedThemes, hofRecordCount])

  const catalogLoading = walletLoading || hofLoading

  return {
    catalogLoading,
    skeletonCount: catalogLoading ? Math.max(1, rewardThemes.length || 1) : 0,
    rewardThemes,
    hofRecordCount,
    catalogError,
    refresh: async () => {
      /* wallet refresh repopulates ownedThemeIds; HoF effect re-runs on profile change */
    },
  }
}
