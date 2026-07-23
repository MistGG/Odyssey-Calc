import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

import { isMistMeterShopDev } from '../lib/meterDevShop'
import {
  fetchMeterPlayerHofRecordCountsByCycle,
  hofRecordCountForThemeId,
  resolveMeterPlayerKeyForHof,
  userQualifiesForHallOfFameTheme,
} from '../lib/meterHallOfFameTheme'
import {
  getMeterPartyBarTheme,
  HALL_OF_FAME_THEME_ID,
  isHallOfFameMeterTheme,
  MAGIA_HALL_OF_FAME_THEME_ID,
  VERDANDI_HALL_OF_FAME_THEME_ID,
} from '../lib/meterPartyBarThemes'
import {
  meterRewardsThemesForUser,
  type MeterRewardTheme,
} from '../lib/meterThemeShop'

const HOF_GRANT_THEME_IDS = [
  HALL_OF_FAME_THEME_ID,
  MAGIA_HALL_OF_FAME_THEME_ID,
  VERDANDI_HALL_OF_FAME_THEME_ID,
] as const

const HOF_GRANT_CYCLE_BY_THEME = {
  [HALL_OF_FAME_THEME_ID]: 'olympus',
  [MAGIA_HALL_OF_FAME_THEME_ID]: 'magia',
  [VERDANDI_HALL_OF_FAME_THEME_ID]: 'verdandi',
} as const

function withHofRecordCounts(
  themes: MeterRewardTheme[],
  hofRecordCounts: Record<string, number>,
): MeterRewardTheme[] {
  return themes.map((theme) => {
    if (isHallOfFameMeterTheme(theme)) {
      return { ...theme, hofRecordCount: hofRecordCountForThemeId(theme.id, hofRecordCounts) }
    }
    return theme
  })
}

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
    const themes: MeterRewardTheme[] = withHofRecordCounts([...purchasedThemes], hofRecordCounts)

    for (const themeId of HOF_GRANT_THEME_IDS) {
      const cycleId = HOF_GRANT_CYCLE_BY_THEME[themeId]
      const count = hofRecordCounts[cycleId] ?? 0
      if (!userQualifiesForHallOfFameTheme(count)) continue
      const theme = getMeterPartyBarTheme(themeId)
      if (theme && !themes.some((t) => t.id === theme.id)) {
        themes.push({ ...theme, hofRecordCount: count })
      }
    }

    return withHofRecordCounts(themes, hofRecordCounts)
  }, [purchasedThemes, hofRecordCounts])

  const catalogLoading = walletLoading || hofLoading

  return {
    catalogLoading,
    skeletonCount: catalogLoading ? Math.max(1, rewardThemes.length || 1) : 0,
    rewardThemes,
    hofRecordCounts,
    catalogError,
    refresh: async () => {
      /* wallet refresh repopulates ownedThemeIds; HoF effect re-runs on profile change */
    },
  }
}
