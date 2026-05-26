import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { fetchMyMeterParses } from '../lib/meterDataSource'
import {
  resolveSignedInMeterIdentities,
  type SignedInMeterIdentity,
} from '../lib/meterPlayerProfile'
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

  useEffect(() => {
    if (!user || !supabase) {
      setMyParseRows([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    void fetchMyMeterParses(supabase).then((result) => {
      if (cancelled) return
      setMyParseRows(result.rows)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [user, supabase])

  const identities = useMemo(
    () => (user ? resolveSignedInMeterIdentities(profileDisplayName, myParseRows) : []),
    [user, profileDisplayName, myParseRows],
  )

  const identity = identities[0] ?? null

  return { loading, identities, identity, myParseRows }
}
