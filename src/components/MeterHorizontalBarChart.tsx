import { digimonPortraitUrl } from '../lib/digimonImage'
import type { DigimonBarEntry } from '../lib/meterPublicStats'
import { meterBarBackgroundForSkill } from '../lib/meterSkillBarGradient'

function formatInt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function portraitForEntry(e: DigimonBarEntry): string | undefined {
  if (e.portraitUrl?.trim()) return e.portraitUrl
  const iconId = e.iconId?.trim()
  if (iconId) return digimonPortraitUrl(iconId, e.digimonId, e.digimonName)
  return undefined
}

export function MeterHorizontalBarChart({
  title,
  entries,
  emptyLabel = 'No data yet.',
}: {
  title: string
  entries: DigimonBarEntry[]
  emptyLabel?: string
}) {
  const max = entries.length ? Math.max(...entries.map((e) => e.dps), 1) : 1

  return (
    <section
      className="meter-public-chart meter-parses-meter-chrome"
      aria-labelledby={`chart-${title.replace(/\s/g, '-')}`}
    >
      <h3 id={`chart-${title.replace(/\s/g, '-')}`} className="meter-public-chart-title">
        {title}
      </h3>
      {entries.length === 0 ? (
        <p className="meter-parses-muted">{emptyLabel}</p>
      ) : (
        <div className="meter-breakdown-scroll meter-breakdown-scroll--compact meter-scroll--themed meter-public-digimon-scroll">
          {entries.map((e, i) => {
            const pct = Math.min(100, (100 * e.dps) / max)
            const portrait = portraitForEntry(e)
            return (
              <div
                key={e.digimonId}
                className="meter-breakdown-row meter-breakdown-row--compact meter-public-digimon-row"
              >
                <div
                  className="meter-breakdown-bar"
                  style={{
                    width: `${pct}%`,
                    background: meterBarBackgroundForSkill(e.digimonName),
                  }}
                  aria-hidden
                />
                <div className="meter-breakdown-row-grid meter-public-digimon-row-grid">
                  <span className="meter-breakdown-skill meter-public-digimon-label" title={e.digimonName}>
                    <span className="meter-public-digimon-rank" aria-hidden>
                      {i + 1}.
                    </span>
                    {portrait ? (
                      <img className="meter-party-portrait" src={portrait} alt="" width={22} height={22} />
                    ) : (
                      <span className="meter-party-portrait meter-party-portrait--empty" aria-hidden />
                    )}
                    <span className="meter-breakdown-skill-name">{e.digimonName}</span>
                    <span className="meter-public-digimon-sep" aria-hidden>
                      —
                    </span>
                    <span className="meter-public-digimon-dps">{formatInt(e.dps)} DPS</span>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
