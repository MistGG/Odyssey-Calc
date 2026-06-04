import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useSignedInMeterProfile } from '../hooks/useSignedInMeterProfile'
import { MeterPlayerProfileCard } from '../components/MeterPlayerProfileCard'
import { MeterPlayerHallOfFameCard } from '../components/MeterPlayerHallOfFameCard'
import { MeterPlayerSharePanel } from '../components/MeterPlayerSharePanel'
import { MeterSubNav } from '../components/MeterSubNav'
import { digimonPortraitUrl } from '../lib/digimonImage'
import type { MeterProfileShareSnapshot } from '../lib/meterPlayerShare'
import {
  fetchPlayerMeterLeaderboardEntries,
  type PlayerLeaderboardEntryRow,
} from '../lib/meterDataSource'
import {
  buildPlayerBestParsesFromLeaderboardEntries,
  buildPlayerFavoriteDigimonFromLeaderboardEntries,
  buildScopeLeaderboardDpsPoolsFromPrecomputed,
  displayNameFromLeaderboardEntries,
  leaderboardDpsPoolForBestEntry,
  METER_PROFILE_IDENTITY_NOTICE,
  normalizeRoutePlayerKey,
  sortPlayerBestParsesByParseScore,
} from '../lib/meterPlayerProfile'
import { dpsToPercentile, parseScoreColor } from '../lib/meterPublicStats'
import { fetchPlayerHallOfFameEntries, type ProfileHallOfFameEntry } from '../lib/meterHallOfFame'
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
  const [leaderboardEntries, setLeaderboardEntries] = useState<PlayerLeaderboardEntryRow[]>([])
  const [wikiDungeons, setWikiDungeons] = useState<
    Awaited<ReturnType<typeof loadWikiDungeonsForMeter>>
  >([])
  const [scopeLeaderboardPools, setScopeLeaderboardPools] = useState<
    Awaited<ReturnType<typeof buildScopeLeaderboardDpsPoolsFromPrecomputed>>
  >(() => new Map())
  const [hofEntries, setHofEntries] = useState<ProfileHallOfFameEntry[]>([])
  const [hofLoading, setHofLoading] = useState(true)
  const [hofError, setHofError] = useState<string | null>(null)

  useEffect(() => {
    if (!playerKey) return
    let cancelled = false

    void (async () => {
      setLoading(true)
      setLoadError(null)
      setLeaderboardEntries([])
      setScopeLeaderboardPools(new Map())
      setHofLoading(true)
      setHofError(null)
      setHofEntries([])

      const dungeons = await loadWikiDungeonsForMeter().catch(() => [])
      if (cancelled) return
      setWikiDungeons(dungeons)

      const [leaderboardRes, hofRes] = await Promise.all([
        fetchPlayerMeterLeaderboardEntries(playerKey),
        fetchPlayerHallOfFameEntries(playerKey, dungeons, { maxScopes: 12 }),
      ])
      if (cancelled) return

      if (leaderboardRes.error) setLoadError(leaderboardRes.error)
      setLeaderboardEntries(leaderboardRes.entries)

      const bestFromEntries = buildPlayerBestParsesFromLeaderboardEntries(
        leaderboardRes.entries,
        dungeons,
      )
      const pools = await buildScopeLeaderboardDpsPoolsFromPrecomputed(bestFromEntries)
      if (cancelled) return
      setScopeLeaderboardPools(pools)
      setLoading(false)

      if (hofRes.error) setHofError(hofRes.error)
      else setHofEntries(hofRes.entries)
      setHofLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [playerKey])

  const displayName = useMemo(() => {
    if (nav?.displayName?.trim()) return nav.displayName.trim()
    return displayNameFromLeaderboardEntries(leaderboardEntries, playerKey) || playerKey
  }, [nav?.displayName, leaderboardEntries, playerKey])

  const favoriteDigimon = useMemo(
    () => buildPlayerFavoriteDigimonFromLeaderboardEntries(leaderboardEntries),
    [leaderboardEntries],
  )

  const bestParses = useMemo(
    () =>
      leaderboardEntries.length
        ? buildPlayerBestParsesFromLeaderboardEntries(leaderboardEntries, wikiDungeons)
        : [],
    [leaderboardEntries, wikiDungeons],
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
      hallOfFameRecordCount: hofEntries.length,
    }
  }, [loading, displayName, peakDps, bestParses.length, dungeonCount, favoriteDigimon, hofEntries.length])

  const backTo = nav?.fromMeter?.dungeonId
    ? {
        pathname: '/meter/leaderboard',
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
          <Link to="/meter">Back to Meter</Link>
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
        loadProgress={null}
        hallOfFameRecordCount={hofEntries.length}
        hallOfFameLoading={hofLoading}
        backTo={backTo}
      />

      {loadError ? <p className="meter-parses-error meter-parses-error--center">{loadError}</p> : null}
      {hofError ? <p className="meter-parses-error meter-parses-error--center">{hofError}</p> : null}

      <MeterPlayerHallOfFameCard entries={hofEntries} loading={hofLoading} />

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
