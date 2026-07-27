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
  const [cachedTamerName, setCachedTamerName] = useState<string | null>(() =>
    readCachedConfirmedTamer(),
  )
  const [confirmedPlayerKey, setConfirmedPlayerKey] = useState<string | null>(() => {
    const cached = readCachedConfirmedTamer()?.trim().toLowerCase()
    return cached || null
  })
  // Cold until first fetch unless localStorage already has a confirmed tamer.
  const [loading, setLoading] = useState(() => !readCachedConfirmedTamer())
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
    const cachedTamer = readCachedConfirmedTamer()
    if (cachedTamer) {
      setCachedTamerName(cachedTamer)
      setConfirmedPlayerKey(cachedTamer.trim().toLowerCase())
      setLoading(false)
    } else {
      setLoading(true)
    }

    void (async () => {
      const [result, storedKey] = await Promise.all([
        fetchMyMeterParses(supabase),
        fetchStoredConfirmedPlayerKey(supabase),
      ])
      if (cancelled) return

      // Prefer the account's stored key over any leftover cache from a co-meter peer.
      const authoritativeKey = storedKey || cachedTamer?.trim().toLowerCase() || null
      if (authoritativeKey) {
        await claimAnonymousMeterParsesForTamer(supabase, authoritativeKey)
      }

      setMyParseRows(result.rows)
      setConfirmedPlayerKey(storedKey || authoritativeKey)
      if (storedKey) {
        writeCachedConfirmedTamer(storedKey)
        setCachedTamerName(storedKey)
      } else if (!cachedTamer) {
        setCachedTamerName(null)
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
            // Only pass cache as display when it matches the confirmed key (avoid dual identities).
            confirmedDisplayNames:
              cachedTamerName &&
              confirmedPlayerKey &&
              cachedTamerName.trim().toLowerCase() === confirmedPlayerKey
                ? [cachedTamerName]
                : confirmedPlayerKey
                  ? [confirmedPlayerKey]
                  : cachedTamerName
                    ? [cachedTamerName]
                    : [],
          })
        : [],
    [userId, profileDisplayName, myParseRows, confirmedPlayerKey, cachedTamerName],
  )

  const identity = identities[0] ?? null

  return { loading, identities, identity, myParseRows }
}
