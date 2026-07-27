import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { fetchMyMeterParses } from '../lib/meterDataSource'
import {
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
  const [loading, setLoading] = useState(false)
  const [myParseRows, setMyParseRows] = useState<PublicMeterParseRow[]>([])
  const [confirmedPlayerKey, setConfirmedPlayerKey] = useState<string | null>(null)
  const [cachedTamerName, setCachedTamerName] = useState<string | null>(null)

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
    const cachedTamer = readCachedConfirmedTamer()
    setCachedTamerName(cachedTamer)
    // Cold fetch only — keep UI warm when we already know the tamer.
    setLoading(!cachedTamer)

    void (async () => {
      if (cachedTamer) {
        await claimAnonymousMeterParsesForTamer(supabase, cachedTamer)
      }
      const [result, storedKey] = await Promise.all([
        fetchMyMeterParses(supabase),
        fetchStoredConfirmedPlayerKey(supabase),
      ])
      if (cancelled) return
      setMyParseRows(result.rows)
      setConfirmedPlayerKey(storedKey)
      if (storedKey && !cachedTamer) {
        writeCachedConfirmedTamer(storedKey)
        setCachedTamerName(storedKey)
      }
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
            confirmedPlayerKeys: [confirmedPlayerKey],
            confirmedDisplayNames: [cachedTamerName],
          })
        : [],
    [userId, profileDisplayName, myParseRows, confirmedPlayerKey, cachedTamerName],
  )

  const identity = identities[0] ?? null

  return { loading, identities, identity, myParseRows }
}
