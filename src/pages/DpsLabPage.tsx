import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { fetchDigimonDetail } from '../api/digimonService'
import { skillIconUrl } from '../lib/digimonImage'
import { simulateRotation } from '../lib/dpsSim'
import { SKILL_LEVEL_CAP } from '../lib/skillDamage'
import { skillIsSupportOnly } from '../lib/skillDamage'
import { parseBuffNumericEffects, parseSupportEffects } from '../lib/supportEffects'
import type { WikiDigimonDetail } from '../types/wikiApi'

function toInt(v: string | null, fallback: number) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.floor(n) : fallback
}

export function DpsLabPage() {
  const { search } = useLocation()
  const params = useMemo(() => new URLSearchParams(search), [search])
  const digimonId = params.get('digimonId')?.trim() ?? ''
  const initialLevel = Math.max(1, Math.min(SKILL_LEVEL_CAP, toInt(params.get('level'), 25)))

  const [data, setData] = useState<WikiDigimonDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [globalLevel, setGlobalLevel] = useState(initialLevel)
  const [skillLevels, setSkillLevels] = useState<Record<string, number>>({})
  const [targets, setTargets] = useState(1)
  const [durationSec, setDurationSec] = useState(60)

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
          d.skills.forEach((s) => {
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

  const sim = useMemo(() => {
    if (!data) return null
    const secs = Math.max(10, durationSec)
    return simulateRotation(
      data.skills,
      skillLevels,
      secs,
      Math.max(1, targets),
      data.attack,
    )
  }, [data, durationSec, skillLevels, targets])

  const breakdown = useMemo(() => {
    if (!sim) return []
    const bySkill = new Map<
      string,
      { name: string; casts: number; damage: number }
    >()
    for (const e of sim.events) {
      if (e.eventType !== 'damage') continue
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

    const supportSkills = data.skills.filter((s) => skillIsSupportOnly(s.base_dmg, s.scaling))
    const supportWithAttackBuff = supportSkills.filter((s) =>
      [
        ...parseSupportEffects(
          `${s.description} ${s.buff?.description ?? ''}`,
          skillLevels[s.id] ?? 1,
        ),
        ...parseBuffNumericEffects(s.buff, skillLevels[s.id] ?? 1),
      ].some(
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

    return lines
  }, [breakdown, data, sim, skillLevels])

  return (
    <div className="lab lab-page">
      <h1>Lab</h1>
      <p className="muted">
        Simulates a simple rotation over time using live wiki skills. Support
        skills are parsed for attack buffs and applied as uptime-weighted
        modifiers.
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
              {data.skills.length} skills loaded. Attack stat:{' '}
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
                    data.skills.forEach((s) => {
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
                onChange={(e) => setDurationSec(Math.max(10, Number(e.target.value) || 60))}
              />
            </label>
          </div>

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
                  {data.skills.map((s) => {
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
                {sim.attackPowerFlat.toLocaleString(undefined, { maximumFractionDigits: 1 })})
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
              <h3>Rotation coach summary</h3>
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
                          <span className="timeline-fallback">{e.skillName.slice(0, 2)}</span>
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
                          {e.eventType === 'damage' && e.buffedBy.length > 0 && (
                            <span className="lab-event-tag lab-event-tag-buffed">
                              +{e.totalBuffPct.toFixed(1)}%
                            </span>
                          )}
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
