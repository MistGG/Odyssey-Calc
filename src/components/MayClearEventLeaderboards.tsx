import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { digimonPortraitUrl } from '../lib/digimonImage'
import { getPublicDungeonParsesCached, loadDigimonRoleMapForMeter } from '../lib/meterDataSource'
import { aggregatePublicMeterStats, type PlayerRankEntry } from '../lib/meterPublicStats'
import {
  MAY_CLEAR_EVENT,
  mayClearEventMeterNavState,
} from '../lib/mayClearEvent'
import {
  METER_ROLE_BUCKET_LABELS,
  METER_ROLE_BUCKETS,
  type MeterRoleBucket,
} from '../lib/meterRoleBuckets'
import { meterPlayerProfilePath } from '../lib/meterPlayerProfile'
import { MeterPlayerRankingList } from './MeterPlayerRankingList'

const EVENT_TOP_PLAYERS = 12

function formatInt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function portraitForLeader(e: PlayerRankEntry): string | undefined {
  if (e.portraitUrl?.trim()) return e.portraitUrl
  const iconId = e.iconId?.trim()
  if (iconId) return digimonPortraitUrl(iconId, e.digimonId, e.digimonName)
  return undefined
}

function EventLeaderCard({
  role,
  leader,
  meterContext,
}: {
  role: MeterRoleBucket
  leader: PlayerRankEntry | undefined
  meterContext: { dungeonId: string; difficultyId: number }
}) {
  const label = METER_ROLE_BUCKET_LABELS[role]
  if (!leader) {
    return (
      <div className="event-leader-card event-leader-card--empty">
        <span className="event-leader-card__role">{label}</span>
        <p className="event-leader-card__empty muted">No runs yet</p>
      </div>
    )
  }

  const portrait = portraitForLeader(leader)
  const digimonLabel = leader.digimonName.trim()

  return (
    <div className="event-leader-card event-leader-card--filled">
      <span className="event-leader-card__role">{label}</span>
      <span className="event-leader-card__badge">#1 · prize leader</span>
      <Link
        to={meterPlayerProfilePath(leader.playerKey)}
        state={{ displayName: leader.displayName, fromMeter: meterContext }}
        className="event-leader-card__player"
      >
        {portrait ? (
          <img className="event-leader-card__portrait" src={portrait} alt="" width={36} height={36} />
        ) : (
          <span className="event-leader-card__portrait event-leader-card__portrait--empty" aria-hidden />
        )}
        <span className="event-leader-card__name">{leader.displayName}</span>
      </Link>
      {digimonLabel ? <span className="event-leader-card__digimon muted">{digimonLabel}</span> : null}
      <span className="event-leader-card__dps">{formatInt(leader.dps)} DPS</span>
    </div>
  )
}

export function MayClearEventLeaderboards() {
  const { dungeonId, difficultyId } = MAY_CLEAR_EVENT
  const meterContext = useMemo(() => mayClearEventMeterNavState(), [])

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

  const stats = useMemo(() => {
    if (!digimonRoleById.size) return null
    return aggregatePublicMeterStats(rows, digimonRoleById, dungeonId, difficultyId)
  }, [rows, digimonRoleById, dungeonId, difficultyId])

  return (
    <section className="event-panel event-panel--leaderboards" aria-labelledby="event-lb-heading">
      <div className="event-lb-head">
        <div>
          <h2 id="event-lb-heading" className="event-section-title">
            Live leaderboards
          </h2>
          <p className="event-section-lead muted">
            <strong>{MAY_CLEAR_EVENT.dungeonName}</strong> · {MAY_CLEAR_EVENT.difficultyLabel} — best
            parse per player by role. Current #1 in each role wins the crown prize.
          </p>
        </div>
        <Link
          className="event-cta event-cta--ghost event-lb-meter-link"
          to="/meter"
          state={meterContext}
        >
          Full Meter page
        </Link>
      </div>

      {loadError ? <p className="meter-parses-error">{loadError}</p> : null}
      {loading && !stats ? (
        <p className="meter-parses-muted">Loading leaderboards…</p>
      ) : stats ? (
        <>
          <div className="event-leaders-grid" role="list" aria-label="Current prize leaders by role">
            {METER_ROLE_BUCKETS.map((role) => (
              <EventLeaderCard
                key={role}
                role={role}
                leader={stats.playersByBucket[role][0]}
                meterContext={meterContext}
              />
            ))}
          </div>
          <div className="event-lb-ranks">
            {METER_ROLE_BUCKETS.map((role) => (
              <MeterPlayerRankingList
                key={role}
                title={METER_ROLE_BUCKET_LABELS[role]}
                entries={stats.playersByBucket[role]}
                poolDps={stats.sortedDpsByBucket[role]}
                meterContext={meterContext}
                highlightTopN={1}
                maxEntries={EVENT_TOP_PLAYERS}
                emptyLabel="No runs yet for this role."
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  )
}
