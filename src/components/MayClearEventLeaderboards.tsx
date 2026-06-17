import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMayClearEventEnded } from '../hooks/useMayClearEventEnded'
import { getPublicDungeonParsesCached, loadDigimonRoleMapForMeter } from '../lib/meterDataSource'
import { getCachedScopeParses, meterScopeKey } from '../lib/meterParseCache'
import { MAY_CLEAR_EVENT, isMayClearEventScheduleAnnounced, mayClearEventWindow, type MayClearEventDungeon } from '../lib/mayClearEvent'
import {
  buildMayClearEventResults,
  buildMayClearEventResultsFromPrecomputed,
} from '../lib/mayClearEventResults'
import {
  fetchParticipationPlayersInWindow,
  fetchPrecomputedMeterLeaderboard,
  resolvePrecomputedLeaderboardNames,
  type ParticipationPoolEntry,
} from '../lib/meterLeaderboardPrecomputed'
import type { MeterPublicAggregates } from '../lib/meterPublicStats'
import {
  METER_ROLE_BUCKETS,
} from '../lib/meterRoleBuckets'
import { EventLeaderboardRolePanel } from './EventLeaderboardRolePanel'
import { EventWinnerCard } from './EventWinnerCard'

const EVENT_TOP_PLAYERS = 12

