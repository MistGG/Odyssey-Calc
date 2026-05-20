import { parseScoreColor } from '../lib/meterParseScoreColor'

const TIERS: { label: string; percentile: number }[] = [
  { label: '0–24', percentile: 12 },
  { label: '25–49', percentile: 37 },
  { label: '50–74', percentile: 62 },
  { label: '75–94', percentile: 85 },
  { label: '95–98', percentile: 96 },
  { label: '99', percentile: 99 },
  { label: '100', percentile: 100 },
]

export function MeterParseColorLegend() {
  return (
    <div className="meter-parse-color-legend" role="note" aria-label="Parse score colors">
      <span className="meter-parse-color-legend-title muted">Parse colors:</span>
      {TIERS.map((t) => (
        <span key={t.label} className="meter-parse-color-legend-item">
          <span
            className="meter-parse-color-legend-swatch"
            style={{ backgroundColor: parseScoreColor(t.percentile) }}
            aria-hidden
          />
          <span style={{ color: parseScoreColor(t.percentile) }}>{t.label}</span>
        </span>
      ))}
    </div>
  )
}
