import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import {
  isPartyParsePayload,
  partyKeyFromPayload,
  partyMembersFromPayload,
  skillsFromPayload,
  totalDamageFromSkills,
  totalHitsFromSkills,
  type MeterPartyMemberStored,
  type MeterSkillRow,
} from '../lib/meterParsePayload'
import { partyMemberChromeStyle } from '../lib/meterPartyColor'
import { meterBarBackgroundForSkill } from '../lib/meterSkillBarGradient'

type MeterParseListRow = {
  id: string
  created_at: string
  duration_sec: number
  app_version: string | null
  total_damage: number
  hit_count: number
  payload: unknown
}

function formatInt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function formatFixed(n: number, digits: number) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function skillTable(
  skills: MeterSkillRow[],
  durationSec: number,
  total: number,
): { skill: string; damage: number; hits: number; dps: number; pct: number }[] {
  const d = Math.max(0, durationSec)
  return [...skills]
    .map((s) => ({
      skill: s.skill,
      damage: s.damage,
      hits: s.hits,
      dps: d > 0 ? s.damage / d : 0,
      pct: total > 0 ? (100 * s.damage) / total : 0,
    }))
    .sort((a, b) => b.damage - a.damage)
}

function partyMembersSortedByDps(members: MeterPartyMemberStored[]): MeterPartyMemberStored[] {
  return [...members].sort((a, b) => {
    const da = a.durationSec > 0 ? a.totalDamage / a.durationSec : 0
    const db = b.durationSec > 0 ? b.totalDamage / b.durationSec : 0
    return db - da
  })
}

function partyRaidTotals(members: MeterPartyMemberStored[]): {
  total: number
  maxDur: number
  raidDps: number
} {
  let total = 0
  let maxDur = 0
  for (const m of members) {
    total += m.totalDamage
    maxDur = Math.max(maxDur, m.durationSec)
  }
  const d = Math.max(maxDur, 1e-6)
  return { total: Math.round(total), maxDur, raidDps: total / d }
}

