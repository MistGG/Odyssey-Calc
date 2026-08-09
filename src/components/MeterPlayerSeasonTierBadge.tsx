import type { CSSProperties } from 'react'
import { playerTierColor, type PlayerTierId } from '../lib/meterPlayerTiers'

const WEIGHT_LINES = [
  'Prestige: Hall of Fame record breaks this cycle',
  'Quality: how strong your best clears look',
  'Breadth: how many dungeons you perform well in',
  'Consistency: how steady your clears are overall',
] as const

export function MeterPlayerSeasonTierBadge({
  tier,
  cycleLabel,
}: {
  tier: PlayerTierId
  cycleLabel?: string
}) {
  const color = playerTierColor(tier)
  const label = cycleLabel?.trim() ? `${cycleLabel.trim()} rank` : 'Season rank'

  return (
    <span
      className="lab-inline-tooltip-wrap meter-profile-season-tier"
      style={{ '--tier-color': color } as CSSProperties}
      tabIndex={0}
    >
      <span className="meter-profile-season-tier__badge">
        <span className="meter-profile-season-tier__label">{label}</span>
        <span className="meter-profile-season-tier__name">{tier}</span>
      </span>
      <span className="lab-inline-tooltip meter-profile-season-tier__tooltip" role="tooltip">
        <strong>{tier}</strong>
        <span className="meter-profile-season-tier__tooltip-lead">
          Seasonal meter rank from your best role this cycle:
        </span>
        <ul>
          {WEIGHT_LINES.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </span>
    </span>
  )
}
