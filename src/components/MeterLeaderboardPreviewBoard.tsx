import { Link } from 'react-router-dom'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties } from 'react'
import { digimonPortraitUrl } from '../lib/digimonImage'
import {
  type DigimonDistributionByBucket,
  type DigimonDistributionSeries,
} from '../lib/meterDigimonDistribution'
import {
  type PlayerPartyMatesByBucket,
  type PlayerPartySnapshot,
  formatMeterClearTime,
  portraitForPartyMate,
} from '../lib/meterLeaderboardPartyMates'
import { meterPlayerProfilePath } from '../lib/meterPlayerProfile'
import type { MeterPublicAggregates, PlayerRankEntry } from '../lib/meterPublicStats'
import { dpsToPercentile, parseScoreColor } from '../lib/meterPublicStats'
import {
  filterTamerEntriesByPartySetup,
  type MeterPartySetupFilter,
} from '../lib/meterPartySetup'
import { METER_ROLE_BUCKET_LABELS, METER_ROLE_BUCKETS, fetchDigimonRoleMap, type MeterRoleBucket } from '../lib/meterRoleBuckets'
import { meterBarBackgroundForSkill } from '../lib/meterSkillBarGradient'

const ROLE_ACCENT: Record<MeterRoleBucket, string> = {
  melee: '#f97316',
  ranged: '#84cc16',
  caster: '#c084fc',
  hybrid: '#facc15',
  tank: '#38bdf8',
  healer: '#34d399',
}

const VISIBLE_TAMERS = 40
const PLOT_VIEW_W = 300
const CHART_ROW_HEIGHT = 28
const CHART_PAD = { l: 4, r: 8, t: 0, b: 0 }
const CHART_BOX_HEIGHT = 14

function formatInt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function digimonColor(name: string, alpha = 0.95) {
  return meterBarBackgroundForSkill(name).replace(/[\d.]+\)$/, `${alpha})`)
}

function portraitForDigimon(series: DigimonDistributionSeries): string | undefined {
  if (series.portraitUrl?.trim()) return series.portraitUrl
  const iconId = series.iconId?.trim()
  if (iconId) return digimonPortraitUrl(iconId, series.digimonId, series.digimonName)
  return undefined
}

function portraitForPlayer(e: PlayerRankEntry): string | undefined {
  if (e.portraitUrl?.trim()) return e.portraitUrl
  const iconId = e.iconId?.trim()
  if (iconId) return digimonPortraitUrl(iconId, e.digimonId, e.digimonName)
  return undefined
}

function TamerPartySummaryTooltip({ snapshot }: { snapshot: PlayerPartySnapshot }) {
  const { mates, durationSec } = snapshot
  const clearTime = durationSec != null ? formatMeterClearTime(durationSec) : ''

  return (
    <>
      <div className="meter-lb-preview-tamer-party-tooltip-head">
        <strong className="meter-lb-preview-tamer-tooltip-name">Party</strong>
        {clearTime ? (
          <span className="meter-lb-preview-tamer-party-tooltip-time">{clearTime}</span>
        ) : null}
      </div>
      <ul className="meter-lb-preview-tamer-party-tooltip-list">
        {mates.map((mate) => {
          const portrait = portraitForPartyMate(mate)
          return (
            <li key={mate.playerKey} className="meter-lb-preview-tamer-party-tooltip-row">
              {portrait ? (
                <img
                  src={portrait}
                  alt=""
                  width={22}
                  height={22}
                  className="meter-lb-preview-tamer-party-tooltip-portrait"
                  loading="lazy"
                />
              ) : (
                <span
                  className="meter-lb-preview-portrait meter-lb-preview-portrait--empty meter-lb-preview-tamer-party-tooltip-portrait"
                  aria-hidden
                />
              )}
              <span className="meter-lb-preview-tamer-party-tooltip-copy">
                <span className="meter-lb-preview-tamer-party-tooltip-tamer">{mate.displayName}</span>
                {mate.digimonName ? (
                  <span className="meter-lb-preview-tamer-party-tooltip-digimon">{mate.digimonName}</span>
                ) : null}
              </span>
            </li>
          )
        })}
      </ul>
    </>
  )
}

