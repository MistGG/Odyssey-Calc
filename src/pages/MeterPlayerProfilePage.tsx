import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useSignedInMeterProfile } from '../hooks/useSignedInMeterProfile'
import { MeterPlayerProfileCard } from '../components/MeterPlayerProfileCard'
import { MeterPlayerSharePanel } from '../components/MeterPlayerSharePanel'
import { MeterSubNav } from '../components/MeterSubNav'
import { digimonPortraitUrl } from '../lib/digimonImage'
import type { MeterProfileShareSnapshot } from '../lib/meterPlayerShare'
import {
  fetchAllScopeParsesCached,
  loadDigimonRoleMapForMeter,
} from '../lib/meterDataSource'
import {
  buildPlayerBestParses,
  buildPlayerFavoriteDigimon,
  buildScopeLeaderboardDpsPools,
  displayNameForPlayerKey,
  leaderboardDpsPoolForBestEntry,
  METER_PROFILE_IDENTITY_NOTICE,
  normalizeRoutePlayerKey,
  sortPlayerBestParsesByParseScore,
} from '../lib/meterPlayerProfile'
import { allMeterUploadScopes } from '../lib/meterScopeList'
import { dpsToPercentile, parseScoreColor, type PublicMeterParseRow } from '../lib/meterPublicStats'
import { loadWikiDungeonsForMeter } from '../lib/wikiDungeons'

type ProfileLocationState = {
  displayName?: string
  ownProfile?: boolean
  fromMeter?: { dungeonId?: string; difficultyId?: number }
}

function formatInt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

