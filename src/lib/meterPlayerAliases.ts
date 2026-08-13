/** Old tamer names that should resolve to the current character. */
export const METER_PLAYER_KEY_ALIASES: Record<string, string> = {
  septhis: 'zorii',
}

const CANONICAL_DISPLAY_NAMES: Record<string, string> = {
  zorii: 'Zorii',
}

export function normalizeMeterPlayerKey(raw: string): string {
  try {
    return decodeURIComponent(raw).trim().toLowerCase()
  } catch {
    return raw.trim().toLowerCase()
  }
}

export function canonicalMeterPlayerKey(raw: string): string {
  const key = normalizeMeterPlayerKey(raw)
  return METER_PLAYER_KEY_ALIASES[key] ?? key
}

export function canonicalMeterPlayerIdentity(
  playerKey: string,
  displayName?: string,
): { playerKey: string; displayName: string } {
  const rawKey = normalizeMeterPlayerKey(playerKey)
  const key = canonicalMeterPlayerKey(rawKey)
  const aliased = key !== rawKey
  const canonicalDisplay = CANONICAL_DISPLAY_NAMES[key]
  const trimmedDisplay = displayName?.trim() || ''
  return {
    playerKey: key,
    displayName: aliased && canonicalDisplay ? canonicalDisplay : trimmedDisplay || canonicalDisplay || key,
  }
}

/** Keep the highest DPS row per canonical player. */
export function collapseAliasedPlayerRanks<T extends { playerKey: string; displayName: string; dps: number }>(
  entries: T[],
): T[] {
  const best = new Map<string, T>()
  for (const entry of entries) {
    const identity = canonicalMeterPlayerIdentity(entry.playerKey, entry.displayName)
    const next = { ...entry, ...identity }
    const prev = best.get(identity.playerKey)
    if (!prev || next.dps > prev.dps) best.set(identity.playerKey, next)
  }
  return [...best.values()].sort((a, b) => b.dps - a.dps)
}
