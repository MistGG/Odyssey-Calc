import { Link } from 'react-router-dom'
import { digimonPortraitUrl } from '../lib/digimonImage'
import type { PlayerRankEntry } from '../lib/meterPublicStats'
import { METER_ROLE_BUCKET_LABELS, type MeterRoleBucket } from '../lib/meterRoleBuckets'
import { meterPlayerProfilePath } from '../lib/meterPlayerProfile'

function formatInt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function portraitForEntry(e: PlayerRankEntry): string | undefined {
  if (e.portraitUrl?.trim()) return e.portraitUrl
  const iconId = e.iconId?.trim()
  if (iconId) return digimonPortraitUrl(iconId, e.digimonId, e.digimonName)
  return undefined
}

export function EventWinnerCard({
  role,
  winner,
  variant,
  prizeLabel,
  meterContext,
}: {
  role: MeterRoleBucket
  winner: PlayerRankEntry | null | undefined
  variant: 'leaderboard' | 'participation'
  prizeLabel: string
  meterContext: { dungeonId: string; difficultyId: number }
}) {
  const label = METER_ROLE_BUCKET_LABELS[role]
  const variantClass =
    variant === 'leaderboard' ? 'event-winner-card--leaderboard' : 'event-winner-card--participation'

  if (!winner) {
    return (
      <div className={`event-winner-card event-winner-card--empty ${variantClass}`}>
        <span className="event-winner-card__role">{label}</span>
        <p className="event-winner-card__empty muted">No eligible entries</p>
      </div>
    )
  }

  const portrait = portraitForEntry(winner)
  const digimonLabel = winner.digimonName.trim()

  return (
    <div className={`event-winner-card event-winner-card--filled ${variantClass}`}>
      <span className="event-winner-card__role">{label}</span>
      <span className="event-winner-card__prize">{prizeLabel}</span>
      <Link
        to={meterPlayerProfilePath(winner.playerKey)}
        state={{ displayName: winner.displayName, fromMeter: meterContext }}
        className="event-winner-card__player"
      >
        {portrait ? (
          <img className="event-winner-card__portrait" src={portrait} alt="" width={44} height={44} />
        ) : (
          <span className="event-winner-card__portrait event-winner-card__portrait--empty" aria-hidden />
        )}
        <span className="event-winner-card__name">{winner.displayName}</span>
      </Link>
      {digimonLabel ? <span className="event-winner-card__digimon muted">{digimonLabel}</span> : null}
      {variant === 'leaderboard' && winner.dps > 0 ? (
        <span className="event-winner-card__dps">{formatInt(winner.dps)} DPS</span>
      ) : (
        <span className="event-winner-card__hint muted">Random draw winner</span>
      )}
    </div>
  )
}
