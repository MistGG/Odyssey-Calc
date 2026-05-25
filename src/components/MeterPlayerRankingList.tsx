import { Link } from 'react-router-dom'
import { digimonPortraitUrl } from '../lib/digimonImage'
import { meterPlayerProfilePath } from '../lib/meterPlayerProfile'
import { dpsToPercentile, parseScoreColor, type PlayerRankEntry } from '../lib/meterPublicStats'

function formatInt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function portraitForPlayerEntry(e: PlayerRankEntry): string | undefined {
  if (e.portraitUrl?.trim()) return e.portraitUrl
  const iconId = e.iconId?.trim()
  if (iconId) return digimonPortraitUrl(iconId, e.digimonId, e.digimonName)
  return undefined
}

export function MeterPlayerRankingList({
  title,
  entries,
  poolDps,
  emptyLabel = 'No rankings yet.',
  meterContext,
}: {
  title: string
  entries: PlayerRankEntry[]
  /** All best-parse DPS values in this role bucket (used for parse % vs top). */
  poolDps: number[]
  emptyLabel?: string
  meterContext?: { dungeonId: string; difficultyId: number }
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
            const pct = dpsToPercentile(e.dps, poolDps)
            const portrait = portraitForPlayerEntry(e)
            const digimonLabel = e.digimonName.trim()
            return (
              <li key={`${e.playerKey}-${i}`}>
                <Link
                  to={meterPlayerProfilePath(e.playerKey)}
                  state={{
                    displayName: e.displayName,
                    fromMeter: meterContext,
                  }}
                  className="meter-public-rank-row meter-public-rank-row--link"
                  title={
                    digimonLabel
                      ? `View ${e.displayName} (${digimonLabel}) profile`
                      : `View ${e.displayName} profile`
                  }
                >
                  <span className="meter-public-rank-num">{i + 1}</span>
                  <span className="meter-public-rank-name" style={{ color: parseScoreColor(pct) }}>
                    {portrait ? (
                      <img
                        className="meter-party-portrait meter-public-rank-portrait"
                        src={portrait}
                        alt=""
                        width={20}
                        height={20}
                      />
                    ) : (
                      <span
                        className="meter-party-portrait meter-party-portrait--empty meter-public-rank-portrait"
                        aria-hidden
                      />
                    )}
                    <span className="meter-public-rank-name-text">
                      {e.displayName}
                      {digimonLabel ? (
                        <span className="meter-public-rank-digimon"> ({digimonLabel})</span>
                      ) : null}
                    </span>
                  </span>
                  <span className="meter-public-rank-dps">{formatInt(e.dps)} DPS</span>
                </Link>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
