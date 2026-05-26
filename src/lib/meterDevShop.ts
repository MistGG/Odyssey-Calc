import { isMistTamer } from './meterPartyBarThemes'

/** Mist sees the Unique (Iliad Core) theme on My Rewards; purchases use the normal wallet. */
export function isMistMeterShopDev(
  profileDisplayName: string | null | undefined,
  confirmedTamerName: string | null | undefined,
): boolean {
  return isMistTamer(profileDisplayName) || isMistTamer(confirmedTamerName)
}
