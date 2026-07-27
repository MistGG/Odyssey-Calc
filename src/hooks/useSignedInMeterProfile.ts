import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { fetchMyMeterParses } from '../lib/meterDataSource'
import {
  clearCachedConfirmedTamer,
  readCachedConfirmedTamer,
  writeCachedConfirmedTamer,
} from '../lib/meterConfirmedTamerCache'
import { claimAnonymousMeterParsesForTamer } from '../lib/meterParseTamerClaim'
import {
  resolveSignedInMeterIdentities,
  type SignedInMeterIdentity,
} from '../lib/meterPlayerProfile'
import { fetchStoredConfirmedPlayerKey } from '../lib/meterPointGrants'
import type { PublicMeterParseRow } from '../lib/meterPublicStats'

export function useSignedInMeterProfile(): {
  loading: boolean
  identities: SignedInMeterIdentity[]
  identity: SignedInMeterIdentity | null
  myParseRows: PublicMeterParseRow[]
} {
  const { user, supabase, profileDisplayName } = useAuth()
  const [cachedTamerName, setCachedTamerName] = useState<string | null>(() =>
    readCachedConfirmedTamer(),
  )
  const [confirmedPlayerKey, setConfirmedPlayerKey] = useState<string | null>(() => {
    const cached = readCachedConfirmedTamer()?.trim().toLowerCase()
    return cached || null
  })
  const [loading, setLoading] = useState(true)
  const [myParseRows, setMyParseRows] = useState<PublicMeterParseRow[]>([])

  const userId = user?.id ?? null

  useEffect(() => {
    if (!userId || !supabase) {
      setMyParseRows([])
      setConfirmedPlayerKey(null)
      setCachedTamerName(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    void (async () => {
      const [result, storedKey] = await Promise.all([
        fetchMyMeterParses(supabase),
        fetchStoredConfirmedPlayerKey(supabase),
      ])
      if (cancelled) return

      // Identity must be re-confirmed via a fresh upload after the Jul 2026 reset.
      // Ignore legacy localStorage; only trust the server key once a new upload wrote it.
      if (storedKey) {
        await claimAnonymousMeterParsesForTamer(supabase, storedKey)
        writeCachedConfirmedTamer(storedKey)
        setConfirmedPlayerKey(storedKey)
        setCachedTamerName(storedKey)
      } else {
        clearCachedConfirmedTamer()
        setConfirmedPlayerKey(null)
        setCachedTamerName(null)
      }

      setMyParseRows(result.rows)
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [userId, supabase])

  const identities = useMemo(
    () =>
      userId
        ? resolveSignedInMeterIdentities(profileDisplayName, myParseRows, {
            confirmedPlayerKeys: confirmedPlayerKey ? [confirmedPlayerKey] : [],
            confirmedDisplayNames: cachedTamerName ? [cachedTamerName] : [],
          })
        : [],
    [userId, profileDisplayName, myParseRows, confirmedPlayerKey, cachedTamerName],
  )

  const identity = identities[0] ?? null

  return { loading, identities, identity, myParseRows }
}
