import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { useAuth } from '../auth/useAuth'
import {
  dungeonFromPayload,
  memberDamageTotal,
  memberDigimonBreakdowns,
  partyMembersFromPayload,
  type MeterPartyMemberStored,
} from '../lib/meterParsePayload'
import {
  fetchMyMeterParsePayload,
  fetchMyMeterParses,
} from '../lib/meterDataSource'
import { resolveDigimonFromSkillKeys } from '../lib/meterDigimonSkillResolve'
import { fetchDigimonDetail } from '../api/digimonService'
import { analyzeMeterRotation, type RotationAnalysisResult, type RotationSkillTooltip } from '../lib/rotationAnalysis'
import { clampRotationDurationSec } from '../lib/dpsSim'
import { digimonPortraitUrl, skillIconUrl } from '../lib/digimonImage'
import type { PublicMeterParseRow } from '../lib/meterPublicStats'

function formatFixed(n: number, digits = 0) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function RotationSkillTooltipPanel({ tooltip, id }: { tooltip: RotationSkillTooltip; id: string }) {
  return (
    <span id={id} role="tooltip" className="lab-inline-tooltip rotation-analysis-skill-tooltip">
      <span className="rotation-analysis-skill-tooltip-head">
        <strong className="rotation-analysis-skill-tooltip-name">{tooltip.name}</strong>
        {(tooltip.element || tooltip.isSupport) && (
          <span className="rotation-analysis-skill-tooltip-tags">
            {tooltip.element ? (
              <span className="rotation-analysis-skill-tooltip-meta">{tooltip.element}</span>
            ) : null}
            {tooltip.isSupport ? (
              <span className="rotation-analysis-skill-tooltip-tag">Support</span>
            ) : null}
          </span>
        )}
      </span>
      {tooltip.description ? (
        <p className="rotation-analysis-skill-tooltip-desc">{tooltip.description}</p>
      ) : null}
      <dl className="rotation-analysis-skill-tooltip-stats">
        {!tooltip.isSupport ? (
          <>
            <div>
              <dt>Base DMG</dt>
              <dd>{formatFixed(tooltip.baseDmg)}</dd>
            </div>
            <div>
              <dt>Scaling / lvl</dt>
              <dd>+{formatFixed(tooltip.scaling)}</dd>
            </div>
            <div>
              <dt>DMG @ L{tooltip.skillLevel}</dt>
              <dd>{formatFixed(tooltip.damageAtLevel)}</dd>
            </div>
          </>
        ) : null}
        <div>
          <dt>Cooldown</dt>
          <dd>{tooltip.cooldownSec}s</dd>
        </div>
        <div>
          <dt>Cast</dt>
          <dd>{tooltip.castTimeSec}s</dd>
        </div>
        <div>
          <dt>DS cost</dt>
          <dd>{formatFixed(tooltip.dsCost)}</dd>
        </div>
        {tooltip.radius != null ? (
          <div>
            <dt>Radius</dt>
            <dd>{formatFixed(tooltip.radius)}</dd>
          </div>
        ) : null}
        {tooltip.buffDuration != null ? (
          <div>
            <dt>Duration</dt>
            <dd>{tooltip.buffDuration}s</dd>
          </div>
        ) : null}
      </dl>
    </span>
  )
}

function RotationSuggestionSkillIcon({
  iconId,
  tooltip,
  tooltipId,
}: {
  iconId: string
  tooltip: RotationSkillTooltip
  tooltipId: string
}) {
  const url = skillIconUrl(iconId)
  if (!url) return null
  return (
    <span className="lab-inline-tooltip-wrap rotation-analysis-skill-tooltip-wrap">
      <img
        src={url}
        alt=""
        width={24}
        height={24}
        className="rotation-analysis-suggestion-icon"
        tabIndex={0}
        aria-describedby={tooltipId}
        loading="lazy"
      />
      <RotationSkillTooltipPanel tooltip={tooltip} id={tooltipId} />
    </span>
  )
}

function selfMember(members: MeterPartyMemberStored[]): MeterPartyMemberStored | null {
  return members.find((m) => m.isSelf) ?? members[0] ?? null
}

function primaryDigimon(member: MeterPartyMemberStored) {
  const rows = memberDigimonBreakdowns(member)
  if (!rows.length) return null
  return [...rows].sort((a, b) => b.totalDamage - a.totalDamage)[0]
}

