import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

import { isMistMeterShopDev } from '../lib/meterDevShop'
import {
  fetchMeterPlayerHofRecordCountsByCycle,
  resolveMeterPlayerKeyForHof,
  userQualifiesForHallOfFameTheme,
} from '../lib/meterHallOfFameTheme'
import {
  getMeterPartyBarTheme,
  HALL_OF_FAME_THEME_ID,
  MAGIA_HALL_OF_FAME_THEME_ID,
} from '../lib/meterPartyBarThemes'
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
  const [hofRecordCounts, setHofRecordCounts] = useState<Record<string, number>>({})
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
        setHofRecordCounts({})
        setHofLoading(false)
        return
      }

      const { counts, error } = await fetchMeterPlayerHofRecordCountsByCycle(supabase, playerKey)
      if (cancelled) return
      if (error) setCatalogError(error)
      setHofRecordCounts(counts)
      setHofLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [supabase, profileDisplayName])

  const rewardThemes = useMemo((): MeterRewardTheme[] => {
    const themes: MeterRewardTheme[] = [...purchasedThemes]
    const olympusCount = hofRecordCounts.olympus ?? 0
    const magiaCount = hofRecordCounts.magia ?? 0

    if (userQualifiesForHallOfFameTheme(olympusCount)) {
      const hof = getMeterPartyBarTheme(HALL_OF_FAME_THEME_ID)
      if (hof && !themes.some((t) => t.id === hof.id)) {
        themes.push({ ...hof, hofRecordCount: olympusCount })
      }
    }
    if (userQualifiesForHallOfFameTheme(magiaCount)) {
      const magia = getMeterPartyBarTheme(MAGIA_HALL_OF_FAME_THEME_ID)
      if (magia && !themes.some((t) => t.id === magia.id)) {
        themes.push({ ...magia, hofRecordCount: magiaCount })
      }
    }
    return themes
  }, [purchasedThemes, hofRecordCounts])

  const hofRecordCount = hofRecordCounts.magia ?? 0

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
