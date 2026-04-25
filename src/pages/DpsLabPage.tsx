import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { fetchDigimonDetail } from '../api/digimonService'
import { skillIconUrl } from '../lib/digimonImage'
import { DEFAULT_ROTATION_SIM_DURATION_SEC, simulateRotation } from '../lib/dpsSim'
import {
  DIGIMON_ROLE_SKILL_CAST_SEC,
  digimonRoleWikiSkills,
  normalizeWikiRole,
  type HybridStance,
} from '../lib/digimonRoleSkills'
import { SKILL_LEVEL_CAP } from '../lib/skillDamage'
import { skillIsSupportOnly } from '../lib/skillDamage'
import { buildSupportSkillEffects } from '../lib/supportEffects'
import type { RotationEvent } from '../lib/dpsSim'
import type { WikiDigimonDetail } from '../types/wikiApi'

/** Table-only: one buff strength value; hover opens a themed breakdown popover. */
function BuffBreakdownBadge({ e }: { e: RotationEvent }) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 300 })

  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  const scheduleClose = () => {
    clearClose()
    closeTimer.current = setTimeout(() => setOpen(false), 220)
  }

  const updatePos = useCallback(() => {
    const t = triggerRef.current
    if (!t) return
    const r = t.getBoundingClientRect()
    const width = Math.min(320, Math.max(260, window.innerWidth - 16))
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
    const top = r.bottom + 8
    setPos({ top, left, width })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    updatePos()
    const onScroll = () => updatePos()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open, updatePos])

  useEffect(() => {
    if (!open) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    }
  }, [])

  if (e.eventType === 'support' || e.buffedBy.length === 0) return null

  const list = e.buffContributions && e.buffContributions.length > 0 ? e.buffContributions : null
  const showNumeric = e.totalBuffPct > 0.05
  const label = showNumeric ? `+${e.totalBuffPct.toFixed(1)}%` : 'Buff'

  const panelInner = (
    <>
      <div className="buff-breakdown-panel-header">Buff breakdown</div>
      {list && list.length > 0 ? (
        <div className="buff-breakdown-sections">
          {list.map((c) => (
            <div key={c.key} className="buff-breakdown-section">
              <div className="buff-breakdown-section-head">
                <span className="buff-breakdown-section-label">{c.label}</span>
                <span className="buff-breakdown-section-pct">+{c.valuePct.toFixed(1)}%</span>
              </div>
              <ul className="buff-breakdown-lines">
                {c.detailLines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : showNumeric ? (
        <p className="buff-breakdown-muted">
          Combined attack, skill, flat (as % of wiki ATK), plus extra expected damage from buff crit
          stats only (wiki baseline crit is not counted as a buff):{' '}
          <strong>+{e.totalBuffPct.toFixed(1)}%</strong> (see sim code for exact stacking).
        </p>
      ) : (
        <p className="buff-breakdown-muted">
          Buffs are active on this line (e.g. attack speed) but they don&apos;t add a combined % to
          this damage row in the current model.
        </p>
      )}
      <div className="buff-breakdown-footer">
        <span className="buff-breakdown-footer-title">Active</span>
        <span className="buff-breakdown-footer-names">{e.buffedBy.join(' · ')}</span>
      </div>
    </>
  )

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="lab-event-tag lab-event-tag-buffed buff-breakdown-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        onMouseEnter={() => {
          clearClose()
          setOpen(true)
          queueMicrotask(updatePos)
        }}
        onMouseLeave={scheduleClose}
        onFocus={() => {
          setOpen(true)
          queueMicrotask(updatePos)
        }}
        onBlur={(ev) => {
          if (panelRef.current?.contains(ev.relatedTarget as Node)) return
          scheduleClose()
        }}
      >
        {label}
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="buff-breakdown-popover"
            role="tooltip"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: pos.width,
              zIndex: 10050,
            }}
            onMouseEnter={clearClose}
            onMouseLeave={scheduleClose}
          >
            <div className="buff-breakdown-panel">{panelInner}</div>
          </div>,
          document.body,
        )}
    </>
  )
}

