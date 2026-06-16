import { MeterProfileHofEntryList } from './MeterProfileHofEntryList'
import type { ProfileHallOfFameEntry } from '../lib/meterHallOfFame'

export function MeterPlayerHallOfFameCard({
  entries,
  loading,
  cycleShortLabel,
  cycleId,
}: {
  entries: ProfileHallOfFameEntry[]
  loading: boolean
  cycleShortLabel: string
  cycleId: string
}) {
  if (loading) {
    return (
      <section className="meter-profile-hof meter-parses-meter-chrome" aria-labelledby="profile-hof-title">
        <h3 id="profile-hof-title" className="meter-parses-section-title">
          Record breaks
        </h3>
        <p className="meter-parses-muted meter-profile-hof__loading">Loading record breaks…</p>
      </section>
    )
  }

  return (
    <section className="meter-profile-hof meter-parses-meter-chrome" aria-labelledby="profile-hof-title">
      <div className="meter-profile-hof__head">
        <div>
          <p className="meter-profile-hof__eyebrow">{cycleShortLabel}</p>
          <h3 id="profile-hof-title" className="meter-parses-section-title meter-profile-hof__title">
            Record breaks
          </h3>
        </div>
        {entries.length > 0 ? (
          <span className="meter-profile-hof__count">
            {entries.length} {entries.length === 1 ? 'induction' : 'inductions'}
          </span>
        ) : null}
      </div>

      {entries.length > 0 ? (
        <MeterProfileHofEntryList entries={entries} cycleId={cycleId} />
      ) : (
        <p className="meter-parses-muted meter-profile-hof__empty">No record breaks this season yet.</p>
      )}
    </section>
  )
}
