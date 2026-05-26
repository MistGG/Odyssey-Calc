import { useEffect, useMemo, useState } from 'react'

import { getMeterAnonSupabase } from '../lib/meterDataSource'
import type { MeterPartyBarThemeId } from '../lib/meterPartyBarThemes'
import {
  equippedThemeIdForTamer,
  fetchEquippedThemesForTamers,
  normalizePartyTamerThemeKey,
} from '../lib/meterPartyTamerThemes'

export function useEquippedThemesForPartyTamers(
  tamerNames: string[],
  resolveKey?: string,
): Map<string, MeterPartyBarThemeId> {
  const supabase = getMeterAnonSupabase()
  const nameKey = useMemo(() => {
    const keys = new Set<string>()
    for (const raw of tamerNames) {
      const key = normalizePartyTamerThemeKey(raw)
      if (key) keys.add(key)
    }
    return [...keys].sort().join('|')
  }, [tamerNames])

  const [themes, setThemes] = useState<Map<string, MeterPartyBarThemeId>>(() => new Map())

  useEffect(() => {
    if (!nameKey) {
      setThemes(new Map())
      return
    }
    let cancelled = false
    const names = nameKey.split('|').filter(Boolean)
    void fetchEquippedThemesForTamers(supabase, names, {
      bustCache: Boolean(resolveKey),
    }).then((map) => {
      if (!cancelled) setThemes(map)
    })
    return () => {
      cancelled = true
    }
  }, [supabase, nameKey, resolveKey])

  return themes
}

export { equippedThemeIdForTamer }
