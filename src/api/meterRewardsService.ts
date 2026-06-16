import type { SupabaseClient } from '@supabase/supabase-js'

import {
  fetchMeterPlayerHofRecordCountForTheme,
  resolveMeterPlayerKeyForHof,
  userQualifiesForHallOfFameTheme,
} from '../lib/meterHallOfFameTheme'
import { getMeterPartyBarTheme } from '../lib/meterPartyBarThemes'
import { meterThemeShopPriceForTheme } from '../lib/meterThemeShop'
import type { MeterPartyBarThemeId } from '../lib/meterPartyBarThemes'
import { isGrantOnlyMeterThemeId, isShopPurchasableMeterThemeId } from '../lib/meterThemeGrants'
import {
  clearEquippedMeterPartyBarThemeId,
  HALL_OF_FAME_THEME_ID,
  MAGIA_HALL_OF_FAME_THEME_ID,
  MIST_DEV_REWARD_THEME_ID,
  writeEquippedMeterPartyBarThemeId,
} from '../lib/meterPartyBarThemes'

async function upsertEquippedTheme(
  supabase: SupabaseClient,
  themeId: MeterPartyBarThemeId,
): Promise<void> {
  writeEquippedMeterPartyBarThemeId(themeId)
  const { data: auth } = await supabase.auth.getUser()
  if (auth.user?.id) {
    await supabase.from('meter_reward_accounts').upsert({
      user_id: auth.user.id,
      equipped_theme_id: themeId,
      updated_at: new Date().toISOString(),
    })
  }
}

export async function purchaseMeterTheme(
  supabase: SupabaseClient,
  themeId: MeterPartyBarThemeId,
): Promise<{ ok: boolean; balance: number; error: string | null }> {
  if (!isShopPurchasableMeterThemeId(themeId)) {
    return { ok: false, balance: 0, error: 'This theme cannot be purchased.' }
  }
  const theme = getMeterPartyBarTheme(themeId)
  const cost = theme ? meterThemeShopPriceForTheme(theme) : 50
  const { data, error } = await supabase.rpc('meter_purchase_theme', {
    p_theme_id: themeId,
    p_cost: cost,
  })
  if (error) return { ok: false, balance: 0, error: error.message }
  if (data?.error === 'insufficient_points') {
    return { ok: false, balance: Number(data.balance ?? 0), error: 'Not enough points.' }
  }
  if (data?.error === 'already_owned') {
    return { ok: false, balance: Number(data.balance ?? 0), error: 'You already own this theme.' }
  }
  return { ok: Boolean(data?.ok), balance: Number(data.balance ?? 0), error: null }
}

export async function equipMeterTheme(
  supabase: SupabaseClient,
  themeId: MeterPartyBarThemeId,
  options?: { mistDevIliadBypass?: boolean; profileDisplayName?: string | null },
): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc('meter_equip_theme', { p_theme_id: themeId })
  if (error) return { ok: false, error: error.message }
  if (data?.error === 'not_owned') {
    if (options?.mistDevIliadBypass && themeId === MIST_DEV_REWARD_THEME_ID) {
      await upsertEquippedTheme(supabase, themeId)
      return { ok: true, error: null }
    }
    if (themeId === HALL_OF_FAME_THEME_ID || themeId === MAGIA_HALL_OF_FAME_THEME_ID) {
      const playerKey = await resolveMeterPlayerKeyForHof(
        supabase,
        options?.profileDisplayName ?? null,
      )
      if (playerKey) {
        const { count } = await fetchMeterPlayerHofRecordCountForTheme(supabase, playerKey, themeId)
        if (userQualifiesForHallOfFameTheme(count)) {
          await upsertEquippedTheme(supabase, themeId)
          return { ok: true, error: null }
        }
      }
      return {
        ok: false,
        error:
          themeId === MAGIA_HALL_OF_FAME_THEME_ID
            ? 'Earn a Magia cycle record break to unlock this theme.'
            : 'Earn a Hall of Fame record break to unlock this theme.',
      }
    }
    if (isGrantOnlyMeterThemeId(themeId)) {
      return { ok: false, error: 'You have not earned this theme yet.' }
    }
    return { ok: false, error: 'Purchase this theme before equipping.' }
  }
  if (data?.ok) {
    writeEquippedMeterPartyBarThemeId(themeId)
  }
  return { ok: Boolean(data?.ok), error: null }
}

export async function unequipMeterTheme(
  supabase: SupabaseClient,
): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc('meter_unequip_theme')
  if (!error && data?.ok) {
    clearEquippedMeterPartyBarThemeId()
    return { ok: true, error: null }
  }

  const { data: auth, error: authError } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (authError || !userId) {
    return { ok: false, error: error?.message ?? authError?.message ?? 'Not signed in.' }
  }

  const { error: upsertError } = await supabase.from('meter_reward_accounts').upsert({
    user_id: userId,
    equipped_theme_id: null,
    updated_at: new Date().toISOString(),
  })

  if (upsertError) {
    return {
      ok: false,
      error:
        error?.message ??
        upsertError.message ??
        'Could not clear equipped theme. Run meter_unequip_theme SQL in Supabase.',
    }
  }

  clearEquippedMeterPartyBarThemeId()
  return { ok: true, error: null }
}
