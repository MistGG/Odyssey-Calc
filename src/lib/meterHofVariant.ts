import type { MeterHofOverlayVariant } from './meterPartyBarThemes'
import {
  HALL_OF_FAME_THEME_ID,
  MAGIA_HALL_OF_FAME_THEME_ID,
  VERDANDI_HALL_OF_FAME_THEME_ID,
  type MeterPartyBarThemeId,
} from './meterPartyBarThemes'

/** Profile / share / overlay chrome keyed by leaderboard cycle id. */
export function meterHofVariantForCycleId(cycleId: string | null | undefined): MeterHofOverlayVariant {
  const id = cycleId?.trim().toLowerCase()
  if (id === 'verdandi') return 'verdandi'
  if (id === 'magia') return 'magia'
  return 'olympus'
}

export function meterHofThemeIdForCycleId(cycleId: string | null | undefined): MeterPartyBarThemeId {
  const variant = meterHofVariantForCycleId(cycleId)
  if (variant === 'verdandi') return VERDANDI_HALL_OF_FAME_THEME_ID
  if (variant === 'magia') return MAGIA_HALL_OF_FAME_THEME_ID
  return HALL_OF_FAME_THEME_ID
}

export function meterHofCycleEyebrow(variant: MeterHofOverlayVariant): string {
  if (variant === 'verdandi') return 'Verdandi Cycle'
  if (variant === 'magia') return 'Magia Cycle'
  return 'Olympus Cycle'
}

export function meterHofCycleEyebrowUpper(variant: MeterHofOverlayVariant): string {
  if (variant === 'verdandi') return 'VERDANDI CYCLE'
  if (variant === 'magia') return 'MAGIA CYCLE'
  return 'OLYMPUS CYCLE'
}
