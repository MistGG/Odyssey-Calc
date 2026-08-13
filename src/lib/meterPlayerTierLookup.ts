import { canonicalMeterPlayerKey, METER_PLAYER_KEY_ALIASES } from './meterPlayerAliases'
import type { PlayerTierId } from './meterPlayerTiers'
import { PLAYER_TIER_IDS } from './meterPlayerTiers'

/** Slim static map only — no scores, no Supabase. */
const DATA_URL = `${import.meta.env.BASE_URL}data/meter-player-tier-lookup.json`

export type PlayerTierLookupFile = {
  version: 1
  cycleId: string
  cycleLabel: string
  /** playerKey → tier id */
  tiers: Record<string, PlayerTierId>
}

type TierLookup = {
  cycleLabel: string
  byPlayer: Map<string, PlayerTierId>
}

const TIER_SET = new Set<string>(PLAYER_TIER_IDS)

let lookupPromise: Promise<TierLookup | null> | null = null

function isTierId(value: string): value is PlayerTierId {
  return TIER_SET.has(value)
}

function betterPlayerTier(
  a: PlayerTierId | undefined,
  b: PlayerTierId | undefined,
): PlayerTierId | undefined {
  if (!a) return b
  if (!b) return a
  return PLAYER_TIER_IDS.indexOf(a) <= PLAYER_TIER_IDS.indexOf(b) ? a : b
}

async function loadTierLookup(): Promise<TierLookup | null> {
  try {
    const res = await fetch(DATA_URL, { cache: 'force-cache' })
    if (!res.ok) return null
    const json = (await res.json()) as PlayerTierLookupFile
    const byPlayer = new Map<string, PlayerTierId>()
    for (const [rawKey, rawTier] of Object.entries(json.tiers ?? {})) {
      const key = rawKey.trim().toLowerCase()
      if (!key || !isTierId(rawTier)) continue
      byPlayer.set(key, rawTier)
    }
    for (const [fromKey, toKey] of Object.entries(METER_PLAYER_KEY_ALIASES)) {
      const merged = betterPlayerTier(byPlayer.get(toKey), byPlayer.get(fromKey))
      if (!merged) continue
      byPlayer.set(toKey, merged)
      byPlayer.set(fromKey, merged)
    }
    return { cycleLabel: json.cycleLabel || json.cycleId || '', byPlayer }
  } catch {
    return null
  }
}

function getLookup(): Promise<TierLookup | null> {
  if (!lookupPromise) lookupPromise = loadTierLookup()
  return lookupPromise
}

/** Static snapshot lookup — CDN/static only, never Supabase. */
export async function fetchPlayerSeasonTier(
  playerKey: string,
): Promise<{ tier: PlayerTierId; cycleLabel: string } | null> {
  const key = canonicalMeterPlayerKey(playerKey)
  if (!key) return null
  const lookup = await getLookup()
  if (!lookup) return null
  const tier = lookup.byPlayer.get(key) ?? lookup.byPlayer.get(playerKey.trim().toLowerCase())
  if (!tier) return null
  return { tier, cycleLabel: lookup.cycleLabel }
}
