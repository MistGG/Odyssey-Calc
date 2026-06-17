import type { PlayerRankEntry } from '../lib/meterPublicStats'
import { METER_ROLE_BUCKET_LABELS, type MeterRoleBucket } from '../lib/meterRoleBuckets'
import { MeterPlayerRankingList } from './MeterPlayerRankingList'

export function EventLeaderboardRolePanel({
  role,
  entries,
  poolDps,
  meterContext,
  highlightTopN = 1,
  maxEntries,
  emptyLabel,
}: {
  role: MeterRoleBucket
  entries: PlayerRankEntry[]
  poolDps: number[]
  meterContext: { dungeonId: string; difficultyId: number }
  highlightTopN?: number
  maxEntries?: number
  emptyLabel?: string
}) {
  const label = METER_ROLE_BUCKET_LABELS[role]

  return (
    <div className={`event-lb-role-panel event-lb-role-panel--${role}`}>
      <MeterPlayerRankingList
        title={label}
        entries={entries}
        poolDps={poolDps}
        meterContext={meterContext}
        highlightTopN={highlightTopN}
        maxEntries={maxEntries}
        emptyLabel={emptyLabel}
      />
    </div>
  )
}
