const CONFIRMED_TAMER_STORAGE_KEY = 'odyssey-meter-confirmed-tamer:v2'
const LEGACY_CONFIRMED_TAMER_STORAGE_KEY = 'odyssey-meter-confirmed-tamer'

function clearLegacyConfirmedTamer(): void {
  try {
    localStorage.removeItem(LEGACY_CONFIRMED_TAMER_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function readCachedConfirmedTamer(): string | null {
  try {
    clearLegacyConfirmedTamer()
    const raw = localStorage.getItem(CONFIRMED_TAMER_STORAGE_KEY)?.trim()
    return raw || null
  } catch {
    return null
  }
}

export function writeCachedConfirmedTamer(tamerName: string): void {
  const name = tamerName.trim()
  if (!name) return
  try {
    clearLegacyConfirmedTamer()
    localStorage.setItem(CONFIRMED_TAMER_STORAGE_KEY, name)
  } catch {
    /* ignore */
  }
}

export function clearCachedConfirmedTamer(): void {
  try {
    clearLegacyConfirmedTamer()
    localStorage.removeItem(CONFIRMED_TAMER_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
