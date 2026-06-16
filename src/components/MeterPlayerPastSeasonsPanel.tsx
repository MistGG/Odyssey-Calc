import type { PlayerHallOfFameCycleSummary } from '../lib/meterHallOfFame'
import { meterLeaderboardCycleShortLabel } from '../lib/meterLeaderboardCycles'
import { MeterProfileHallOfFameBadge } from './MeterProfileHallOfFameBadge'

export function MeterPlayerPastSeasonsPanel({
  pastCycles,
  loading,
}: {
  pastCycles: PlayerHallOfFameCycleSummary[]
  loading: boolean
}) {
  if (loading || !pastCycles.length) return null

  return (
    <section
      className="meter-profile-past-seasons meter-parses-meter-chrome"
      aria-labelledby="profile-past-seasons-title"
    >
      <div className="meter-profile-past-seasons__head">
        <h3 id="profile-past-seasons-title" className="meter-parses-section-title">
          Past seasons
        </h3>
      </div>

      <div className="meter-profile-past-seasons__stack">
        {pastCycles.map((row) => {
          const variant = row.cycle.id === 'magia' ? 'magia' : 'olympus'
          const shortLabel = meterLeaderboardCycleShortLabel(row.cycle)
          return (
            <MeterProfileHallOfFameBadge
              key={row.cycle.id}
              variant={variant}
              recordCount={row.recordCount}
              cycleShortLabel={shortLabel}
              hallOfFameCycleId={row.cycle.id}
            />
          )
        })}
      </div>
    </section>
  )
}
