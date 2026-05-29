import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMayClearEventEnded } from '../hooks/useMayClearEventEnded'
import { getPublicDungeonParsesCached, loadDigimonRoleMapForMeter } from '../lib/meterDataSource'
import { MAY_CLEAR_EVENT, type MayClearEventDungeon } from '../lib/mayClearEvent'
import { buildMayClearEventResults } from '../lib/mayClearEventResults'
import {
  METER_ROLE_BUCKET_LABELS,
  METER_ROLE_BUCKETS,
} from '../lib/meterRoleBuckets'
import { EventWinnerCard } from './EventWinnerCard'
import { MeterPlayerRankingList } from './MeterPlayerRankingList'

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

  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [digimonRoleById, setDigimonRoleById] = useState<Map<string, string>>(() => new Map())
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getPublicDungeonParsesCached>>['rows']>(
    [],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    void Promise.all([
      loadDigimonRoleMapForMeter(),
      getPublicDungeonParsesCached({ dungeonId, difficultyId }),
    ]).then(([roles, parseRes]) => {
      if (cancelled) return
      setDigimonRoleById(roles)
      if (parseRes.error) setLoadError(parseRes.error)
      setRows(parseRes.rows)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [dungeonId, difficultyId])

  const results = useMemo(() => {
    if (!digimonRoleById.size) return null
    return buildMayClearEventResults(rows, digimonRoleById, dungeonId)
  }, [rows, digimonRoleById, dungeonId])

  const leaderboardPrizeLabel = `${MAY_CLEAR_EVENT.prizeCrownsPerRole} crowns + ${MAY_CLEAR_EVENT.prizeShopPointsPerRole} shop pts`
  const participationPrizeLabel = `${MAY_CLEAR_EVENT.participationPrizeCrownsPerRole} crowns`

  return (
    <section
      className={`event-panel event-panel--leaderboards${eventEnded ? ' event-panel--ended' : ''}`}
      aria-labelledby="event-lb-heading"
    >
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
        <h2 id="event-lb-heading" className="event-section-title">
          {eventEnded ? 'Final results' : 'Live leaderboards'}
        </h2>
        <p className="event-section-lead muted">
          {eventEnded ? (
            <>
              <strong>{dungeonName}</strong> ({MAY_CLEAR_EVENT.difficultyLabel}): prize leaders by
              Best DPS and participation draw winners, one per role.
            </>
          ) : (
            <>
              <strong>{dungeonName}</strong> ({MAY_CLEAR_EVENT.difficultyLabel}): best parse per
              player by role. Current #1 in each role wins the crown prize until{' '}
              <strong>{MAY_CLEAR_EVENT.eventEndUtcLabel}</strong>.
            </>
          )}
        </p>
      </div>

      {loadError ? <p className="meter-parses-error">{loadError}</p> : null}
      {loading && !results ? (
        <p className="meter-parses-muted">Loading…</p>
      ) : results ? (
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
                <div className="event-lb-ranks">
                  {METER_ROLE_BUCKETS.map((role) => (
                    <MeterPlayerRankingList
                      key={role}
                      title={METER_ROLE_BUCKET_LABELS[role]}
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
              <div className="event-lb-ranks">
                {METER_ROLE_BUCKETS.map((role) => (
                  <MeterPlayerRankingList
                    key={role}
                    title={METER_ROLE_BUCKET_LABELS[role]}
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
