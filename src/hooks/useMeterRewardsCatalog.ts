import { useCallback, useEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

import { isMistMeterShopDev } from '../lib/meterDevShop'
import {
  getMeterPartyBarTheme,
  MIST_DEV_REWARD_THEME_ID,
  type MeterPartyBarTheme,
  type MeterPartyBarThemeId,
} from '../lib/meterPartyBarThemes'
import { meterRewardsThemesForUser } from '../lib/meterThemeShop'

function raf(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

export function useMeterRewardsCatalog(
  supabase: SupabaseClient | null,
  profileDisplayName: string | null,
  confirmedTamerName: string | null,
  enabled: boolean,
) {
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [discoveredCount, setDiscoveredCount] = useState(0)
  const [rewardThemes, setRewardThemes] = useState<MeterPartyBarTheme[]>([])
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const loadGenRef = useRef(0)

  const refresh = useCallback(async () => {
    if (!supabase || !enabled) {
      setCatalogLoading(false)
      setDiscoveredCount(0)
      setRewardThemes([])
      return
    }

    const gen = ++loadGenRef.current
    setCatalogLoading(true)
    setCatalogError(null)
    setDiscoveredCount(0)
    setRewardThemes([])

    const mistDev = isMistMeterShopDev(profileDisplayName, confirmedTamerName)
    const ownedIds: string[] = []

    const revealTheme = async (themeId: MeterPartyBarThemeId) => {
      if (!getMeterPartyBarTheme(themeId)) return
      if (ownedIds.includes(themeId)) return
      ownedIds.push(themeId)
      if (gen !== loadGenRef.current) return
      setDiscoveredCount(ownedIds.length)
      await raf()
    }

    if (mistDev) {
      await revealTheme(MIST_DEV_REWARD_THEME_ID)
    }

    const { data, error } = await supabase.from('meter_theme_purchases').select('theme_id')
    if (gen !== loadGenRef.current) return

    if (error) {
      setCatalogError(error.message)
      setCatalogLoading(false)
      return
    }

    for (const row of data ?? []) {
      const themeId = String(row.theme_id ?? '').trim()
      if (!themeId) continue
      await revealTheme(themeId as MeterPartyBarThemeId)
      if (gen !== loadGenRef.current) return
    }

    setRewardThemes(meterRewardsThemesForUser(ownedIds, mistDev))
    setCatalogLoading(false)
  }, [supabase, enabled, profileDisplayName, confirmedTamerName])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const skeletonCount = catalogLoading ? Math.max(1, 1 + discoveredCount) : 0

  return {
    catalogLoading,
    skeletonCount,
    rewardThemes,
    catalogError,
    refresh,
  }
}
