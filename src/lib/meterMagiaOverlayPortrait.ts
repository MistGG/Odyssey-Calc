import type { CSSProperties } from 'react'
import type { MagiaBaseThemeId, MeterPartyBarTheme } from './meterPartyBarThemes'
import { isMagiaMeterShopTheme } from './meterPartyBarThemes'

/** Bundled PNGs (regenerate via `node scripts/process-magia-overlays.mjs`). */
const MAGIA_OVERLAY_SRC = import.meta.glob<string>('../assets/meter-themes/magia/*.png', {
  eager: true,
  import: 'default',
})

const MAGIA_OVERLAY_FILES: Record<MagiaBaseThemeId, string> = {
  raguelmon: 'raguelmon.png',
  plesiomon: 'plesiomon.png',
  zhuqiaomon: 'zhuqiaomon.png',
}

function bundledMagiaOverlayUrl(styleId: MagiaBaseThemeId): string | undefined {
  const file = MAGIA_OVERLAY_FILES[styleId]
  if (!file) return undefined
  return MAGIA_OVERLAY_SRC[`../assets/meter-themes/magia/${file}`]
}

/** Vertical `object-position` % — lower shows more head, higher shows more body/feet. */
const MAGIA_OVERLAY_FOCUS_Y: Record<MagiaBaseThemeId, number> = {
  raguelmon: 22,
  plesiomon: 18,
  zhuqiaomon: 42,
}

/** Raise (+) or lower (−) the watermark within the bar clip. */
const MAGIA_OVERLAY_RAISE_PCT: Record<MagiaBaseThemeId, number> = {
  raguelmon: 0,
  plesiomon: 0,
  zhuqiaomon: 10,
}

/** Rare / legendary Magia bar themes — transparent PNG watermark. */
export function magiaOverlayPortraitUrl(theme: MeterPartyBarTheme): string | undefined {
  if (!isMagiaMeterShopTheme(theme)) return undefined
  if (theme.variant !== 'rare' && theme.variant !== 'legendary') return undefined
  return bundledMagiaOverlayUrl(theme.barStyleId as MagiaBaseThemeId)
}

export function magiaOverlayObjectPosition(theme: MeterPartyBarTheme): string {
  const styleId = theme.barStyleId as MagiaBaseThemeId
  const y = MAGIA_OVERLAY_FOCUS_Y[styleId] ?? 28
  return `center ${y}%`
}

export function magiaOverlayImageStyle(theme: MeterPartyBarTheme): CSSProperties {
  const styleId = theme.barStyleId as MagiaBaseThemeId
  const raise = MAGIA_OVERLAY_RAISE_PCT[styleId] ?? 0
  return {
    objectPosition: magiaOverlayObjectPosition(theme),
    transform: `translate(-50%, calc(-50% - ${raise}%))`,
  }
}