function parseLabel(row: PublicMeterParseRow): string {
  const dungeon = dungeonFromPayload(row.payload)
  const name = row.dungeon_name?.trim() || dungeon?.dungeonName?.trim() || 'Dungeon'
  const diff = row.difficulty?.trim() || dungeon?.difficulty?.trim() || ''
  const date = new Date(row.created_at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${name}${diff ? ` · ${diff}` : ''} · ${date}`
}

function labHrefForAnalysis(digimonId: string, durationSec: number) {
  const p = new URLSearchParams()
  p.set('digimonId', digimonId)
  p.set('duration', String(clampRotationDurationSec(Math.round(durationSec))))
  return `/lab?${p.toString()}`
}

export function RotationAnalysisPage() {
  const { supabase, user, authReady } = useAuth()
  const [rows, setRows] = useState<PublicMeterParseRow[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<RotationAnalysisResult | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [selectedMeta, setSelectedMeta] = useState<PublicMeterParseRow | null>(null)

  const recentRows = useMemo(
    () =>
      rows
        .filter((r) => r.parse_kind === 'dungeon_party' || dungeonFromPayload(r.payload))
        .slice(0, 30),
    [rows],
  )

  const labHref = useMemo(() => {
    if (!analysis?.digimonId) return '/lab'
    return labHrefForAnalysis(analysis.digimonId, analysis.durationSec)
  }, [analysis?.digimonId, analysis?.durationSec])

  useEffect(() => {
    if (!supabase || !user) return
    let cancelled = false
    setLoadingList(true)
    setListError(null)
    void fetchMyMeterParses(supabase).then((res) => {
      if (cancelled) return
      setLoadingList(false)
      if (res.error) {
        setListError(res.error)
        return
      }
      setRows(res.rows)
      if (res.rows[0]?.id) setSelectedId((prev) => prev ?? res.rows[0].id)
    })
    return () => {
      cancelled = true
    }
  }, [supabase, user])

  const runAnalysis = useCallback(
    async (row: PublicMeterParseRow) => {
      if (!supabase) return
      setAnalysisLoading(true)
      setAnalysisError(null)
      setAnalysis(null)
      setSelectedMeta(row)

      try {
        let payloadRow = row
        if (!row.payload) {
          const loaded = await fetchMyMeterParsePayload(supabase, row.id)
          if (!loaded.row?.payload) {
            setAnalysisError(loaded.error ?? 'Could not load parse payload.')
            return
          }
          payloadRow = { ...row, ...loaded.row }
        }

        const members = partyMembersFromPayload(payloadRow.payload)
        const me = selfMember(members)
        if (!me) {
          setAnalysisError('No party member data in this parse.')
          return
        }

        const digimonRow = primaryDigimon(me)
        if (!digimonRow || !digimonRow.skills.length) {
          setAnalysisError('This parse has no skill breakdown for your character.')
          return
        }

        const skillKeys = digimonRow.skills
          .map((s) => s.skillKey?.trim())
          .filter((k): k is string => Boolean(k && k !== '(basic)'))

        const storedId = digimonRow.digimonId?.trim() || me.currentDigimonId?.trim() || ''
        const resolved = storedId
          ? await resolveDigimonFromSkillKeys(storedId, skillKeys)
          : null
        const digimonId = resolved?.digimonId ?? storedId
        if (!digimonId) {
          setAnalysisError('Could not resolve Digimon for this parse.')
          return
        }

        const detail = await fetchDigimonDetail(digimonId)
        const durationSec =
          me.durationSec > 0
            ? me.durationSec
            : Math.max(1, payloadRow.duration_sec ?? 0)
        const totalDamage = memberDamageTotal(me)

        const result = analyzeMeterRotation({
          digimon: detail,
          meterSkills: digimonRow.skills,
          durationSec,
          totalDamage,
        })
        setAnalysis(result)
      } catch (e) {
        setAnalysisError(e instanceof Error ? e.message : 'Analysis failed.')
      } finally {
        setAnalysisLoading(false)
      }
    },
    [supabase],
  )

  useEffect(() => {
    if (!selectedId) return
    const row = recentRows.find((r) => r.id === selectedId)
    if (row) void runAnalysis(row)
  }, [selectedId, recentRows, runAnalysis])

  if (!authReady) {
    return (
      <div className="rotation-analysis-page lab browse">
        <p className="muted">Loading…</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth?returnTo=%2Flab%2Frotation" replace />
  }

  return (
    <div className="rotation-analysis-page lab browse">
      <PageHeader
        title="Rotation analysis"
        lead="Compare your recent meter parses against the Lab auto rotation on the same Digimon and fight length."
        actions={
          <Link to={labHref} className="rotation-analysis-back">
            Open DPS Lab
          </Link>
        }
      />

      <div className="rotation-analysis-layout">
        <aside className="rotation-analysis-list-panel">
          <h2 className="rotation-analysis-subtitle">Recent runs</h2>
          {loadingList ? <p className="muted">Loading parses…</p> : null}
          {listError ? <p className="rotation-analysis-error">{listError}</p> : null}
          {!loadingList && !recentRows.length ? (
            <p className="muted">No dungeon parses yet. Clear a run with the Companion meter first.</p>
          ) : null}
          <ul className="rotation-analysis-run-list">
            {recentRows.map((row) => {
              const active = row.id === selectedId
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    className={`rotation-analysis-run-btn${active ? ' rotation-analysis-run-btn--active' : ''}`}
                    onClick={() => setSelectedId(row.id)}
                  >
                    <span className="rotation-analysis-run-title">{parseLabel(row)}</span>
                    <span className="rotation-analysis-run-meta">
                      {formatFixed(row.duration_sec ?? 0)}s · {formatFixed(row.total_damage ?? 0)} dmg
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </aside>

        <section className="rotation-analysis-detail">
          {analysisLoading ? <p className="muted">Analyzing rotation…</p> : null}
          {analysisError ? <p className="rotation-analysis-error">{analysisError}</p> : null}

          {analysis && selectedMeta ? (
            <>
              <div className="rotation-analysis-summary">
                <div className="rotation-analysis-digimon">
                  <img
                    src={digimonPortraitUrl(
                      analysis.digimonModelId,
                      analysis.digimonId,
                      analysis.digimonName,
                    )}
                    alt=""
                    width={56}
                    height={56}
                    className="rotation-analysis-portrait"
                    loading="lazy"
                  />
                  <div>
                    <h2>{analysis.digimonName}</h2>
                    <p className="muted">
                      {parseLabel(selectedMeta)} · {formatFixed(analysis.durationSec)}s fight
                    </p>
                  </div>
                </div>

                <div className="rotation-analysis-dps">
                  <span className="rotation-analysis-dps-label">Your DPS</span>
                  <strong className="rotation-analysis-dps-value">{formatFixed(analysis.actualDps)}</strong>
                </div>
              </div>

              <div className="rotation-analysis-uptime-card">
                <h3>Uptime vs downtime</h3>
                <p className="muted rotation-analysis-uptime-note">
                  Estimated from your skill hits and wiki cast times. Optimal bar comes from the Lab
                  sim timeline on the same duration.
                </p>
                <div className="rotation-analysis-bar-group">
                  <div className="rotation-analysis-bar-row">
                    <span>Your run</span>
                    <div className="rotation-analysis-bar" aria-hidden="true">
                      <span
                        className="rotation-analysis-bar-fill rotation-analysis-bar-fill--uptime"
                        style={{ width: `${analysis.uptimePct}%` }}
                      />
                    </div>
                    <span>
                      {formatFixed(analysis.uptimePct, 0)}% busy · {formatFixed(analysis.downtimePct, 0)}% idle
                    </span>
                  </div>
                  <div className="rotation-analysis-bar-row">
                    <span>Optimal</span>
                    <div className="rotation-analysis-bar" aria-hidden="true">
                      <span
                        className="rotation-analysis-bar-fill rotation-analysis-bar-fill--optimal"
                        style={{ width: `${analysis.optimalUptimePct}%` }}
                      />
                    </div>
                    <span>
                      {formatFixed(analysis.optimalUptimePct, 0)}% busy ·{' '}
                      {formatFixed(analysis.optimalDowntimePct, 0)}% idle
                    </span>
                  </div>
                </div>
              </div>

              <div className="rotation-analysis-suggestions">
                <h3>Suggestions</h3>
                <ul>
                  {analysis.suggestions.map((s, i) => (
                    <li
                      key={`${s.title}-${i}`}
                      className={`rotation-analysis-suggestion rotation-analysis-suggestion--${s.severity}`}
                    >
                      <div className="rotation-analysis-suggestion-head">
                        {s.skillIconId && s.skillTooltip ? (
                          <RotationSuggestionSkillIcon
                            iconId={s.skillIconId}
                            tooltip={s.skillTooltip}
                            tooltipId={`rotation-skill-tip-${i}`}
                          />
                        ) : null}
                        <strong>{s.title}</strong>
                      </div>
                      <p>{s.detail}</p>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rotation-analysis-skills">
                <h3>Skill usage vs optimal</h3>
                <div className="rotation-analysis-table-wrap">
                  <table className="rotation-analysis-table">
                    <thead>
                      <tr>
                        <th>Skill</th>
                        <th>Your dmg %</th>
                        <th>Optimal %</th>
                        <th>Est. casts</th>
                        <th>Optimal casts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.skillComparisons.map((row) => (
                        <tr key={row.skillName}>
                          <td>{row.skillName}</td>
                          <td>{formatFixed(row.actualDamageSharePct, 1)}%</td>
                          <td>{formatFixed(row.optimalDamageSharePct, 1)}%</td>
                          <td>{formatFixed(row.estimatedCasts)}</td>
                          <td>{formatFixed(row.optimalCasts)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  )
}
