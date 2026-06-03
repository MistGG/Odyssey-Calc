import { useMemo } from 'react'

import { isMistMeterShopDev } from '../lib/meterDevShop'
import type { MeterPartyBarTheme } from '../lib/meterPartyBarThemes'
import { meterRewardsThemesForUser } from '../lib/meterThemeShop'

/** Owned themes for My Rewards — derived from wallet state (no extra Supabase round-trip). */
export function useMeterRewardsCatalog(
  walletLoading: boolean,
  ownedThemeIds: string[],
  profileDisplayName: string | null,
  confirmedTamerName: string | null,
) {
  const mistDev = isMistMeterShopDev(profileDisplayName, confirmedTamerName)

  const rewardThemes = useMemo(
    (): MeterPartyBarTheme[] => meterRewardsThemesForUser(ownedThemeIds, mistDev),
    [ownedThemeIds, mistDev],
  )

  return {
    catalogLoading: walletLoading,
    skeletonCount: walletLoading ? Math.max(1, rewardThemes.length || 1) : 0,
    rewardThemes,
    catalogError: null as string | null,
    refresh: async () => {
      /* wallet refresh repopulates ownedThemeIds */
    },
  }
}