function toInt(v: string | null, fallback: number) {
  if (v == null || v.trim() === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) ? Math.floor(n) : fallback
}

function parseHybridStance(v: string | null): HybridStance {
  const x = (v ?? '').trim().toLowerCase()
  if (x === 'ranged' || x === 'caster') return x
  return 'melee'
}

export function DpsLabPage() {
  const { search } = useLocation()
  const params = useMemo(() => new URLSearchParams(search), [search])
  const digimonId = params.get('digimonId')?.trim() ?? ''
  const initialLevel = Math.max(1, Math.min(SKILL_LEVEL_CAP, toInt(params.get('level'), 25)))
  const durationFromUrl = useMemo(() => {
    const raw = new URLSearchParams(search).get('duration')
    if (raw == null || raw.trim() === '') return null
    return Math.max(10, toInt(raw, DEFAULT_ROTATION_SIM_DURATION_SEC))
  }, [search])

  const [hybridStance, setHybridStance] = useState<HybridStance>(() =>
    parseHybridStance(params.get('hybrid')),
  )

  const [data, setData] = useState<WikiDigimonDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [globalLevel, setGlobalLevel] = useState(initialLevel)
  const [skillLevels, setSkillLevels] = useState<Record<string, number>>({})
  const [targets, setTargets] = useState(1)
  const [durationSec, setDurationSec] = useState(() =>
    durationFromUrl ?? DEFAULT_ROTATION_SIM_DURATION_SEC,
  )

  useEffect(() => {
    if (durationFromUrl != null) setDurationSec(durationFromUrl)
  }, [durationFromUrl])

  useEffect(() => {
    setGlobalLevel(initialLevel)
    setSkillLevels((prev) => {
      const next = { ...prev }
      Object.keys(next).forEach((k) => {
        next[k] = Math.max(1, Math.min(SKILL_LEVEL_CAP, next[k]))
      })
      return next
    })
  }, [initialLevel])

  useEffect(() => {
    setHybridStance(parseHybridStance(new URLSearchParams(search).get('hybrid')))
  }, [search])

  useEffect(() => {
    if (!digimonId) {
      setData(null)
      setSkillLevels({})
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    setGlobalLevel(initialLevel)
    setSkillLevels({})
    fetchDigimonDetail(digimonId)
      .then((d) => {
        if (!cancelled) {
          setData(d)
          const next: Record<string, number> = {}
          ;(d.skills ?? []).forEach((s) => {
            const cap = Math.max(1, Math.min(s.max_level || SKILL_LEVEL_CAP, SKILL_LEVEL_CAP))
            next[s.id] = Math.max(1, Math.min(cap, initialLevel))
          })
          setSkillLevels(next)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load Digimon.')
          setData(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [digimonId, initialLevel])

  const roleNorm = useMemo(() => normalizeWikiRole(data?.role), [data?.role])
  const isHybridRole = roleNorm === 'hybrid'

  const digimonRoleWikiSkillsForRole = useMemo(
    () =>
      data
        ? digimonRoleWikiSkills(roleNorm, isHybridRole ? hybridStance : 'melee')
        : [],
    [data, roleNorm, isHybridRole, hybridStance],
  )

  const sim = useMemo(() => {
    if (!data) return null
    const secs = Math.max(10, durationSec)
    return simulateRotation(
      data.skills ?? [],
      skillLevels,
      secs,
      Math.max(1, targets),
      data.attack,
      data.stats?.atk_speed ?? 0,
      data.stats?.crit_rate ?? 0,
      {
        role: data.role,
        hybridStance: isHybridRole ? hybridStance : 'best',
      },
    )
  }, [data, durationSec, skillLevels, targets, isHybridRole, hybridStance])

  const breakdown = useMemo(() => {
    if (!sim) return []
    const bySkill = new Map<
      string,
      { name: string; casts: number; damage: number }
    >()
    for (const e of sim.events) {
      if (e.eventType === 'support') continue
      const prev = bySkill.get(e.skillId)
      if (prev) {
        prev.casts += 1
        prev.damage += e.damage
      } else {
        bySkill.set(e.skillId, {
          name: e.skillName,
          casts: 1,
          damage: e.damage,
        })
      }
    }
    return [...bySkill.values()]
      .map((row) => ({
        ...row,
        pct: sim.totalDamage > 0 ? (row.damage / sim.totalDamage) * 100 : 0,
      }))
      .sort((a, b) => b.damage - a.damage)
  }, [sim])

  const rotationAdvice = useMemo(() => {
    if (!data || !sim || breakdown.length === 0) return []
    const lines: string[] = []

    const top = breakdown[0]
    lines.push(
      `Prioritize ${top.name}; it contributes ${top.pct.toFixed(1)}% of total damage.`,
    )

    const transitions = new Map<string, { from: string; to: string; count: number }>()
    for (let i = 0; i < sim.events.length - 1; i += 1) {
      const a = sim.events[i]
      const b = sim.events[i + 1]
      const key = `${a.skillId}->${b.skillId}`
      const prev = transitions.get(key)
      if (prev) prev.count += 1
      else transitions.set(key, { from: a.skillName, to: b.skillName, count: 1 })
    }
    const bestTransition = [...transitions.values()].sort((a, b) => b.count - a.count)[0]
    if (bestTransition && bestTransition.count >= 2) {
      lines.push(
        `Common follow-up: ${bestTransition.from} -> ${bestTransition.to} (${bestTransition.count} times in this timeline).`,
      )
    }

    const supportSkills = (data.skills ?? []).filter((s) =>
      skillIsSupportOnly(s.base_dmg, s.scaling),
    )
    const supportWithAttackBuff = supportSkills.filter((s) =>
      buildSupportSkillEffects(s, skillLevels[s.id] ?? 1).some(
        (e) =>
          e.unit === '%' &&
          /(increase|raise|boost).*(\battack\b|\bskill damage\b|\bskill dmg\b)/i.test(
            e.label,
          ),
      ),
    )
    if (supportWithAttackBuff.length > 0) {
      const burstList = breakdown.slice(0, 3).map((b) => b.name).join(', ')
      const buffNames = supportWithAttackBuff.map((s) => s.name).join(', ')
      lines.push(
        `Use ${buffNames} off cooldown; align these DPS buffs before/with burst skills (${burstList}) when possible.`,
      )
    } else if (supportSkills.length > 0) {
      const names = supportSkills.map((s) => s.name).join(', ')
      lines.push(`Use support skills (${names}) for utility windows; they are excluded from DPS casts.`)
    }

    if (digimonRoleWikiSkillsForRole.length > 0) {
      const tn = digimonRoleWikiSkillsForRole.map((s) => s.name).join(', ')
      lines.push(
        `Digimon role skills (${tn}) are cast when ready like other supports; attack-speed buffs shorten auto spacing and can make autos beat weak filler skills on damage rate. Hover the buff % in the timeline for a per-hit breakdown.`,
      )
    }

    return lines
  }, [breakdown, data, sim, skillLevels, digimonRoleWikiSkillsForRole])

  return (
    <div className="lab lab-page">
      <div className="lab-page-head">
        <h1 className="lab-page-title">Lab</h1>
        {data && (
          <Link className="lab-to-detail-btn" to={`/digimon/${encodeURIComponent(data.id)}`}>
            Go back to {`${data.name}'s page`} →
          </Link>
        )}
      </div>
      <p className="muted">
        This lab runs a timed rotation using your Digimon&apos;s wiki skills plus
        Digimon role skills (passives tied to wiki role; not tamer skills). Same cast
        times and cooldowns as in-game. Supports
        are interpreted for buff durations and effects; when a support is off cooldown
        and its buff isn&apos;t already active, we cast it. Damage skills scale with
        whatever buffs are currently up. Between skills we fill with auto attacks
        until something else is ready. If attack-speed buffs make autos fast enough,
        we may weave an auto instead of casting a ready damage skill when the
        skill&apos;s damage per cast-time second is lower than the current auto rate
        (autos still use ATK% / flat / crit from buffs, not skill damage %).
      </p>
      <p className="muted">
        Whenever you could press a damage skill, we peek a few seconds ahead and
        compare three choices: cast the hardest-hitting skill first (best damage
        per second of cast time); cast another damage skill instead as filler; or
        skip your biggest hit for that short window—only autos and supports—to
        see if waiting lines up better with buffs. We pick whichever option dealt
        the most damage in that preview slice (then apply the auto-vs-skill rate
        check above before actually casting). Preview length is capped (about twelve
        seconds at most), so this is smart timing, not a perfect solve for the entire
        fight.
      </p>

      {!digimonId && (
        <p className="error">
          Open this page from the Digimon detail button (uses
          <code> digimonId </code> in the URL).
        </p>
      )}
      {loading && <p className="muted">Loading Digimon data…</p>}
      {error && <p className="error">{error}</p>}

      {data && (
        <>
          <section className="lab-summary">
            <h2>
              {data.name} <span className="muted">({data.stage})</span>
            </h2>
            <p className="muted">
              {(data.skills ?? []).length} skills loaded. Attack stat:{' '}
              {data.attack.toLocaleString()}
            </p>
          </section>

          <div className="lab-panel">
            <label>
              Skill level
              <input
                type="number"
                min={1}
                max={SKILL_LEVEL_CAP}
                value={globalLevel}
                onChange={(e) => {
                  const v = Math.max(1, Math.min(SKILL_LEVEL_CAP, Number(e.target.value) || 1))
                  setGlobalLevel(v)
                  setSkillLevels((prev) => {
                    const next: Record<string, number> = {}
                    if (!data) return prev
                    ;(data.skills ?? []).forEach((s) => {
                      const cap = Math.max(
                        1,
                        Math.min(s.max_level || SKILL_LEVEL_CAP, SKILL_LEVEL_CAP),
                      )
                      next[s.id] = Math.min(cap, v)
                    })
                    return next
                  })
                }}
              />
            </label>
            <label>
              Targets hit
              <input
                type="number"
                min={1}
                value={targets}
                onChange={(e) => setTargets(Math.max(1, Number(e.target.value) || 1))}
              />
            </label>
            <label>
              Simulation seconds
              <input
                type="number"
                min={10}
                step={5}
                value={durationSec}
                onChange={(e) =>
                  setDurationSec(
                    Math.max(10, Number(e.target.value) || DEFAULT_ROTATION_SIM_DURATION_SEC),
                  )
                }
              />
            </label>
          </div>

          {data && digimonRoleWikiSkillsForRole.length > 0 && (
            <section className="lab-result">
              <h3>Digimon role skills ({data.role})</h3>
              <p className="muted">
                These are passives for the Digimon&apos;s wiki role (tamer role skills are not included yet).
                All use {DIGIMON_ROLE_SKILL_CAST_SEC}s cast time. Hybrid stances are mutually exclusive in the
                sim (switching applies the new stance and drops the previous one). Hit rate and intelligence
                are not applied to DPS yet (in-game INT also affects cooldowns). Skills that only grant those
                (e.g. Ultimate Accuracy, Magia Code: Omega) are listed here but omitted from the rotation sim
                until modeled.
              </p>
              {isHybridRole && (
                <fieldset className="lab-fieldset">
                  <legend>Hybrid stance</legend>
                  {(['melee', 'ranged', 'caster'] as const).map((st) => (
                    <label key={st} className="lab-inline-radio">
                      <input
                        type="radio"
                        name="hybrid-stance"
                        checked={hybridStance === st}
                        onChange={() => setHybridStance(st)}
                      />{' '}
                      {st === 'melee' ? 'Melee' : st === 'ranged' ? 'Ranged' : 'Caster'}
                    </label>
                  ))}
                </fieldset>
              )}
              <div className="lab-table-wrap">
                <table className="lab-table">
                  <thead>
                    <tr>
                      <th>Skill</th>
                      <th>CD</th>
                      <th>Buff duration</th>
                      <th>Cast</th>
                    </tr>
                  </thead>
                  <tbody>
                    {digimonRoleWikiSkillsForRole.map((s) => (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td>{s.cooldown_sec}s</td>
                        <td>{typeof s.buff?.duration === 'number' ? `${s.buff.duration}s` : '—'}</td>
                        <td>{s.cast_time_sec}s</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="lab-result">
            <h3>Skill levels (per skill)</h3>
            <div className="lab-table-wrap">
              <table className="lab-table">
                <thead>
                  <tr>
                    <th>Skill</th>
                    <th>Type</th>
                    <th>Duration</th>
                    <th>Max</th>
                    <th>Level</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.skills ?? []).map((s) => {
                    const cap = Math.max(
                      1,
                      Math.min(s.max_level || SKILL_LEVEL_CAP, SKILL_LEVEL_CAP),
                    )
                    const support = skillIsSupportOnly(s.base_dmg, s.scaling)
                    const levelValue = skillLevels[s.id] ?? Math.min(initialLevel, cap)
                    return (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td>{support ? 'Support' : 'Damage'}</td>
                        <td>
                          {typeof s.buff?.duration === 'number' && s.buff.duration > 0
                            ? `${s.buff.duration}s`
                            : '—'}
                        </td>
                        <td>{cap}</td>
                        <td>
                          <input
                            className="lab-level-input"
                            type="number"
                            min={1}
                            max={cap}
                            value={levelValue}
                            onChange={(e) => {
                              const v = Math.max(
                                1,
                                Math.min(cap, Number(e.target.value) || 1),
                              )
                              setSkillLevels((prev) => ({ ...prev, [s.id]: v }))
                            }}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {sim && (
            <section className="lab-result">
              <h3>Optimal rotation simulation ({sim.durationSec}s)</h3>
              <p className="muted">
                DPS-impacting buffs applied: +{sim.totalDpsBuffPct.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                % (ATK% {sim.attackBuffPct.toLocaleString(undefined, { maximumFractionDigits: 1 })}%, Skill DMG%{' '}
                {sim.skillDamageBuffPct.toLocaleString(undefined, { maximumFractionDigits: 1 })}%, Flat ATK{' '}
                {sim.attackPowerFlat.toLocaleString(undefined, { maximumFractionDigits: 1 })}, Crit Rate{' '}
                {sim.critRatePct.toLocaleString(undefined, { maximumFractionDigits: 2 })}%, Crit DMG{' '}
                {sim.critDamagePct.toLocaleString(undefined, { maximumFractionDigits: 1 })}%)
              </p>
              <p>
                Total damage:{' '}
                <strong>{sim.totalDamage.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
              </p>
              <p>
                Sustained DPS:{' '}
                <strong>
                  {sim.dps.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </strong>{' '}
                /s
              </p>
              <p className="muted">
                Sustained DPS is total damage for the window divided by time — it already includes skills
                <strong> and</strong> autos. &quot;DPS from autos&quot; below is only the auto portion of that same
                total (do not add it to sustained DPS).
              </p>
              <p>
                Auto attacks:{' '}
                <strong>{sim.autoAttackHits.toLocaleString()}</strong> hits,{' '}
                <strong>
                  {sim.autoDamageTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </strong>{' '}
                total damage
                {sim.autoAttackHits > 0 ? (
                  <>
                    {' '}
                    (avg{' '}
                    <strong>
                      {sim.autoDamageAvg.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                    </strong>{' '}
                    per hit)
                  </>
                ) : null}
                ,{' '}
                <strong>
                  {sim.autoDps.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </strong>{' '}
                DPS from autos
                {sim.totalDamage > 0 ? (
                  <span className="muted">
                    {' '}
                    (
                    {((sim.autoDamageTotal / sim.totalDamage) * 100).toFixed(1)}% of total damage)
                  </span>
                ) : null}
                .
              </p>
              <p className="muted">Total casts: {sim.casts}</p>
            </section>
          )}

          {sim && breakdown.length > 0 && (
            <section className="lab-result">
              <h3>Damage breakdown by skill</h3>
              <div className="lab-table-wrap">
                <table className="lab-table">
                  <thead>
                    <tr>
                      <th>Skill</th>
                      <th>Casts</th>
                      <th>Total damage</th>
                      <th>% share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.map((r) => (
                      <tr key={r.name}>
                        <td>{r.name}</td>
                        <td>{r.casts}</td>
                        <td>{r.damage.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        <td>{r.pct.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {rotationAdvice.length > 0 && (
            <section className="lab-result">
              <h3>Rotation Notes</h3>
              <ul className="lab-advice-list">
                {rotationAdvice.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </section>
          )}

          {sim && sim.events.length > 0 && (
            <section className="lab-result">
              <h3>Rotation timeline</h3>
              <p className="muted timeline-buff-hint">
                Icons only here. In the table below, hover the buff % on a row for a full breakdown.
              </p>
              <div className="timeline-sequence" aria-label="Sequential skill icon order">
                {sim.events.map((e, idx) => {
                  const icon = skillIconUrl(e.iconId)
                  return (
                    <span key={`seq-${e.skillId}-${idx}`} className="timeline-seq-node">
                      <span
                        className={
                          e.eventType === 'support'
                            ? 'timeline-seq-item timeline-seq-support'
                            : e.buffedBy.length > 0
                              ? 'timeline-seq-item timeline-seq-buffed'
                              : 'timeline-seq-item'
                        }
                        title={`${e.atSec.toFixed(1)}s · ${e.skillName}`}
                      >
                        {icon ? (
                          <img className="timeline-skill-icon" src={icon} alt="" />
                        ) : (
                          <span className="timeline-fallback">
                            {e.eventType === 'auto' ? 'AA' : e.skillName.slice(0, 2)}
                          </span>
                        )}
                      </span>
                      {idx < sim.events.length - 1 && (
                        <span className="timeline-link" aria-hidden="true">
                          <span className="timeline-link-time">
                            {sim.events[idx + 1].castTimeSec.toFixed(1)}s
                          </span>
                          <span className="timeline-link-arrow">→</span>
                        </span>
                      )}
                    </span>
                  )
                })}
              </div>
              <div className="lab-table-wrap">
                <table className="lab-table">
                  <thead>
                    <tr>
                      <th>T (s)</th>
                      <th>Skill</th>
                      <th>Cast</th>
                      <th>Damage</th>
                      <th>Cumulative</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sim.events.map((e, idx) => (
                      <tr
                        key={`${e.skillId}-${idx}`}
                        className={
                          e.eventType === 'support'
                            ? 'lab-row-support'
                            : e.buffedBy.length > 0
                              ? 'lab-row-buffed'
                              : undefined
                        }
                      >
                        <td>{e.atSec.toFixed(1)}</td>
                        <td>
                          {skillIconUrl(e.iconId) && (
                            <img
                              className="timeline-row-icon"
                              src={skillIconUrl(e.iconId)}
                              alt=""
                            />
                          )}
                          {e.skillName}
                          {e.eventType === 'support' && (
                            <span className="lab-event-tag lab-event-tag-support">Buff</span>
                          )}
                          {e.eventType === 'auto' && (
                            <span className="lab-event-tag">Auto</span>
                          )}
                          <BuffBreakdownBadge e={e} />
                        </td>
                        <td>{e.castTimeSec.toFixed(1)}s</td>
                        <td>{e.damage.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        <td>
                          {e.cumulativeDamage.toLocaleString(undefined, {
                            maximumFractionDigits: 0,
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <p className="lab-cta">
            <Link to={`/digimon/${encodeURIComponent(data.id)}`}>Back to {data.name}</Link>
          </p>
        </>
      )}
    </div>
  )
}
