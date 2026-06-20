import { useCallback, useMemo, useState } from 'react'
import {
  fetchPlayerHallOfFamePastCycleBadges,
  type PlayerHallOfFameCycleSummary,
} from '../lib/meterHallOfFame'
import {
  isMeterLeaderboardCycleLive,
  METER_LEADERBOARD_CYCLES,
  meterLeaderboardCycleShortLabel,
} from '../lib/meterLeaderboardCycles'
import { MeterProfileHallOfFameBadge } from './MeterProfileHallOfFameBadge'

export function MeterPlayerPastSeasonsPanel({
  playerKey,
}: {
  playerKey: string
}) {
  const pastCycleDefs = useMemo(
    () => METER_LEADERBOARD_CYCLES.filter((cycle) => !isMeterLeaderboardCycleLive(cycle)),
    [],
  )
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pastCycles, setPastCycles] = useState<PlayerHallOfFameCycleSummary[]>([])
  const [loaded, setLoaded] = useState(false)

  const loadPastCycles = useCallback(async () => {
    if (loaded || loading || !playerKey.trim() || !pastCycleDefs.length) return
    setLoading(true)
    setLoadError(null)

    const { cycles, error } = await fetchPlayerHallOfFamePastCycleBadges(playerKey)

    if (error) {
      setLoadError(error)
      setLoading(false)
      return
    }

    setPastCycles(cycles)
    setLoaded(true)
    setLoading(false)
  }, [loaded, loading, pastCycleDefs, playerKey])

  const handleToggle = () => {
    const next = !expanded
    setExpanded(next)
    if (next) void loadPastCycles()
  }

  if (!pastCycleDefs.length) return null

  return (
    <section
      className="meter-profile-past-seasons meter-parses-meter-chrome"
      aria-labelledby="profile-past-seasons-title"
    >
      <div className="meter-profile-past-seasons__head">
        <h3 id="profile-past-seasons-title" className="meter-parses-section-title">
          Past seasons
        </h3>
        <button
          type="button"
          className="meter-profile-past-seasons__toggle"
          aria-expanded={expanded}
          onClick={handleToggle}
        >
          {expanded ? 'Hide' : 'Show past seasons'}
        </button>
      </div>

      {loadError ? <p className="meter-parses-error">{loadError}</p> : null}

      {expanded ? (
        loading ? (
          <p className="meter-parses-muted" role="status">
            Loading past season badges…
          </p>
        ) : pastCycles.length ? (
          <div className="meter-profile-past-seasons__stack">
            {pastCycles.map((row) => (
              <PastSeasonBadge key={row.cycle.id} row={row} />
            ))}
          </div>
        ) : loaded ? (
          <p className="meter-parses-muted">No Hall of Fame record breaks in past seasons.</p>
        ) : null
      ) : null}
    </section>
  )
}

function PastSeasonBadge({ row }: { row: PlayerHallOfFameCycleSummary }) {
  const variant = row.cycle.id === 'magia' ? 'magia' : 'olympus'
  const shortLabel = meterLeaderboardCycleShortLabel(row.cycle)
  return (
    <MeterProfileHallOfFameBadge
      variant={variant}
      recordCount={row.recordCount}
      cycleShortLabel={shortLabel}
      hallOfFameCycleId={row.cycle.id}
    />
  )
}
