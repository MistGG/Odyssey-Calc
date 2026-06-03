import type { MeterShopSubcategoryId } from './meterShopCategories'
import { isShopPurchasableMeterThemeId } from './meterThemeGrants'
import {
  getMeterPartyBarTheme,
  MIST_DEV_REWARD_THEME_ID,
  OLYMPOS_XII_COMMON_SHOP_THEMES,
  OLYMPOS_XII_RARE_METER_PARTY_BAR_THEMES,
  OLYMPOS_XII_LEGENDARY_METER_PARTY_BAR_THEMES,
  type MeterPartyBarTheme,
  type MeterPartyBarThemeId,
} from './meterPartyBarThemes'

export const METER_THEME_SHOP_PRICE = 50

export const METER_THEME_SHOP_RARE_PRICE = 75

export const METER_THEME_SHOP_LEGENDARY_PRICE = 150

export const METER_THEME_SHOP_TIER_LABEL = 'Common'

export const METER_THEME_SHOP_RARE_TIER_LABEL = 'Rare'

export const METER_THEME_UNIQUE_TIER_LABEL = 'Unique'

export type MeterThemeShopTierId = 'common' | 'rare'

export function meterThemeShopPriceForTheme(theme: MeterPartyBarTheme): number {
  if (!isShopPurchasableMeterThemeId(theme.id)) {
    return Number.POSITIVE_INFINITY
  }
  if (theme.variant === 'legendary') return METER_THEME_SHOP_LEGENDARY_PRICE
  if (theme.variant === 'rare') return METER_THEME_SHOP_RARE_PRICE
  return METER_THEME_SHOP_PRICE
}

export function meterThemeShopTierLabelForTheme(theme: MeterPartyBarTheme): string {
  if (theme.variant === 'rare') return METER_THEME_SHOP_RARE_TIER_LABEL
  if (theme.variant === 'legendary') return 'Legendary'
  return METER_THEME_SHOP_TIER_LABEL
}

/** Filler digimon names for shop previews (party members without your theme). */
export const METER_THEME_PREVIEW_DIGIMON_POOL = [
  'WarGreymon',
  'MetalGarurumon',
  'Imperialdramon',
  'Omnimon',
  'Gallantmon',
  'Sakuyamon',
  'Beelzemon',
  'Dukemon',
  'MirageGaogamon',
  'Ravemon',
  'ShineGreymon',
  'Rosemon',
  'UlforceVeedramon',
  'Craniamon',
  'Magnadramon',
  'Phoenixmon',
  'Barbamon',
  'Leopardmon',
  'Crusadermon',
  'LordKnightmon',
] as const

export const METER_POINT_EARN_RULES = [
  { label: 'First Hard clear (per dungeon, once)', points: 2 },
  { label: 'Daily Hard clear (first each day)', points: 1 },
  { label: 'Parse score 90+ (per dungeon, once)', points: 3 },
  { label: 'Parse score 99+ (per dungeon, once)', points: 4 },
  { label: 'Parse score 100 (per dungeon, once)', points: 10 },
] as const

export const METER_IDENTITY_PARSE_NOTICE =
  'Please submit a parse to confirm your identity.'

export const SHOP_METER_PARTY_BAR_THEMES: MeterPartyBarTheme[] = [
  ...OLYMPOS_XII_COMMON_SHOP_THEMES,
  ...OLYMPOS_XII_RARE_METER_PARTY_BAR_THEMES,
  ...OLYMPOS_XII_LEGENDARY_METER_PARTY_BAR_THEMES,
]

/** Shop catalog for a bar-theme subcategory (e.g. Common). */
export function shopMeterPartyBarThemesForSubcategory(
  subcategoryId: MeterShopSubcategoryId,
): MeterPartyBarTheme[] {
  if (subcategoryId === 'common') return OLYMPOS_XII_COMMON_SHOP_THEMES
  if (subcategoryId === 'rare') return OLYMPOS_XII_RARE_METER_PARTY_BAR_THEMES
  if (subcategoryId === 'legendary') return OLYMPOS_XII_LEGENDARY_METER_PARTY_BAR_THEMES
  return []
}

export function isShopThemeId(id: string): id is MeterPartyBarThemeId {
  return SHOP_METER_PARTY_BAR_THEMES.some((t) => t.id === id)
}

const REWARDS_THEME_BAR_ORDER = new Map(
  OLYMPOS_XII_COMMON_SHOP_THEMES.map((theme, index) => [theme.barStyleId, index]),
)

function meterRewardsThemeSortKey(theme: MeterPartyBarTheme): [tier: number, barIndex: number] {
  if (theme.id === MIST_DEV_REWARD_THEME_ID) return [0, 0]
  if (theme.variant === 'legendary') {
    return [1, REWARDS_THEME_BAR_ORDER.get(theme.barStyleId) ?? 99]
  }
  if (theme.variant === 'rare') return [2, REWARDS_THEME_BAR_ORDER.get(theme.barStyleId) ?? 99]
  return [3, REWARDS_THEME_BAR_ORDER.get(theme.barStyleId) ?? 99]
}

function compareMeterRewardsThemes(a: MeterPartyBarTheme, b: MeterPartyBarTheme): number {
  const [tierA, barA] = meterRewardsThemeSortKey(a)
  const [tierB, barB] = meterRewardsThemeSortKey(b)
  if (tierA !== tierB) return tierA - tierB
  return barA - barB
}

/** Themes shown on My Rewards — purchased themes plus Iliad Core for Mist. */
export function meterRewardsThemesForUser(
  ownedThemeIds: string[],
  mistDev: boolean,
): MeterPartyBarTheme[] {
  const purchased = SHOP_METER_PARTY_BAR_THEMES.filter((t) => ownedThemeIds.includes(t.id as string))
  const themes: MeterPartyBarTheme[] = [...purchased]
  if (mistDev) {
    const devTheme = getMeterPartyBarTheme(MIST_DEV_REWARD_THEME_ID)
    if (devTheme && !themes.some((t) => t.id === devTheme.id)) {
      themes.push(devTheme)
    }
  }
  return themes.sort(compareMeterRewardsThemes)
}

/** Stable filler digimon names per theme card. */
export function previewDigimonForTheme(themeId: MeterPartyBarThemeId, seed = 0): string[] {
  const pool = METER_THEME_PREVIEW_DIGIMON_POOL
  let h = 0
  for (let i = 0; i < themeId.length; i += 1) h = (h * 31 + themeId.charCodeAt(i)) | 0
  h = (h + seed * 17) | 0
  const picks: string[] = []
  const used = new Set<number>()
  while (picks.length < 3 && used.size < pool.length) {
    const idx = Math.abs((h + picks.length * 9973) % pool.length)
    h = (h * 16807) | 0
    if (used.has(idx)) continue
    used.add(idx)
    picks.push(pool[idx]!)
  }
  return picks
}

export const METER_THEME_PREVIEW_BAR_FILL = [42, 55, 68] as const

/** Plausible DPS / damage / duration for shop & rewards previews (matches meter party columns). */
export function meterThemePreviewStats(fillPct: number, rowIndex: number) {
  const durationSec = 124 - rowIndex * 4
  const totalDamage = Math.round(1_040_000 * (fillPct / 68))
  const dps = Math.round(totalDamage / Math.max(1, durationSec))
  return { dps, totalDamage, durationSec }
}
