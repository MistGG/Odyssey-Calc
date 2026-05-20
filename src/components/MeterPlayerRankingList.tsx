import { dpsToPercentile, parseScoreColor, type PlayerRankEntry } from '../lib/meterPublicStats'

function formatInt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

export function MeterPlayerRankingList({
  title,
  entries,
  sortedDpsAsc,
  emptyLabel = 'No rankings yet.',
}: {
  title: string
  entries: PlayerRankEntry[]
  sortedDpsAsc: number[]
  emptyLabel?: string
}) {
  return (
    <section
      className="meter-public-rank meter-parses-meter-chrome"
      aria-labelledby={`rank-${title.replace(/\s/g, '-')}`}
    >
      <h3 id={`rank-${title.replace(/\s/g, '-')}`} className="meter-public-chart-title">
        {title}
      </h3>
      {entries.length === 0 ? (
        <p className="meter-parses-muted">{emptyLabel}</p>
      ) : (
        <ol className="meter-public-rank-list meter-scroll--themed">
          {entries.map((e, i) => {
            const pct = dpsToPercentile(e.dps, sortedDpsAsc)
            return (
              <li key={`${e.playerKey}-${i}`} className="meter-public-rank-row">
                <span className="meter-public-rank-num">{i + 1}</span>
                <span
                  className="meter-public-rank-name"
                  style={{ color: parseScoreColor(pct) }}
                  title={`${pct} parse`}
                >
                  {e.displayName}
                </span>
                <span className="meter-public-rank-dps">{formatInt(e.dps)} DPS</span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