function TamerPartyColumn({ snapshot }: { snapshot: PlayerPartySnapshot }) {
  const mates = snapshot.mates
  const clearTime =
    snapshot.durationSec != null ? formatMeterClearTime(snapshot.durationSec) : ''
  const wrapRef = useRef<HTMLSpanElement>(null)
  const tooltipId = useId()
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })

  const syncPosition = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setCoords({
      top: rect.top + rect.height / 2,
      left: rect.left - 8,
    })
  }, [])

  const showTooltip = useCallback(() => {
    if (!mates.length) return
    syncPosition()
    setOpen(true)
  }, [mates.length, syncPosition])

  const hideTooltip = useCallback(() => {
    setOpen(false)
  }, [])

  useEffect(() => {
    if (!open) return
    const onScroll = () => hideTooltip()
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [hideTooltip, open])

  if (!mates.length) {
    return (
      <span className="meter-lb-preview-tamer-party-wrap meter-lb-preview-tamer-party-wrap--empty">
        <span className="meter-lb-preview-tamer-party meter-lb-preview-tamer-party--empty" aria-hidden />
      </span>
    )
  }

  return (
    <span
      ref={wrapRef}
      className="meter-lb-preview-tamer-party-wrap"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
      tabIndex={0}
      aria-label={clearTime ? `Party clear time ${clearTime}` : `Party of ${mates.length}`}
      aria-describedby={open ? tooltipId : undefined}
    >
      <span className="meter-lb-preview-tamer-party">
        <span
          className={`meter-lb-preview-tamer-party-time${clearTime ? '' : ' meter-lb-preview-tamer-party-time--unknown'}`}
          aria-hidden
        >
          {clearTime || '—'}
        </span>
      </span>
      {open
        ? createPortal(
            <span
              id={tooltipId}
              role="tooltip"
              className="meter-lb-preview-tamer-tooltip meter-lb-preview-tamer-tooltip--party meter-lb-preview-tamer-tooltip--fixed"
              style={{ top: coords.top, left: coords.left }}
            >
              <TamerPartySummaryTooltip snapshot={snapshot} />
            </span>,
            document.body,
          )
        : null}
    </span>
  )
}

function TamerSelfDigimonTooltip({ entry, id }: { entry: PlayerRankEntry; id: string }) {
  if (!entry.digimonName.trim()) return null
  return (
    <span id={id} role="tooltip" className="lab-inline-tooltip meter-lb-preview-tamer-tooltip meter-lb-preview-tamer-tooltip--self">
      <strong className="meter-lb-preview-tamer-tooltip-name">{entry.digimonName}</strong>
    </span>
  )
}

function chartScoreX(score: number, xMin: number, xMax: number) {
  const plotW = PLOT_VIEW_W - CHART_PAD.l - CHART_PAD.r
  const span = xMax - xMin || 1
  const clamped = Math.max(xMin, Math.min(xMax, score))
  return CHART_PAD.l + ((clamped - xMin) / span) * plotW
}

function chartRowCenterY() {
  return CHART_ROW_HEIGHT / 2
}

function chartXBounds(series: DigimonDistributionSeries[]) {
  const all = series.flatMap((row) => [row.box.whiskerMin, row.box.whiskerMax, ...row.box.outliers])
  if (!all.length) return { xMin: 0, xMax: 100 }

  const rawMin = Math.min(...all)
  const rawMax = Math.max(...all)
  const pad = Math.max(0.5, (rawMax - rawMin) * 0.06)
  let xMin = Math.floor(rawMin - pad)
  let xMax = Math.ceil(rawMax + pad)
  if (xMax - xMin < 10) {
    const mid = (xMin + xMax) / 2
    xMin = Math.floor(mid - 5)
    xMax = Math.ceil(mid + 5)
  }
  return { xMin: Math.max(0, xMin), xMax: Math.min(100, xMax) }
}