export function MeterPlayerProfilePage() {
  const { user } = useAuth()
  const { identities: signedInIdentities, loading: signedInLoading } = useSignedInMeterProfile()
  const { playerKey: playerKeyParam } = useParams()
  const location = useLocation()
  const nav = (location.state as ProfileLocationState | null) ?? null

  const playerKey = normalizeRoutePlayerKey(playerKeyParam ?? '')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [scopeProgress, setScopeProgress] = useState<{ done: number; total: number } | null>(null)
  const [rows, setRows] = useState<PublicMeterParseRow[]>([])
  const [digimonRoleById, setDigimonRoleById] = useState<Map<string, string>>(() => new Map())

  useEffect(() => {
    if (!playerKey) return
    let cancelled = false

    void (async () => {
      setLoading(true)
      setLoadError(null)
      setRows([])

      const [roles, dungeons] = await Promise.all([
        loadDigimonRoleMapForMeter(),
        loadWikiDungeonsForMeter().catch(() => []),
      ])
      if (cancelled) return
      setDigimonRoleById(roles)

      const scopes = allMeterUploadScopes(dungeons)
      setScopeProgress({ done: 0, total: scopes.length })

      const res = await fetchAllScopeParsesCached(scopes, 4, (done, total) => {
        if (!cancelled) setScopeProgress({ done, total })
      })
      if (cancelled) return

      if (res.error) setLoadError(res.error)
      setRows(res.rows)
      setLoading(false)
      setScopeProgress(null)
    })()

    return () => {
      cancelled = true
    }
  }, [playerKey])

  const displayName = useMemo(() => {
    if (nav?.displayName?.trim()) return nav.displayName.trim()
    return displayNameForPlayerKey(rows, playerKey) || playerKey
  }, [nav?.displayName, rows, playerKey])

  const favoriteDigimon = useMemo(
    () => buildPlayerFavoriteDigimon(rows, playerKey),
    [rows, playerKey],
  )

  const bestParses = useMemo(
    () => (digimonRoleById.size ? buildPlayerBestParses(rows, playerKey, digimonRoleById) : []),
    [rows, playerKey, digimonRoleById],
  )

  const scopeLeaderboardPools = useMemo(
    () =>
      digimonRoleById.size && rows.length
        ? buildScopeLeaderboardDpsPools(rows, digimonRoleById, bestParses)
        : new Map(),
    [rows, digimonRoleById, bestParses],
  )

  const sortedBestParses = useMemo(
    () => sortPlayerBestParsesByParseScore(bestParses, scopeLeaderboardPools),
    [bestParses, scopeLeaderboardPools],
  )

  const peakEntry = useMemo(() => {
    if (!bestParses.length) return null
    return bestParses.reduce((top, entry) => (entry.dps > top.dps ? entry : top))
  }, [bestParses])

  const peakDps = peakEntry?.dps ?? 0

  const peakDpsPool = useMemo(
    () => (peakEntry ? leaderboardDpsPoolForBestEntry(scopeLeaderboardPools, peakEntry) : []),
    [peakEntry, scopeLeaderboardPools],
  )

  const peakDpsColor = useMemo(() => {
    if (peakDps <= 0) return undefined
    const pct = dpsToPercentile(peakDps, peakDpsPool)
    return parseScoreColor(pct)
  }, [peakDps, peakDpsPool])

  const dungeonCount = useMemo(() => {
    const seen = new Set<string>()
    for (const entry of bestParses) seen.add(entry.dungeonId)
    return seen.size
  }, [bestParses])

  const favoritePortrait = favoriteDigimon
    ? favoriteDigimon.portraitUrl?.trim() ||
      digimonPortraitUrl(
        favoriteDigimon.iconId ?? '',
        favoriteDigimon.digimonId,
        favoriteDigimon.digimonName,
      )
    : undefined

  const shareSnapshot = useMemo((): MeterProfileShareSnapshot | null => {
    if (loading) return null
    return {
      displayName,
      peakDps,
      bestEntryCount: bestParses.length,
      dungeonCount,
      favoriteDigimon,
    }
  }, [loading, displayName, peakDps, bestParses.length, dungeonCount, favoriteDigimon])

  const backTo = nav?.fromMeter?.dungeonId
    ? {
        pathname: '/meter',
        state: {
          dungeonId: nav.fromMeter.dungeonId,
          difficultyId: nav.fromMeter.difficultyId,
        },
      }
    : { pathname: '/meter' }

  const isOwnProfile = useMemo(() => {
    if (!user) return false
    if (nav?.ownProfile) return true
    if (signedInLoading) return false
    return signedInIdentities.some((id) => id.playerKey === playerKey)
  }, [user, nav?.ownProfile, signedInLoading, signedInIdentities, playerKey])

  const showIdentityNotice = isOwnProfile && !loading && bestParses.length === 0

  if (!playerKey) {
    return (
      <div className="meter-parses-page meter-player-profile-page">
        <p className="meter-parses-error meter-parses-error--center">Invalid player profile link.</p>
        <p className="meter-parses-muted meter-parses-muted--center">
          <Link to="/meter">Back to leaderboard</Link>
        </p>
      </div>
    )
  }

  return (
    <div className="meter-parses-page meter-player-profile-page">
      <header className="meter-parses-logged-head meter-parses-logged-head--bar meter-public-head">
        <h1 className="meter-parses-title">Meter</h1>
        <MeterSubNav />
      </header>

      {showIdentityNotice ? (
        <p className="meter-profile-identity-notice" role="status">
          {METER_PROFILE_IDENTITY_NOTICE}.{' '}
          <Link to="/meter/my-parses">View your uploads</Link> or{' '}
          <Link to="/meter">open Meter</Link> to upload from the companion.
        </p>
      ) : null}

      <MeterPlayerProfileCard
        displayName={displayName}
        favoriteDigimon={favoriteDigimon}
        peakDps={peakDps}
        peakDpsPool={peakDpsPool}
        bestEntryCount={bestParses.length}
        dungeonCount={dungeonCount}
        loading={loading}
        loadProgress={scopeProgress}
        backTo={backTo}
      />

      {loadError ? <p className="meter-parses-error meter-parses-error--center">{loadError}</p> : null}

      <MeterPlayerSharePanel
        playerKey={playerKey}
        snapshot={shareSnapshot}
        portraitUrl={favoritePortrait}
        peakDpsColor={peakDpsColor}
        profileLoading={loading}
      />

      {!loading ? (
        <section className="meter-profile-bests-panel meter-parses-meter-chrome">
          <div className="meter-profile-bests-panel__head">
            <h3 className="meter-parses-section-title">Best parses</h3>
            <span className="meter-profile-bests-panel__count">
              {bestParses.length} {bestParses.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>
          {bestParses.length === 0 ? (
            <p className="meter-parses-muted meter-profile-bests-panel__empty">
              {showIdentityNotice
                ? METER_PROFILE_IDENTITY_NOTICE
                : 'No ranked parses found for this tamer yet.'}
            </p>
          ) : (
            <div className="meter-profile-bests-panel__table-wrap meter-scroll--themed">
              <table className="meter-profile-bests-table">
                <thead>
                  <tr>
                    <th scope="col">Dungeon</th>
                    <th scope="col">Diff</th>
                    <th scope="col">Role</th>
                    <th scope="col">Digimon</th>
                    <th scope="col" className="meter-profile-bests-table__dps">
                      DPS
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedBestParses.map((entry) => {
                    const pool = leaderboardDpsPoolForBestEntry(scopeLeaderboardPools, entry)
                    const pct = dpsToPercentile(entry.dps, pool)
                    return (
                      <tr key={`${entry.dungeonId}-${entry.difficultyId}-${entry.roleBucket}`}>
                        <td className="meter-profile-bests-table__dungeon">{entry.dungeonName}</td>
                        <td>{entry.difficultyLabel}</td>
                        <td>
                          <span className="meter-profile-bests-table__role">{entry.roleLabel}</span>
                        </td>
                        <td>{entry.digimonName || '—'}</td>
                        <td
                          className="meter-profile-bests-table__dps"
                          style={{ color: parseScoreColor(pct) }}
                          title={`${pct} parse`}
                        >
                          {formatInt(entry.dps)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  )
}