function SkillBreakdownTable({
  skills,
  durationSec,
  total,
  rowId,
}: {
  skills: MeterSkillRow[]
  durationSec: number
  total: number
  rowId: string
}) {
  const breakdownRows = skillTable(skills, durationSec, total)
  if (skills.length === 0) {
    return (
      <p className="meter-parses-muted meter-parses-meter-empty">No skill breakdown for this player.</p>
    )
  }
  return (
    <section className="meter-breakdown meter-breakdown--compact" aria-label="Damage by skill">
      <div className="meter-breakdown-table meter-breakdown-table--compact">
        <div className="meter-breakdown-colhead meter-breakdown-colhead--compact">
          <span>Skill</span>
          <span className="meter-col-num">Dmg</span>
          <span className="meter-col-pct">%</span>
          <span className="meter-col-hits">#</span>
        </div>
        <div className="meter-breakdown-scroll meter-breakdown-scroll--compact meter-scroll--themed">
          {breakdownRows.map((s, idx) => (
            <div
              key={`${rowId}-sk-${idx}`}
              className="meter-breakdown-row meter-breakdown-row--compact"
            >
              <div
                className="meter-breakdown-bar"
                style={{
                  width: `${Math.min(100, s.pct)}%`,
                  background: meterBarBackgroundForSkill(s.skill),
                }}
                aria-hidden
              />
              <div className="meter-breakdown-row-grid meter-breakdown-row-grid--compact">
                <span className="meter-breakdown-skill" title={s.skill}>
                  {s.skill}
                </span>
                <span className="meter-breakdown-dmg">{formatInt(s.damage)}</span>
                <span className="meter-breakdown-share">{s.pct.toFixed(0)}</span>
                <span className="meter-breakdown-hits">{s.hits}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function MeterParsesPage() {
  const { supabase, user, authReady } = useAuth()
  const location = useLocation()

  const [rows, setRows] = useState<MeterParseListRow[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  /** Per party-parse row: which member's skills are shown (absent key = roster only). */
  const [partyMemberByParseId, setPartyMemberByParseId] = useState<Record<string, string>>({})

  const { individualRows, partyRows } = useMemo(() => {
    const individual: MeterParseListRow[] = []
    const party: MeterParseListRow[] = []
    for (const r of rows) {
      if (isPartyParsePayload(r.payload)) party.push(r)
      else individual.push(r)
    }
    return { individualRows: individual, partyRows: party }
  }, [rows])

  const loadParses = useCallback(async () => {
    if (!supabase || !user) return
    setLoading(true)
    setLoadError(null)
    const { data, error } = await supabase
      .from('meter_parses')
      .select('id, created_at, duration_sec, app_version, total_damage, hit_count, payload')
      .order('created_at', { ascending: false })
      .limit(80)
    setLoading(false)
    if (error) {
      setLoadError(error.message)
      setRows([])
      return
    }
    setRows((data ?? []) as MeterParseListRow[])
  }, [supabase, user])

  useEffect(() => {
    if (!supabase || !user) {
      const t = window.setTimeout(() => {
        setRows([])
        setLoadError(null)
        setLoading(false)
      }, 0)
      return () => window.clearTimeout(t)
    }
    const t = window.setTimeout(() => {
      void loadParses()
    }, 0)
    return () => window.clearTimeout(t)
  }, [supabase, user, loadParses])

  const renderSoloSession = (row: MeterParseListRow) => {
    const skills = skillsFromPayload(row.payload)
    const total =
      skills.length > 0 ? totalDamageFromSkills(skills) : Math.max(0, row.total_damage)
    const hits =
      skills.length > 0 ? totalHitsFromSkills(skills) : Math.max(0, row.hit_count)
    const dur = Math.max(0, row.duration_sec)
    const overallDps = dur > 0 ? total / dur : 0
    const open = expandedIds.has(row.id)
    return (
      <li key={row.id} className="meter-parses-session">
        <button
          type="button"
          className="meter-parses-session-toggle"
          onClick={() => {
            setExpandedIds((prev) => {
              const next = new Set(prev)
              if (next.has(row.id)) next.delete(row.id)
              else next.add(row.id)
              return next
            })
          }}
          aria-expanded={open}
        >
          <time className="meter-parses-session-when" dateTime={row.created_at}>
            {new Date(row.created_at).toLocaleString()}
          </time>
          <span className="meter-parses-session-stats">
            <span className="meter-parses-session-dps">{formatFixed(overallDps, 0)} DPS</span>
            <span className="meter-parses-session-rest">
              {formatInt(total)} dmg · {dur}s · {formatInt(hits)} hits
              {row.app_version ? ` · v${row.app_version}` : ''}
            </span>
          </span>
          <span className="meter-parses-session-chevron" aria-hidden>
            {open ? '▾' : '▸'}
          </span>
        </button>
        {open ? (
          <div className="meter-parses-session-body">
            {skills.length === 0 ? (
              <p className="meter-parses-muted meter-parses-meter-empty">
                No skill breakdown in this payload.
              </p>
            ) : (
              <div className="meter-parses-meter-chrome" aria-label="Meter breakdown">
                <div className="meter-stats-row meter-stats-row--compact">
                  <div className="meter-stat meter-stat--hero meter-stat--compact">
                    <span className="meter-stat-label">DPS</span>
                    <span className="meter-stat-value">{formatFixed(overallDps, 0)}</span>
                  </div>
                  <div className="meter-stat meter-stat--compact">
                    <span className="meter-stat-label">TOTAL</span>
                    <span className="meter-stat-value meter-stat-value--accent">{formatInt(total)}</span>
                  </div>
                  <div className="meter-stat meter-stat--compact">
                    <span className="meter-stat-label">Time</span>
                    <span className="meter-stat-value">{dur}s</span>
                  </div>
                </div>
                <SkillBreakdownTable skills={skills} durationSec={dur} total={total} rowId={row.id} />
              </div>
            )}
          </div>
        ) : null}
      </li>
    )
  }

  const renderPartySession = (row: MeterParseListRow) => {
    const members = partyMembersFromPayload(row.payload)
    const key = partyKeyFromPayload(row.payload) ?? '—'
    const { total, raidDps } = partyRaidTotals(members)
    const open = expandedIds.has(row.id)
    const sorted = partyMembersSortedByDps(members)
    const memberKey = partyMemberByParseId[row.id]
    const selected = memberKey ? members.find((m) => m.memberKey === memberKey) : null

    return (
      <li key={row.id} className="meter-parses-session meter-parses-session--party">
        <button
          type="button"
          className="meter-parses-session-toggle"
          onClick={() => {
            if (open) {
              setPartyMemberByParseId((p) => {
                if (!(row.id in p)) return p
                const { [row.id]: _, ...rest } = p
                return rest
              })
            }
            setExpandedIds((prev) => {
              const next = new Set(prev)
              if (next.has(row.id)) next.delete(row.id)
              else next.add(row.id)
              return next
            })
          }}
          aria-expanded={open}
        >
          <time className="meter-parses-session-when" dateTime={row.created_at}>
            {new Date(row.created_at).toLocaleString()}
          </time>
          <span className="meter-parses-session-stats">
            <span className="meter-parses-session-dps">Party · {formatFixed(raidDps, 0)} comb. DPS</span>
            <span className="meter-parses-session-rest">
              {formatInt(total)} combined · {sorted.length} players · key {key}
              {row.app_version ? ` · v${row.app_version}` : ''}
            </span>
          </span>
          <span className="meter-parses-session-chevron" aria-hidden>
            {open ? '▾' : '▸'}
          </span>
        </button>
        {open ? (
          <div className="meter-parses-session-body">
            <div className="meter-parses-meter-chrome" aria-label="Party meter">
              {!selected ? (
                <>
                  <div className="meter-parses-party-top">
                    <span className="meter-parses-party-label">Party key</span>
                    <code className="meter-parses-party-code">{key}</code>
                  </div>
                  <p className="meter-parses-muted meter-parses-party-hint">
                    Tap a player for skill breakdown (same as the companion party meter).
                  </p>
                  <div className="meter-breakdown-table meter-breakdown-table--compact meter-parses-party-table">
                    <div className="meter-breakdown-colhead meter-breakdown-colhead--compact meter-parses-party-colhead">
                      <span>Player</span>
                      <span className="meter-col-num">DPS</span>
                      <span className="meter-col-num">Tot</span>
                      <span className="meter-col-hits">s</span>
                    </div>
                    <div className="meter-breakdown-scroll meter-breakdown-scroll--compact meter-scroll--themed">
                      {sorted.map((m) => {
                        const dps = m.durationSec > 0 ? m.totalDamage / m.durationSec : 0
                        const chrome = partyMemberChromeStyle(m.memberKey)
                        return (
                          <button
                            key={m.memberKey}
                            type="button"
                            className="meter-parses-party-member"
                            style={{
                              borderLeftWidth: 3,
                              borderLeftStyle: 'solid',
                              borderLeftColor: chrome.borderLeftColor,
                              background: chrome.background,
                            }}
                            onClick={() =>
                              setPartyMemberByParseId((p) => ({ ...p, [row.id]: m.memberKey }))
                            }
                          >
                            <span className="meter-parses-party-name" title={m.displayLabel}>
                              {m.displayLabel}
                            </span>
                            <span className="meter-parses-party-num">{formatInt(dps)}</span>
                            <span className="meter-parses-party-num">{formatInt(m.totalDamage)}</span>
                            <span className="meter-parses-party-num">{m.durationSec.toFixed(0)}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="meter-parses-party-back-row">
                    <button
                      type="button"
                      className="meter-parses-party-back"
                      onClick={() =>
                        setPartyMemberByParseId((p) => {
                          if (!(row.id in p)) return p
                          const { [row.id]: _, ...rest } = p
                          return rest
                        })
                      }
                    >
                      ← Party
                    </button>
                    <span className="meter-parses-party-detail-label muted" title={selected.displayLabel}>
                      {selected.displayLabel.slice(0, 28)}
                    </span>
                  </div>
                  <div className="meter-stats-row meter-stats-row--compact">
                    <div className="meter-stat meter-stat--hero meter-stat--compact">
                      <span className="meter-stat-label">DPS</span>
                      <span className="meter-stat-value">
                        {formatFixed(
                          selected.durationSec > 0 ? selected.totalDamage / selected.durationSec : 0,
                          0,
                        )}
                      </span>
                    </div>
                    <div className="meter-stat meter-stat--compact">
                      <span className="meter-stat-label">TOTAL</span>
                      <span className="meter-stat-value meter-stat-value--accent">
                        {formatInt(selected.totalDamage)}
                      </span>
                    </div>
                    <div className="meter-stat meter-stat--compact">
                      <span className="meter-stat-label">Time</span>
                      <span className="meter-stat-value">{selected.durationSec.toFixed(0)}s</span>
                    </div>
                  </div>
                  <SkillBreakdownTable
                    skills={selected.skills}
                    durationSec={selected.durationSec}
                    total={selected.totalDamage}
                    rowId={`${row.id}-${selected.memberKey}`}
                  />
                </>
              )}
            </div>
          </div>
        ) : null}
      </li>
    )
  }

  if (!authReady) {
    return (
      <div className="auth-shell">
        <div className="auth-card auth-card--compact">
          <div className="auth-corner auth-corner--tl" aria-hidden />
          <div className="auth-corner auth-corner--br" aria-hidden />
          <p className="auth-wait">Loading…</p>
        </div>
      </div>
    )
  }

  if (!supabase || !user) {
    return (
      <Navigate
        to={`/auth?returnTo=${encodeURIComponent(location.pathname)}`}
        replace
      />
    )
  }

  const hasAny = individualRows.length > 0 || partyRows.length > 0

  return (
    <div className="meter-parses-page meter-parses-page--logged">
      <div className="tier-wip-note tier-wip-note-wide tier-wip-note--alert" role="note">
        <p>
          Currently a WIP. This will likely have data wiped after a Client API is added or further
          development is done.
        </p>
      </div>
      <header className="meter-parses-logged-head meter-parses-logged-head--bar">
        <h1 className="meter-parses-title">Meter</h1>
        <button type="button" className="meter-parses-refresh" onClick={() => void loadParses()}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>
      {loadError ? <p className="meter-parses-error meter-parses-error--center">{loadError}</p> : null}
      {loading && rows.length === 0 ? (
        <p className="meter-parses-muted meter-parses-muted--center">Loading parses…</p>
      ) : !hasAny ? (
        <p className="meter-parses-muted meter-parses-muted--center">
          No uploads yet. Use the companion meter to upload a session (solo) or a party snapshot while in a party.
        </p>
      ) : (
        <div className="meter-parses-two-col" role="presentation">
          <section className="meter-parses-section" aria-labelledby="meter-parses-individual-heading">
            <h2 id="meter-parses-individual-heading" className="meter-parses-section-title">
              Individual parses
            </h2>
            {individualRows.length === 0 ? (
              <p className="meter-parses-muted">No solo uploads yet.</p>
            ) : (
              <ul className="meter-parses-overview">{individualRows.map(renderSoloSession)}</ul>
            )}
          </section>
          <section className="meter-parses-section" aria-labelledby="meter-parses-party-heading">
            <h2 id="meter-parses-party-heading" className="meter-parses-section-title">
              Party parses
            </h2>
            {partyRows.length === 0 ? (
              <p className="meter-parses-muted">
                No party uploads yet. Join a party in the companion meter, then upload while the party key is active.
              </p>
            ) : (
              <ul className="meter-parses-overview">{partyRows.map(renderPartySession)}</ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
