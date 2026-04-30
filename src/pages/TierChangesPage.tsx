import { memo, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { contentStatusLabel, type DigimonContentStatus } from '../lib/contentStatus'
import { loadTierListCache } from '../lib/tierList'
import {
  loadTierChangeHistory,
  type TierChangeCause,
  type TierListChangeHistoryRow,
} from './tierList/tierListModel'

const TIER_CHANGES_HIDE_NO_CHANGES_KEY = 'odysseyCalc.tierChanges.hideNoChanges.v1'
const TIER_CHANGES_SHOW_PREVIOUS_KEY = 'odysseyCalc.tierChanges.showPrevious.v1'
const TIER_CHANGES_RUNS_PAGE_SIZE = 5

function readHideNoChangesPref(): boolean {
  try {
    const raw = localStorage.getItem(TIER_CHANGES_HIDE_NO_CHANGES_KEY)
    if (raw == null) return true
    return raw === '1'
  } catch {
    return true
  }
}

function writeHideNoChangesPref(on: boolean) {
  try {
    localStorage.setItem(TIER_CHANGES_HIDE_NO_CHANGES_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function readShowPreviousPref(): boolean {
  try {
    const raw = localStorage.getItem(TIER_CHANGES_SHOW_PREVIOUS_KEY)
    if (raw == null) return false
    return raw === '1'
  } catch {
    return false
  }
}

function writeShowPreviousPref(on: boolean) {
  try {
    localStorage.setItem(TIER_CHANGES_SHOW_PREVIOUS_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function causeLabel(cause: TierChangeCause): string {
  if (cause === 'api') return 'API data'
  return 'Tier'
}

function parseContentStatusToken(raw: string): DigimonContentStatus | 'unknown' {
  const n = raw.trim().toLowerCase()
  if (n === 'complete') return 'complete'
  if (n === 'incomplete') return 'incomplete'
  return 'unknown'
}

/** Short visible copy so status chips stay one line without horizontal scroll in narrow cards */
function statusChipLabel(parsed: DigimonContentStatus | 'unknown', raw: string): string {
  if (parsed === 'complete') return 'Complete'
  if (parsed === 'incomplete') return 'Incomplete'
  const t = raw.trim()
  return t || 'Unknown'
}

function statusChipAriaLabel(parsed: DigimonContentStatus | 'unknown', raw: string): string {
  if (parsed === 'complete') return contentStatusLabel('complete')
  if (parsed === 'incomplete') return contentStatusLabel('incomplete')
  const t = raw.trim()
  return t || 'Unknown'
}

function renderContentStatusChip(parsed: DigimonContentStatus | 'unknown', raw: string) {
  const dotClass =
    parsed === 'complete'
      ? 'tier-status-dot-complete'
      : parsed === 'incomplete'
        ? 'tier-status-dot-incomplete'
        : 'tier-status-dot-unknown'

  return (
    <span
      className={`tier-change-status-chip tier-change-status-chip--${parsed}`}
      aria-label={statusChipAriaLabel(parsed, raw)}
    >
      <span className={`tier-status-dot ${dotClass}`} aria-hidden="true" />
      <span className="tier-change-status-chip-label">{statusChipLabel(parsed, raw)}</span>
    </span>
  )
}

function diffHighlightSegments(before: string, after: string) {
  let left = 0
  const maxLeft = Math.min(before.length, after.length)
  while (left < maxLeft && before[left] === after[left]) left += 1

  let right = 0
  const maxRight = Math.min(before.length - left, after.length - left)
  while (
    right < maxRight &&
    before[before.length - 1 - right] === after[after.length - 1 - right]
  ) {
    right += 1
  }

  return {
    before: {
      prefix: before.slice(0, left),
      changed: before.slice(left, before.length - right),
      suffix: before.slice(before.length - right),
    },
    after: {
      prefix: after.slice(0, left),
      changed: after.slice(left, after.length - right),
      suffix: after.slice(after.length - right),
    },
  }
}

/** `Label: 123 -> 456` (API stat/skill number lines), not quoted text diffs. */
function parseNumericChangeLine(line: string): { label: string; before: string; after: string } | null {
  const arrow = ' -> '
  const aIdx = line.lastIndexOf(arrow)
  if (aIdx === -1) return null
  const afterRaw = line.slice(aIdx + arrow.length).trim()
  const left = line.slice(0, aIdx)
  const cIdx = left.indexOf(': ')
  if (cIdx === -1) return null
  const label = left.slice(0, cIdx).trim()
  const beforeRaw = left.slice(cIdx + 2).trim()
  const numRe = /^-?\d+(?:\.\d+)?$/
  if (!numRe.test(beforeRaw) || !numRe.test(afterRaw)) return null
  return { label, before: beforeRaw, after: afterRaw }
}

function numericStatDedupeKey(label: string, before: string, after: string): string {
  const l = label.trim()
  const canon =
    l === 'Stats.hp' || l === 'HP'
      ? 'hp'
      : l === 'Stats.attack' || l === 'Attack'
        ? 'atk'
        : `raw:${l}`
  return `${canon}|${before}|${after}`
}

function numericStatLabelPreference(label: string): number {
  const l = label.trim()
  if (l === 'HP' || l === 'Attack') return 2
  if (l === 'Stats.hp' || l === 'Stats.attack') return 1
  return 0
}

/** Drop redundant Stats.hp / Stats.attack when HP / Attack exist for same delta (fixes legacy cached rows). */
function dedupeSemanticNumericApiLines(lines: string[]): string[] {
  const bestLineByKey = new Map<string, string>()
  const prefByKey = new Map<string, number>()
  for (const line of lines) {
    const n = parseNumericChangeLine(line)
    if (!n) continue
    const key = numericStatDedupeKey(n.label, n.before, n.after)
    const pref = numericStatLabelPreference(n.label)
    const prev = prefByKey.get(key) ?? -1
    if (pref > prev) {
      prefByKey.set(key, pref)
      bestLineByKey.set(key, line)
    }
  }
  const emittedKey = new Set<string>()
  const seenPlain = new Set<string>()
  const out: string[] = []
  for (const line of lines) {
    const n = parseNumericChangeLine(line)
    if (!n) {
      if (!seenPlain.has(line)) {
        seenPlain.add(line)
        out.push(line)
      }
      continue
    }
    const key = numericStatDedupeKey(n.label, n.before, n.after)
    if (bestLineByKey.get(key) !== line) continue
    if (emittedKey.has(key)) continue
    emittedKey.add(key)
    out.push(line)
  }
  return out
}

function renderDiffBlock(label: string, before: string, after: string, showPrevious: boolean) {
  const seg = diffHighlightSegments(before, after)
  const beforeSide = (
    <div className="tier-change-line-side">
      <span className="tier-change-line-side-tag tier-change-line-side-tag-old">Before</span>
      <span className="tier-change-line-side-text tier-change-line-side-text--clamped">
        {seg.before.prefix}
        {seg.before.changed ? (
          <mark className="tier-diff-highlight tier-diff-highlight-old">{seg.before.changed}</mark>
        ) : null}
        {seg.before.suffix}
      </span>
    </div>
  )
  const afterSide = (
    <div className="tier-change-line-side">
      <span className="tier-change-line-side-tag tier-change-line-side-tag-new">After</span>
      <span className="tier-change-line-side-text tier-change-line-side-text--clamped">
        {seg.after.prefix}
        {seg.after.changed ? (
          <mark className="tier-diff-highlight tier-diff-highlight-new">{seg.after.changed}</mark>
        ) : null}
        {seg.after.suffix}
      </span>
    </div>
  )

  if (!showPrevious) {
    return (
      <div className="tier-change-line-diff tier-change-line-diff--quoted tier-change-line-diff--compact-prev">
        <div className="tier-change-line-label">{label}</div>
        <details className="tier-change-before-fold">
          <summary className="tier-change-before-summary">Previous value</summary>
          {beforeSide}
        </details>
        {afterSide}
      </div>
    )
  }

  return (
    <div className="tier-change-line-diff tier-change-line-diff--quoted">
      <div className="tier-change-line-label">{label}</div>
      {beforeSide}
      {afterSide}
    </div>
  )
}

function formatStatDeltaParen(beforeStr: string, afterStr: string): {
  node: ReactNode
  summary: string
} | null {
  const b = parseFloat(beforeStr)
  const a = parseFloat(afterStr)
  if (!Number.isFinite(b) || !Number.isFinite(a)) return null
  const delta = a - b
  const bothInt = /^-?\d+$/.test(beforeStr.trim()) && /^-?\d+$/.test(afterStr.trim())
  const magStr = bothInt
    ? String(Math.abs(Math.round(delta)))
    : (() => {
        const x = Math.abs(delta)
        return x.toFixed(8).replace(/\.?0+$/, '')
      })()

  if (delta === 0 || (bothInt && Math.round(delta) === 0)) {
    return {
      node: <span className="tier-stat-delta tier-stat-delta--flat"> (0)</span>,
      summary: `${afterStr} (0)`,
    }
  }
  const parens = delta > 0 ? `(+${magStr})` : `(-${magStr})`
  const tone = delta > 0 ? 'gain' : 'loss'
  const summaryPlain = `${afterStr} ${parens}`
  return {
    node: (
      <span className={`tier-stat-delta tier-stat-delta--${tone}`}> {parens}</span>
    ),
    summary: summaryPlain,
  }
}

/** Stats / numeric API lines: same Before/After layout; After shows plain value + colored (±Δ). */
function renderNumericDiffBlock(label: string, before: string, after: string, showPrevious: boolean) {
  const deltaFmt = formatStatDeltaParen(before, after)

  if (!showPrevious) {
    return (
      <div className="tier-change-line-diff tier-change-line-diff--numeric tier-change-line-diff--compact-prev">
        <div className="tier-change-line-label">{label}</div>
        <div className="tier-change-line-side">
          <span className="tier-change-line-side-tag tier-change-line-side-tag-new">Now</span>
          <span className="tier-change-line-side-text tier-change-line-side-text--clamped">
            {after}
            {deltaFmt?.node}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="tier-change-line-diff tier-change-line-diff--numeric">
      <div className="tier-change-line-label">{label}</div>
      <div className="tier-change-line-side">
        <span className="tier-change-line-side-tag tier-change-line-side-tag-old">Before</span>
        <span className="tier-change-line-side-text tier-change-line-side-text--clamped">{before}</span>
      </div>
      <div className="tier-change-line-side">
        <span className="tier-change-line-side-tag tier-change-line-side-tag-new">After</span>
        <span className="tier-change-line-side-text tier-change-line-side-text--clamped">
          {after}
          {deltaFmt?.node}
        </span>
      </div>
    </div>
  )
}

function renderChangeLine(line: string, showPrevious: boolean) {
  const quoted = line.match(/^(.*?): "([\s\S]*)" -> "([\s\S]*)"$/)
  if (quoted) {
    const label = quoted[1]
    const before = quoted[2]
    const after = quoted[3]
    return renderDiffBlock(label, before, after, showPrevious)
  }
  const numeric = parseNumericChangeLine(line)
  if (numeric) {
    return renderNumericDiffBlock(numeric.label, numeric.before, numeric.after, showPrevious)
  }
  return (
    <span className="tier-change-line-plain tier-change-line-side-text--clamped">{line}</span>
  )
}

/** Compact row for simulated tier score lines (DPS / Tank / Healer / Status / newly cached). */
function renderTierScoreLine(line: string, showPrevious: boolean): ReactNode | null {
  const newCached = line.match(/^(DPS|Tank|Healer) newly cached at (.+)$/)
  if (newCached) {
    return (
      <div className="tier-change-summary tier-change-summary--new">
        <span className="tier-change-summary-metric">{newCached[1]}</span>
        <span className="tier-change-summary-new-msg">First score cached</span>
        <span className="tier-change-summary-after tier-change-num">{newCached[2].trim()}</span>
      </div>
    )
  }

  const status = line.match(/^Status (.+) -> (.+)$/)
  if (status) {
    const fromRaw = status[1].trim()
    const toRaw = status[2].trim()
    const fromParsed = parseContentStatusToken(fromRaw)
    const toParsed = parseContentStatusToken(toRaw)

    return (
      <div className="tier-change-summary tier-change-summary--status">
        <span className="tier-change-summary-metric">Status</span>
        <div className="tier-change-status-flow">
          {showPrevious ? (
            <>
              {renderContentStatusChip(fromParsed, fromRaw)}
              <span className="tier-change-status-arrow" aria-hidden="true">
                →
              </span>
            </>
          ) : null}
          {renderContentStatusChip(toParsed, toRaw)}
        </div>
      </div>
    )
  }

  const score = line.match(/^(DPS|Tank|Healer) ([\d.]+) -> ([\d.]+) \(([+-]?[\d.]+)\)$/)
  if (score) {
    const [, metric, before, after, deltaStr] = score
    const delta = parseFloat(deltaStr)
    const tone =
      delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
    const deltaClass =
      tone === 'up'
        ? 'tier-change-summary-delta--up'
        : tone === 'down'
          ? 'tier-change-summary-delta--down'
          : 'tier-change-summary-delta--flat'
    const deltaShow =
      delta > 0 ? `+${deltaStr.replace(/^\+/, '')}` : deltaStr

    return (
      <div className={`tier-change-summary tier-change-summary--score tier-change-summary--${tone}`}>
        <span className="tier-change-summary-metric">{metric}</span>
        <div className="tier-change-summary-values">
          {showPrevious ? (
            <>
              <span className="tier-change-summary-before tier-change-num">{before}</span>
              <span className="tier-change-summary-arrow" aria-hidden>
                →
              </span>
            </>
          ) : null}
          <span className="tier-change-summary-after tier-change-num">{after}</span>
        </div>
        <span className={`tier-change-summary-delta tier-change-num ${deltaClass}`}>{deltaShow}</span>
      </div>
    )
  }

  return null
}

function renderChangeLineSmart(line: string, cause: TierChangeCause, showPrevious: boolean) {
  if (cause === 'tier') {
    const tier = renderTierScoreLine(line, showPrevious)
    if (tier) return tier
  }
  return renderChangeLine(line, showPrevious)
}

type DigimonFeedRow = {
  key: string
  id: string
  name: string
  role: string
  cause: TierChangeCause
  lines: string[]
}

function addLine(
  map: Map<string, DigimonFeedRow>,
  meta: { id: string; name: string; role: string; cause: TierChangeCause },
  line: string,
  seenLine: Set<string>,
) {
  if (seenLine.has(line)) return
  seenLine.add(line)
  const key = `${meta.id}:${meta.cause}`
  const prev = map.get(key)
  if (prev) {
    prev.lines.push(line)
    return
  }
  map.set(key, { key, ...meta, lines: [line] })
}

function buildDigimonFeed(
  row: TierListChangeHistoryRow,
  fallbackNameById: Map<string, string>,
): DigimonFeedRow[] {
  const nameById = new Map((row.sampleDigimon ?? []).map((d) => [d.id, d.name] as const))
  for (const r of row.summary.dpsUp) nameById.set(r.id, r.name)
  for (const r of row.summary.dpsDown) nameById.set(r.id, r.name)
  for (const r of row.summary.dpsNew) nameById.set(r.id, r.name)
  for (const r of row.summary.tankUp) nameById.set(r.id, r.name)
  for (const r of row.summary.tankDown) nameById.set(r.id, r.name)
  for (const r of row.summary.tankNew) nameById.set(r.id, r.name)
  for (const r of row.summary.healerUp) nameById.set(r.id, r.name)
  for (const r of row.summary.healerDown) nameById.set(r.id, r.name)
  for (const r of row.summary.healerNew) nameById.set(r.id, r.name)
  for (const r of row.summary.statusChanges) nameById.set(r.id, r.name)
  const map = new Map<string, DigimonFeedRow>()
  /** Per Digimon + cause: skip exact duplicate lines (e.g. legacy rows with both apiDiffById and apiDiffs). */
  const seenByFeedKey = new Map<string, Set<string>>()

  function seenFor(key: string): Set<string> {
    let s = seenByFeedKey.get(key)
    if (!s) {
      s = new Set<string>()
      seenByFeedKey.set(key, s)
    }
    return s
  }

  for (const r of row.summary.dpsUp) {
    addLine(
      map,
      { id: r.id, name: r.name, role: r.role, cause: 'tier' },
      `DPS ${r.before.toFixed(1)} -> ${r.after.toFixed(1)} (+${r.delta.toFixed(1)})`,
      seenFor(`${r.id}:tier`),
    )
  }
  for (const r of row.summary.dpsDown) {
    addLine(
      map,
      { id: r.id, name: r.name, role: r.role, cause: 'tier' },
      `DPS ${r.before.toFixed(1)} -> ${r.after.toFixed(1)} (${r.delta.toFixed(1)})`,
      seenFor(`${r.id}:tier`),
    )
  }
  for (const r of row.summary.dpsNew) {
    addLine(
      map,
      { id: r.id, name: r.name, role: r.role, cause: 'tier' },
      `DPS newly cached at ${r.after.toFixed(1)}`,
      seenFor(`${r.id}:tier`),
    )
  }

  for (const r of row.summary.tankUp) {
    addLine(
      map,
      { id: r.id, name: r.name, role: r.role, cause: 'tier' },
      `Tank ${r.before.toFixed(2)} -> ${r.after.toFixed(2)} (+${r.delta.toFixed(2)})`,
      seenFor(`${r.id}:tier`),
    )
  }
  for (const r of row.summary.tankDown) {
    addLine(
      map,
      { id: r.id, name: r.name, role: r.role, cause: 'tier' },
      `Tank ${r.before.toFixed(2)} -> ${r.after.toFixed(2)} (${r.delta.toFixed(2)})`,
      seenFor(`${r.id}:tier`),
    )
  }
  for (const r of row.summary.tankNew) {
    addLine(
      map,
      { id: r.id, name: r.name, role: r.role, cause: 'tier' },
      `Tank newly cached at ${r.after.toFixed(2)}`,
      seenFor(`${r.id}:tier`),
    )
  }

  for (const r of row.summary.healerUp) {
    addLine(
      map,
      { id: r.id, name: r.name, role: r.role, cause: 'tier' },
      `Healer ${r.before.toFixed(2)} -> ${r.after.toFixed(2)} (+${r.delta.toFixed(2)})`,
      seenFor(`${r.id}:tier`),
    )
  }
  for (const r of row.summary.healerDown) {
    addLine(
      map,
      { id: r.id, name: r.name, role: r.role, cause: 'tier' },
      `Healer ${r.before.toFixed(2)} -> ${r.after.toFixed(2)} (${r.delta.toFixed(2)})`,
      seenFor(`${r.id}:tier`),
    )
  }
  for (const r of row.summary.healerNew) {
    addLine(
      map,
      { id: r.id, name: r.name, role: r.role, cause: 'tier' },
      `Healer newly cached at ${r.after.toFixed(2)}`,
      seenFor(`${r.id}:tier`),
    )
  }

  for (const r of row.summary.statusChanges) {
    addLine(
      map,
      { id: r.id, name: r.name, role: r.role, cause: 'tier' },
      `Status ${String(r.from ?? 'pending')} -> ${r.to}`,
      seenFor(`${r.id}:tier`),
    )
  }

  for (const [id, lines] of Object.entries(row.apiDiffById ?? {})) {
    const sid = seenFor(`${id}:api`)
    for (const line of lines) {
      addLine(
        map,
        { id, name: nameById.get(id) ?? fallbackNameById.get(id) ?? id, role: '-', cause: 'api' },
        line,
        sid,
      )
    }
  }

  for (const d of row.apiDiffs ?? []) {
    const sid = seenFor(`${d.id}:api`)
    for (const line of d.lines) {
      addLine(
        map,
        { id: d.id, name: d.name || fallbackNameById.get(d.id) || d.id, role: '-', cause: 'api' },
        line,
        sid,
      )
    }
  }

  for (const row of map.values()) {
    if (row.cause === 'api') {
      row.lines = dedupeSemanticNumericApiLines(row.lines)
    }
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}

const TierChangeDigimonCard = memo(function TierChangeDigimonCard({
  runId,
  d,
  showPrevious,
}: {
  runId: string
  d: DigimonFeedRow
  showPrevious: boolean
}) {
  return (
    <article className="tier-changes-digimon-card">
      <div className="tier-changes-digimon-top">
        <Link
          className="tier-changes-digimon-name"
          to={`/lab?digimonId=${encodeURIComponent(d.id)}`}
          aria-label={`Open ${d.name} in DPS Lab`}
        >
          {d.name}
        </Link>
        <span className={`tier-changes-cause tier-changes-cause-${d.cause}`}>{causeLabel(d.cause)}</span>
      </div>
      {d.role && d.role !== '-' ? <p className="tier-changes-digimon-role muted">{d.role}</p> : null}
      <ul className="tier-changes-detail-list">
        {d.lines.map((line, idx) => (
          <li
            key={`${runId}-${d.id}-${idx}`}
            className={`tier-changes-detail-item tier-changes-detail-item--${d.cause}`}
          >
            {renderChangeLineSmart(line, d.cause, showPrevious)}
          </li>
        ))}
      </ul>
    </article>
  )
})

function normalizeDigimonSearch(raw: string): string {
  return raw.trim().toLowerCase()
}

export function TierChangesPage() {
  const location = useLocation()
  const [hideNoChanges, setHideNoChanges] = useState(readHideNoChangesPref)
  const [showPreviousValues, setShowPreviousValues] = useState(readShowPreviousPref)
  const [showApiChanges, setShowApiChanges] = useState(true)
  const [showTierChanges, setShowTierChanges] = useState(true)
  const [digimonSearch, setDigimonSearch] = useState('')
  const [runsVisible, setRunsVisible] = useState(TIER_CHANGES_RUNS_PAGE_SIZE)
  const fallbackNameById = useMemo(() => {
    const map = new Map<string, string>()
    const cache = loadTierListCache()
    for (const [id, e] of Object.entries(cache?.entries ?? {})) {
      if (e.name?.trim()) map.set(id, e.name.trim())
    }
    return map
  }, [])

  const historyRows = useMemo(() => loadTierChangeHistory(), [location.key])

  const rows = useMemo(
    () =>
      historyRows.map((row) => {
        const feed = buildDigimonFeed(row, fallbackNameById)
        const apiCardCount = new Set(feed.filter((d) => d.cause === 'api').map((d) => d.id)).size
        return { row, feed, apiCardCount }
      }),
    [historyRows, fallbackNameById],
  )
  const searchNorm = normalizeDigimonSearch(digimonSearch)
  const visibleRows = rows
    .map((r) => {
      const byCause = r.feed.filter(
        (d) => (d.cause === 'api' && showApiChanges) || (d.cause === 'tier' && showTierChanges),
      )
      const visibleFeed = searchNorm
        ? byCause.filter(
            (d) =>
              d.name.toLowerCase().includes(searchNorm) || d.id.toLowerCase().includes(searchNorm),
          )
        : byCause
      return { ...r, visibleFeed }
    })
    .filter((r) => (hideNoChanges ? r.visibleFeed.length > 0 : true))

  useEffect(() => {
    setRunsVisible(TIER_CHANGES_RUNS_PAGE_SIZE)
  }, [searchNorm, hideNoChanges, showApiChanges, showTierChanges, showPreviousValues])

  const displayedRuns = visibleRows.slice(0, runsVisible)
  const runsRemaining = Math.max(0, visibleRows.length - displayedRuns.length)

  return (
    <div className="lab tier-page">
      <div className="tier-page-head">
        <h1>Tier list changes</h1>
      </div>
      <section className="lab-result">
        <p className="tier-wip-note tier-wip-note-wide">
          This page is a work in progress. Entries are stored locally and reflect comparisons against your cached
          wiki snapshot at the time of each run.
        </p>
        <div className="tier-filter-panel tier-changes-filter-panel">
          <div className="tier-filter-row tier-filter-row--options" role="group" aria-label="Changes page options">
            <span className="tier-filter-label">Options</span>
            <div className="stage-tabs tier-filter-chips">
              <button
                type="button"
                className="stage-tab tier-facet-tab tier-option-chip"
                aria-pressed={hideNoChanges}
                onClick={() =>
                  setHideNoChanges((v) => {
                    const next = !v
                    writeHideNoChangesPref(next)
                    return next
                  })
                }
              >
                Hide entries without changes
              </button>
              <button
                type="button"
                className="stage-tab tier-facet-tab tier-option-chip"
                aria-pressed={showPreviousValues}
                onClick={() =>
                  setShowPreviousValues((v) => {
                    const next = !v
                    writeShowPreviousPref(next)
                    return next
                  })
                }
              >
                Show previous values
              </button>
              <button
                type="button"
                className="stage-tab tier-facet-tab tier-option-chip"
                aria-pressed={showApiChanges}
                onClick={() => setShowApiChanges((v) => !v)}
              >
                API changes
              </button>
              <button
                type="button"
                className="stage-tab tier-facet-tab tier-option-chip"
                aria-pressed={showTierChanges}
                onClick={() => setShowTierChanges((v) => !v)}
              >
                Tier changes
              </button>
            </div>
          </div>
          <div
            className="tier-filter-row tier-filter-row--options tier-changes-search-row"
            role="search"
          >
            <label className="tier-filter-label" htmlFor="tier-changes-digimon-search">
              Search
            </label>
            <input
              id="tier-changes-digimon-search"
              className="tier-changes-search-input"
              type="search"
              placeholder="Digimon name or ID…"
              value={digimonSearch}
              onChange={(e) => setDigimonSearch(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-label="Filter by Digimon name or ID"
            />
          </div>
        </div>
        {visibleRows.length === 0 ? (
          <p className="muted">
            {rows.length === 0 ? (
              <>
                No tier change history yet. Run <Link to="/tier-list">Update tier list</Link> to create
                an entry.
              </>
            ) : searchNorm ? (
              <>No entries match your search and the current filters.</>
            ) : (
              <>No entries match the current filter.</>
            )}
          </p>
        ) : (
          <div className="tier-changes-list">
            {displayedRuns.map(({ row, visibleFeed, apiCardCount }) => {
              const finished = new Date(row.finishedAt)
              const apiShown = Math.max(row.apiCount, apiCardCount)
              return (
              <article key={row.id} className="tier-changes-item tier-changes-run">
                <header className="tier-changes-run-header">
                  <div className="tier-changes-run-header-main">
                    <time className="tier-changes-run-time" dateTime={finished.toISOString()}>
                      {finished.toLocaleString()}
                    </time>
                    <span className={`tier-changes-mode-badge tier-changes-mode-badge--${row.mode}`}>
                      {row.mode === 'force' ? 'Force check' : 'Incremental'}
                    </span>
                  </div>
                  <div className="tier-changes-run-header-meta">
                    <span className="tier-changes-total">{row.refreshedCount} scanned</span>
                    <dl className="tier-changes-run-counts" aria-label="Changes in this run">
                      <div className="tier-changes-run-count">
                        <dt>API</dt>
                        <dd>{apiShown}</dd>
                      </div>
                      <div className="tier-changes-run-count">
                        <dt>Tier</dt>
                        <dd>{row.tierCount}</dd>
                      </div>
                    </dl>
                  </div>
                </header>
                {visibleFeed.length > 0 ? (
                  <div className="tier-changes-digimon-grid">
                    {visibleFeed.map((d) => (
                      <TierChangeDigimonCard
                        key={`${row.id}-${d.key}`}
                        runId={row.id}
                        d={d}
                        showPrevious={showPreviousValues}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="muted tier-changes-run-empty">
                    No entries match the selected change-type filters for this run.
                  </p>
                )}
              </article>
              )
            })}
            {runsRemaining > 0 ? (
              <div className="tier-changes-load-more-wrap">
                <button
                  type="button"
                  className="tier-changes-load-more"
                  onClick={() =>
                    setRunsVisible((n) => Math.min(visibleRows.length, n + TIER_CHANGES_RUNS_PAGE_SIZE))
                  }
                >
                  Show more runs ({runsRemaining} older)
                </button>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  )
}