function chartXTicks(xMin: number, xMax: number) {
  const span = xMax - xMin
  if (span <= 0) return [Math.round(xMin)]

  const maxTicks = 7
  let step = 1
  if (span > 12) step = 2
  if (span > 24) step = 5
  if (span > 40) step = 10
  if (span > 70) step = 20

  while (Math.floor(span / step) + 1 > maxTicks) {
    if (step === 1) step = 2
    else if (step === 2) step = 5
    else if (step === 5) step = 10
    else if (step === 10) step = 20
    else step *= 2
  }

  const ticks: number[] = []
  const start = Math.ceil(xMin / step) * step
  for (let tick = start; tick <= xMax; tick += step) {
    ticks.push(tick)
  }

  if (ticks.length >= 2) return ticks
  return [Math.round(xMin), Math.round(xMax)]
}

function chartXAxisTickStyle(tick: number, xMin: number, xMax: number, index: number, total: number): CSSProperties {
  const span = xMax - xMin || 1
  const pct = ((tick - xMin) / span) * 100
  if (index === 0) {
    return { left: `${pct}%`, transform: 'translateX(0)' }
  }
  if (index === total - 1) {
    return { left: `${pct}%`, transform: 'translateX(-100%)' }
  }
  return { left: `${pct}%`, transform: 'translateX(-50%)' }
}

function DigimonChartIcon({ row }: { row: DigimonDistributionSeries }) {
  const portrait = portraitForDigimon(row)
  const tooltipId = `digimon-chart-icon-${row.digimonId}`

  return (
    <span className="lab-inline-tooltip-wrap meter-lb-preview-digimon-icon-wrap">
      {portrait ? (
        <img
          src={portrait}
          alt=""
          width={20}
          height={20}
          className="meter-lb-preview-digimon-chart-icon"
          tabIndex={0}
          aria-describedby={tooltipId}
          loading="lazy"
        />
      ) : (
        <span
          className="meter-lb-preview-digimon-chart-icon meter-lb-preview-digimon-chart-icon--empty"
          tabIndex={0}
          aria-describedby={tooltipId}
          aria-hidden
        />
      )}
      <span id={tooltipId} role="tooltip" className="lab-inline-tooltip meter-lb-preview-digimon-icon-tooltip">
        {row.digimonName}
      </span>
    </span>
  )
}

function DigimonBoxTooltipPanel({ row, id }: { row: DigimonDistributionSeries; id: string }) {
  return (
    <span id={id} role="tooltip" className="lab-inline-tooltip meter-lb-preview-digimon-box-tooltip">
      <strong className="meter-lb-preview-digimon-tooltip-name">{row.digimonName}</strong>
      <dl className="rotation-analysis-skill-tooltip-stats meter-lb-preview-digimon-tooltip-stats meter-lb-preview-digimon-tooltip-stats--dps">
        <div>
          <dt>Best DPS</dt>
          <dd>{formatInt(row.bestDps)}</dd>
        </div>
        <div>
          <dt>Average DPS</dt>
          <dd>{formatInt(row.averageDps)}</dd>
        </div>
        <div>
          <dt>Lowest DPS</dt>
          <dd>{formatInt(row.lowestDps)}</dd>
        </div>
      </dl>
    </span>
  )
}

function maxDigimonChartRows(distribution: DigimonDistributionByBucket): number {
  const max = Math.max(1, ...METER_ROLE_BUCKETS.map((bucket) => distribution[bucket].length))
  return max
}

function DigimonChartVerticalGrid({
  xMin,
  xMax,
  xTicks,
}: {
  xMin: number
  xMax: number
  xTicks: number[]
}) {
  return (
    <svg
      className="meter-lb-preview-digimon-chart-grid"
      viewBox={`0 0 ${PLOT_VIEW_W} 100`}
      preserveAspectRatio="none"
      aria-hidden
    >
      {xTicks.map((tick) => (
        <line
          key={tick}
          className="meter-lb-preview-digimon-chart-gridline-v"
          x1={chartScoreX(tick, xMin, xMax)}
          x2={chartScoreX(tick, xMin, xMax)}
          y1={0}
          y2={100}
        />
      ))}
    </svg>
  )
}

