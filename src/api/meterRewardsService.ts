import type { SupabaseClient } from '@supabase/supabase-js'

import { getMeterPartyBarTheme } from '../lib/meterPartyBarThemes'
import { meterThemeShopPriceForTheme } from '../lib/meterThemeShop'
import type { MeterPartyBarThemeId } from '../lib/meterPartyBarThemes'
import { isGrantOnlyMeterThemeId, isShopPurchasableMeterThemeId } from '../lib/meterThemeGrants'
import {
  clearEquippedMeterPartyBarThemeId,
  MIST_DEV_REWARD_THEME_ID,
  writeEquippedMeterPartyBarThemeId,
} from '../lib/meterPartyBarThemes'

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
  options?: { mistDevIliadBypass?: boolean },
): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc('meter_equip_theme', { p_theme_id: themeId })
  if (error) return { ok: false, error: error.message }
  if (data?.error === 'not_owned') {
    if (options?.mistDevIliadBypass && themeId === MIST_DEV_REWARD_THEME_ID) {
      writeEquippedMeterPartyBarThemeId(themeId)
      return { ok: true, error: null }
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