export function MayClearEventLeaderboards({ dungeon }: { dungeon: MayClearEventDungeon }) {
  const [searchParams] = useSearchParams()
  const previewEnded = searchParams.get('previewEnded') === '1'
  const eventEnded = useMayClearEventEnded(previewEnded)

  const { dungeonId, dungeonName } = dungeon
  const { difficultyId } = MAY_CLEAR_EVENT
  const meterContext = useMemo(
    () => ({ dungeonId, difficultyId }),
    [dungeonId, difficultyId],
  )

  const eventWindow = useMemo(() => mayClearEventWindow(), [])

  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [parsesRefreshing, setParsesRefreshing] = useState(false)
  const [digimonRoleById, setDigimonRoleById] = useState<Map<string, string>>(() => new Map())
  const [precomputedStats, setPrecomputedStats] = useState<MeterPublicAggregates | null>(null)
  const [participationPool, setParticipationPool] = useState<ParticipationPoolEntry[]>([])
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getPublicDungeonParsesCached>>['rows']>(
    [],
  )

  useEffect(() => {
    let cancelled = false
    const scopeKey = meterScopeKey(dungeonId, difficultyId)
    const cached = getCachedScopeParses(scopeKey)
    if (cached?.length) {
      setRows(cached)
      setLoading(false)
    } else {
      setLoading(true)
    }
    setParsesRefreshing(true)
    setLoadError(null)
    setPrecomputedStats(null)
    setParticipationPool([])

    void (async () => {
      const pre = await fetchPrecomputedMeterLeaderboard({
        dungeonId,
        difficultyId,
        limitPerRole: EVENT_TOP_PLAYERS,
        ...(eventWindow ?? {}),
      })
      if (cancelled) return
      if (pre.error) setLoadError(pre.error)
      if (pre.stats) {
        setPrecomputedStats(pre.stats)
        setLoading(false)
        setParsesRefreshing(false)
        if (eventEnded) {
          void fetchParticipationPlayersInWindow({
            dungeonId,
            difficultyId,
            ...(eventWindow ?? {}),
          }).then((poolRes) => {
            if (cancelled) return
            if (poolRes.error) setLoadError(poolRes.error)
            setParticipationPool(poolRes.entries)
          })
        }
        void resolvePrecomputedLeaderboardNames(pre.stats).then((resolved) => {
          if (!cancelled) setPrecomputedStats(resolved)
        })
        return
      }

      const [roles, parseRes] = await Promise.all([
        loadDigimonRoleMapForMeter(),
        getPublicDungeonParsesCached({ dungeonId, difficultyId }, (updated) => {
          if (!cancelled) setRows(updated)
        }),
      ])
      if (cancelled) return
      setDigimonRoleById(roles)
      if (parseRes.error) setLoadError(parseRes.error)
      else if (!cached?.length) setRows(parseRes.rows)
      setLoading(false)
      setParsesRefreshing(false)
    })()

    return () => {
      cancelled = true
    }
  }, [dungeonId, difficultyId, eventWindow])

  const results = useMemo(() => {
    if (precomputedStats) {
      return buildMayClearEventResultsFromPrecomputed(
        precomputedStats,
        participationPool,
        dungeonId,
        difficultyId,
      )
    }
    if (!digimonRoleById.size) return null
    return buildMayClearEventResults(rows, digimonRoleById, dungeonId)
  }, [precomputedStats, participationPool, rows, digimonRoleById, dungeonId, difficultyId])

  const leaderboardPrizeLabel = `${MAY_CLEAR_EVENT.prizeCrownsPerRole} crowns + ${MAY_CLEAR_EVENT.prizeShopPointsPerRole} shop pts`
  const participationPrizeLabel = `${MAY_CLEAR_EVENT.participationPrizeCrownsPerRole} crowns`

  return (
    <section
      className={`event-panel event-panel--leaderboards event-panel--examon-lb${eventEnded ? ' event-panel--ended' : ''}`}
      aria-labelledby="event-lb-heading"
    >
      {!isMayClearEventScheduleAnnounced() && !eventEnded ? (
        <p className="event-schedule-tbd-note" role="note">
          Event dates are <strong>TBD</strong>. Boards below are a preview until the schedule is
          announced and Hard goes live.
        </p>
      ) : null}

      {previewEnded ? (
        <p className="event-ended-preview-note" role="note">
          Preview: ended state. Remove <code>?previewEnded=1</code> from the URL for the live view.
        </p>
      ) : null}

      {eventEnded ? (
        <div className="event-ended-banner" role="status">
          <p className="event-ended-banner__title">Event complete</p>
          <p className="event-ended-banner__lead muted">
            Leaderboards closed at <strong>{MAY_CLEAR_EVENT.eventEndUtcLabel}</strong>. Winners below
            are final.
          </p>
        </div>
      ) : null}

      <div className="event-lb-head">
        <div className="event-lb-head__copy">
          <p className="event-lb-head__tag">
            {dungeonName} · {MAY_CLEAR_EVENT.difficultyLabel}
          </p>
          <h2 id="event-lb-heading" className="event-section-title event-lb-head__title">
            {eventEnded ? 'Final standings' : 'Live raid boards'}
          </h2>
          <p className="event-section-lead muted">
            {eventEnded ? (
              <>
                Prize leaders and raffle winners for <strong>{dungeonName}</strong>, locked at{' '}
                <strong>{MAY_CLEAR_EVENT.eventEndUtcLabel}</strong>.
              </>
            ) : (
              <>
                Best parse per tamer in each role on <strong>{dungeonName}</strong>. Hold #1 through
                the cutoff to claim the crown prize.
              </>
            )}
          </p>
        </div>
        <div className="event-lb-head__crest" aria-hidden>
          <span className="event-lb-head__crest-ring" />
          <span className="event-lb-head__crest-core">⚔</span>
        </div>
      </div>

      {loadError ? <p className="meter-parses-error">{loadError}</p> : null}
      {parsesRefreshing ? (
        <p className="meter-parses-muted" role="status">
          {loading && !results ? 'Loading…' : 'Updating…'}
        </p>
      ) : null}
      {!loading && results ? (
        <>
          {eventEnded ? (
            <>
              <section className="event-results-block" aria-labelledby="event-winners-heading">
                <h3 id="event-winners-heading" className="event-results-block__title">
                  Leaderboard winners
                </h3>
                <p className="event-results-block__lead muted">
                  #1 Best DPS in each role during the event window.
                </p>
                <div className="event-winners-grid" role="list">
                  {METER_ROLE_BUCKETS.map((role) => (
                    <EventWinnerCard
                      key={role}
                      role={role}
                      winner={results.leaderboardWinners[role]}
                      variant="leaderboard"
                      prizeLabel={leaderboardPrizeLabel}
                      meterContext={meterContext}
                    />
                  ))}
                </div>
              </section>

              <section
                className="event-results-block event-results-block--participation"
                aria-labelledby="event-participation-winners-heading"
              >
                <h3 id="event-participation-winners-heading" className="event-results-block__title">
                  Participation draw winners
                </h3>
                <p className="event-results-block__lead muted">
                  One random eligible player per role from all valid event uploads.
                </p>
                <div className="event-winners-grid" role="list">
                  {METER_ROLE_BUCKETS.map((role) => (
                    <EventWinnerCard
                      key={role}
                      role={role}
                      winner={results.participationWinners[role]}
                      variant="participation"
                      prizeLabel={participationPrizeLabel}
                      meterContext={meterContext}
                    />
                  ))}
                </div>
              </section>

              <details className="event-final-standings">
                <summary className="event-final-standings__summary">Final standings (top 12 per role)</summary>
                <div className="event-lb-ranks event-lb-ranks--examon">
                  {METER_ROLE_BUCKETS.map((role) => (
                    <EventLeaderboardRolePanel
                      key={role}
                      role={role}
                      entries={results.stats.playersByBucket[role]}
                      poolDps={results.stats.sortedDpsByBucket[role]}
                      meterContext={meterContext}
                      highlightTopN={1}
                      maxEntries={EVENT_TOP_PLAYERS}
                      emptyLabel="No runs in this role."
                    />
                  ))}
                </div>
              </details>
            </>
          ) : (
            <>
              <div className="event-leaders-grid" role="list" aria-label="Current prize leaders by role">
                {METER_ROLE_BUCKETS.map((role) => (
                  <EventWinnerCard
                    key={role}
                    role={role}
                    winner={results.stats.playersByBucket[role][0]}
                    variant="leaderboard"
                    prizeLabel="Current #1"
                    meterContext={meterContext}
                  />
                ))}
              </div>
              <div className="event-lb-ranks event-lb-ranks--odyssey">
                {METER_ROLE_BUCKETS.map((role) => (
                  <EventLeaderboardRolePanel
                    key={role}
                    role={role}
                    entries={results.stats.playersByBucket[role]}
                    poolDps={results.stats.sortedDpsByBucket[role]}
                    meterContext={meterContext}
                    highlightTopN={1}
                    maxEntries={EVENT_TOP_PLAYERS}
                    emptyLabel="No runs yet for this role."
                  />
                ))}
              </div>
            </>
          )}
        </>
      ) : null}
    </section>
  )
}