function DigimonBoxPlotSvg({
  row,
  xMin,
  xMax,
}: {
  row: DigimonDistributionSeries
  xMin: number
  xMax: number
}) {
  const y = chartRowCenterY()
  const color = digimonColor(row.digimonName)
  const fill = digimonColor(row.digimonName, 0.38)
  const { box } = row
  const xQ1 = chartScoreX(box.q1, xMin, xMax)
  const xQ3 = chartScoreX(box.q3, xMin, xMax)
  const xMedian = chartScoreX(box.median, xMin, xMax)
  const xWhiskerMin = chartScoreX(box.whiskerMin, xMin, xMax)
  const xWhiskerMax = chartScoreX(box.whiskerMax, xMin, xMax)
  const boxTop = y - CHART_BOX_HEIGHT / 2

  return (
    <svg
      className="meter-lb-preview-digimon-row-svg"
      viewBox={`0 0 ${PLOT_VIEW_W} ${CHART_ROW_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <line
        className="meter-lb-preview-digimon-chart-whisker"
        x1={xWhiskerMin}
        x2={xWhiskerMax}
        y1={y}
        y2={y}
        stroke={color}
      />
      <line
        className="meter-lb-preview-digimon-chart-whisker-cap"
        x1={xWhiskerMin}
        x2={xWhiskerMin}
        y1={boxTop + 2}
        y2={boxTop + CHART_BOX_HEIGHT - 2}
        stroke={color}
      />
      <line
        className="meter-lb-preview-digimon-chart-whisker-cap"
        x1={xWhiskerMax}
        x2={xWhiskerMax}
        y1={boxTop + 2}
        y2={boxTop + CHART_BOX_HEIGHT - 2}
        stroke={color}
      />
      <rect
        className="meter-lb-preview-digimon-chart-box"
        x={xQ1}
        y={boxTop}
        width={Math.max(1, xQ3 - xQ1)}
        height={CHART_BOX_HEIGHT}
        fill={fill}
        stroke={color}
      />
      <line
        className="meter-lb-preview-digimon-chart-median"
        x1={xMedian}
        x2={xMedian}
        y1={boxTop}
        y2={boxTop + CHART_BOX_HEIGHT}
        stroke={color}
      />
      {box.outliers.map((score, i) => (
        <circle
          key={`${row.digimonId}-outlier-${i}`}
          className="meter-lb-preview-digimon-chart-outlier"
          cx={chartScoreX(score, xMin, xMax)}
          cy={y}
          r={2.5}
          fill={color}
        />
      ))}
    </svg>
  )
}

function DigimonChartXAxis({ xMin, xMax, xTicks }: { xMin: number; xMax: number; xTicks: number[] }) {
  const plotPadL = (CHART_PAD.l / PLOT_VIEW_W) * 100
  const plotPadR = (CHART_PAD.r / PLOT_VIEW_W) * 100

  return (
    <div className="meter-lb-preview-digimon-chart-xaxis">
      <div className="meter-lb-preview-digimon-chart-xaxis-spacer" aria-hidden />
      <div className="meter-lb-preview-digimon-chart-xaxis-plot">
        <div
          className="meter-lb-preview-digimon-chart-xaxis-track"
          style={{ paddingLeft: `${plotPadL}%`, paddingRight: `${plotPadR}%` }}
        >
          {xTicks.map((tick, index) => (
            <span
              key={tick}
              className="meter-lb-preview-digimon-chart-xaxis-tick"
              style={chartXAxisTickStyle(tick, xMin, xMax, index, xTicks.length)}
            >
              {tick}
            </span>
          ))}
        </div>
        <p className="meter-lb-preview-digimon-chart-axis-label">Score</p>
      </div>
    </div>
  )
}

function DigimonDistributionChart({
  series,
  rowSlots,
}: {
  series: DigimonDistributionSeries[]
  rowSlots: number
}) {
  const hasData = series.length > 0
  const { xMin, xMax } = hasData ? chartXBounds(series) : { xMin: 0, xMax: 100 }
  const xTicks = chartXTicks(xMin, xMax)
  const slots = Array.from({ length: rowSlots }, (_, index) => series[index] ?? null)
  const chartStyle = { '--digimon-chart-rows': rowSlots } as CSSProperties

  return (
    <div
      className="meter-lb-preview-digimon-chart meter-lb-preview-digimon-chart--uniform"
      style={chartStyle}
    >
      <div className="meter-lb-preview-digimon-chart-plot-wrap">
        <div className="meter-lb-preview-digimon-chart-rows">
          {hasData ? <DigimonChartVerticalGrid xMin={xMin} xMax={xMax} xTicks={xTicks} /> : null}
          {slots.map((row, index) => {
            if (!row) {
              return (
                <div
                  key={`empty-slot-${index}`}
                  className="meter-lb-preview-digimon-chart-row meter-lb-preview-digimon-chart-row--empty"
                  aria-hidden
                />
              )
            }
            const tooltipId = `digimon-box-${row.digimonId}`
            return (
              <div key={row.digimonId} className="meter-lb-preview-digimon-chart-row">
                <DigimonChartIcon row={row} />
                <div
                  className="lab-inline-tooltip-wrap meter-lb-preview-digimon-plot-tooltip-wrap"
                  tabIndex={0}
                  aria-describedby={tooltipId}
                >
                  <DigimonBoxPlotSvg row={row} xMin={xMin} xMax={xMax} />
                  <DigimonBoxTooltipPanel row={row} id={tooltipId} />
                </div>
              </div>
            )
          })}
        </div>
        <DigimonChartXAxis xMin={xMin} xMax={xMax} xTicks={xTicks} />
        {!hasData ? (
          <p className="meter-parses-muted meter-lb-preview-digimon-chart-empty">Not enough parses yet.</p>
        ) : null}
      </div>
    </div>
  )
}

export function MeterLeaderboardPreviewBoard({
  digimonDistribution,
  showDigimonStats,
  digimonStatsLoading = false,
  onShowDigimonStatsChange,
  partyMates,
  stats,
  meterContext,
}: {
  digimonDistribution: DigimonDistributionByBucket | null
  showDigimonStats: boolean
  digimonStatsLoading?: boolean
  onShowDigimonStatsChange: (show: boolean) => void
  partyMates: PlayerPartyMatesByBucket
  stats: MeterPublicAggregates
  meterContext: { dungeonId: string; difficultyId: number }
}) {
  const digimonChartRows = digimonDistribution ? maxDigimonChartRows(digimonDistribution) : 1
  const [partySetupFilter, setPartySetupFilter] = useState<MeterPartySetupFilter>('non-standard')
  const [digimonRoleMap, setDigimonRoleMap] = useState<Map<string, string> | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchDigimonRoleMap()
      .then((map) => {
        if (!cancelled) setDigimonRoleMap(map)
      })
      .catch(() => {
        if (!cancelled) setDigimonRoleMap(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="meter-lb-preview-board">
      <div className="meter-lb-preview-body">
        {showDigimonStats ? (
          <section className="meter-lb-preview-section">
            <div className="meter-lb-preview-section-head">
              <div>
                <h3 className="meter-lb-preview-section-title">Digimon statistics</h3>
                <p className="meter-lb-preview-section-note meter-parses-muted">Parse Score Distribution</p>
              </div>
              <button
                type="button"
                className="meter-lb-preview-section-toggle"
                onClick={() => onShowDigimonStatsChange(false)}
              >
                Hide
              </button>
            </div>
            {digimonStatsLoading || !digimonDistribution ? (
              <p className="meter-parses-muted meter-lb-preview-digimon-stats-loading">Loading digimon statistics…</p>
            ) : (
              <div className="meter-lb-preview-role-grid">
                {METER_ROLE_BUCKETS.map((bucket) => (
                  <RoleDigimonCard
                    key={bucket}
                    bucket={bucket}
                    series={digimonDistribution[bucket]}
                    rowSlots={digimonChartRows}
                  />
                ))}
              </div>
            )}
          </section>
        ) : (
          <div className="meter-lb-preview-digimon-reveal">
            <button
              type="button"
              className="meter-lb-preview-section-toggle meter-lb-preview-section-toggle--reveal"
              onClick={() => onShowDigimonStatsChange(true)}
            >
              Show digimon statistics
            </button>
          </div>
        )}

        <section className="meter-lb-preview-section">
          <div className="meter-lb-preview-section-head">
            <div>
              <h3 className="meter-lb-preview-section-title">Tamer rankings</h3>
              <p className="meter-lb-preview-section-note meter-parses-muted">
                Best parse per tamer · top {VISIBLE_TAMERS} per role
                {partySetupFilter === 'standard'
                  ? ' · 1 tank, 1 healer parties'
                  : ' · other party compositions'}
              </p>
            </div>
            <div className="meter-lb-preview-kind-toggle" role="group" aria-label="Party setup">
              <button
                type="button"
                className={`meter-lb-preview-kind-btn${partySetupFilter === 'standard' ? ' meter-lb-preview-kind-btn--active' : ''}`}
                aria-pressed={partySetupFilter === 'standard'}
                onClick={() => setPartySetupFilter('standard')}
              >
                Standard
              </button>
              <button
                type="button"
                className={`meter-lb-preview-kind-btn${partySetupFilter === 'non-standard' ? ' meter-lb-preview-kind-btn--active' : ''}`}
                aria-pressed={partySetupFilter === 'non-standard'}
                onClick={() => setPartySetupFilter('non-standard')}
              >
                Non Standard
              </button>
            </div>
          </div>
          <div className="meter-lb-preview-role-grid">
            {METER_ROLE_BUCKETS.map((bucket) => (
              <RoleTamerCard
                key={bucket}
                bucket={bucket}
                entries={stats.playersByBucket[bucket]}
                poolDps={stats.sortedDpsByBucket[bucket]}
                partyMates={partyMates[bucket]}
                meterContext={meterContext}
                partySetupFilter={partySetupFilter}
                digimonRoleMap={digimonRoleMap}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function RoleDigimonCard({
  bucket,
  series,
  rowSlots,
}: {
  bucket: MeterRoleBucket
  series: DigimonDistributionSeries[]
  rowSlots: number
}) {
  const accent = ROLE_ACCENT[bucket]

  return (
    <article
      className="meter-lb-preview-role-card meter-lb-preview-role-card--digimon meter-parses-meter-chrome"
      style={{ '--role-accent': accent } as CSSProperties}
    >
      <header className="meter-lb-preview-role-card-head">
        <span className="meter-lb-preview-role-dot" aria-hidden />
        <h4>{METER_ROLE_BUCKET_LABELS[bucket]}</h4>
      </header>
      <DigimonDistributionChart series={series} rowSlots={rowSlots} />
    </article>
  )
}

function RoleTamerCard({
  bucket,
  entries,
  poolDps,
  partyMates,
  meterContext,
  partySetupFilter,
  digimonRoleMap,
}: {
  bucket: MeterRoleBucket
  entries: PlayerRankEntry[]
  poolDps: number[]
  partyMates: Record<string, PlayerPartySnapshot>
  meterContext: { dungeonId: string; difficultyId: number }
  partySetupFilter: MeterPartySetupFilter
  digimonRoleMap: Map<string, string> | null
}) {
  const accent = ROLE_ACCENT[bucket]
  const filteredEntries = filterTamerEntriesByPartySetup(
    entries,
    bucket,
    partyMates,
    partySetupFilter,
    digimonRoleMap,
  )
  const filteredPoolDps = digimonRoleMap?.size
    ? filteredEntries.map((entry) => entry.dps).sort((a, b) => a - b)
    : poolDps
  const visible = filteredEntries.slice(0, VISIBLE_TAMERS)

  return (
    <article
      className="meter-lb-preview-role-card meter-parses-meter-chrome"
      style={{ '--role-accent': accent } as CSSProperties}
    >
      <header className="meter-lb-preview-role-card-head">
        <span className="meter-lb-preview-role-dot" aria-hidden />
        <h4>{METER_ROLE_BUCKET_LABELS[bucket]}</h4>
      </header>
      {visible.length === 0 ? (
        <p className="meter-parses-muted meter-lb-preview-role-empty">No rankings yet.</p>
      ) : (
        <div className="meter-lb-preview-tamer-table">
          <div className="meter-lb-preview-tamer-columns" aria-hidden>
            <span className="meter-lb-preview-tamer-col meter-lb-preview-tamer-col--rank">#</span>
            <span className="meter-lb-preview-tamer-col meter-lb-preview-tamer-col--tamer">Tamer</span>
            <span className="meter-lb-preview-tamer-col meter-lb-preview-tamer-col--party">Time</span>
            <span className="meter-lb-preview-tamer-col meter-lb-preview-tamer-col--dps">DPS</span>
            <span className="meter-lb-preview-tamer-col meter-lb-preview-tamer-col--score">Score</span>
          </div>
          <ol className="meter-lb-preview-tamer-list meter-scroll--themed">
          {visible.map((e, i) => {
            const pct = dpsToPercentile(e.dps, filteredPoolDps)
            const color = parseScoreColor(pct)
            const portrait = portraitForPlayer(e)
            const party = partyMates[e.playerKey] ?? { mates: [], durationSec: null }
            const rowKey = `${bucket}-${e.playerKey}-${i}`
            const selfTooltipId = `tamer-self-${rowKey}`
            const hasSelfTooltip = Boolean(e.digimonName.trim())
            return (
              <li key={`${e.playerKey}-${i}`}>
                <Link
                  to={meterPlayerProfilePath(e.playerKey)}
                  state={{ displayName: e.displayName, fromMeter: meterContext }}
                  className="meter-lb-preview-tamer-row"
                >
                  <span className="meter-lb-preview-rank">{i + 1}</span>
                  <span className="meter-lb-preview-tamer-self">
                    {portrait ? (
                      hasSelfTooltip ? (
                        <span className="lab-inline-tooltip-wrap meter-lb-preview-tamer-self-icon-wrap">
                          <img
                            className="meter-lb-preview-portrait meter-lb-preview-tamer-self-portrait"
                            src={portrait}
                            alt=""
                            width={22}
                            height={22}
                            tabIndex={0}
                            aria-describedby={selfTooltipId}
                          />
                          <TamerSelfDigimonTooltip entry={e} id={selfTooltipId} />
                        </span>
                      ) : (
                        <img
                          className="meter-lb-preview-portrait meter-lb-preview-tamer-self-portrait"
                          src={portrait}
                          alt=""
                          width={22}
                          height={22}
                        />
                      )
                    ) : (
                      <span
                        className="meter-lb-preview-portrait meter-lb-preview-portrait--empty meter-lb-preview-tamer-self-portrait"
                        aria-hidden
                      />
                    )}
                    <span className="meter-lb-preview-tamer-name" style={{ color }}>
                      {e.displayName}
                    </span>
                  </span>
                  <TamerPartyColumn snapshot={party} />
                  <span className="meter-lb-preview-dps">{formatInt(e.dps)}</span>
                  <span className="meter-lb-preview-pct" style={{ color }}>
                    {pct}
                  </span>
                </Link>
              </li>
            )
          })}
          </ol>
        </div>
      )}
    </article>
  )
}
