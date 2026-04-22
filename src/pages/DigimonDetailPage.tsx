import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchDigimonDetail } from '../api/digimonService'
import { digimonPortraitUrl, rankSpriteStyle, skillIconUrl } from '../lib/digimonImage'
import { digimonStagePortraitGradient } from '../lib/digimonStage'
import {
  SKILL_LEVEL_CAP,
  skillDamageAtLevel,
  skillIsSupportOnly,
  skillSustainDps,
} from '../lib/skillDamage'
import { buildSupportSkillEffects } from '../lib/supportEffects'
import { contentStatusLabel, getDigimonContentStatus } from '../lib/contentStatus'
import { DEFAULT_ROTATION_SIM_DURATION_SEC } from '../lib/dpsSim'
import type { WikiDigimonDetail } from '../types/wikiApi'

function allSkillsLabHref(digimonId: string) {
  const p = new URLSearchParams()
  p.set('digimonId', digimonId)
  p.set('duration', String(DEFAULT_ROTATION_SIM_DURATION_SEC))
  return `/lab?${p.toString()}`
}

export function DigimonDetailPage() {
  const { id: idParam } = useParams()
  const id = idParam ?? ''
  const [data, setData] = useState<WikiDigimonDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [portraitBroken, setPortraitBroken] = useState(false)
  const [skillLevel, setSkillLevel] = useState(SKILL_LEVEL_CAP)

  useEffect(() => {
    if (!id.trim()) {
      setError('Missing Digimon id.')
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchDigimonDetail(id.trim())
      .then((d) => {
        if (!cancelled) {
          setData(d)
          setPortraitBroken(false)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Failed to load.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const nodes = data?.evolution_tree?.nodes ?? []

  const statRows = useMemo(() => {
    const s = data?.stats
    if (!s) return []
    const critRatePct = s.crit_rate / 1000
    const atkSpeedVal = s.atk_speed / 1000
    return [
      ['HP', s.hp],
      ['DS', s.ds],
      ['Attack', s.attack],
      ['Defense', s.defense],
      ['Crit rate', `${s.crit_rate.toLocaleString()} (${critRatePct.toFixed(1)}%)`],
      ['ATK speed', `${s.atk_speed.toLocaleString()} (${atkSpeedVal.toFixed(1)})`],
      ['DEX', s.dex],
      ['INT', s.int],
      ['Evasion', s.evasion],
      ['Hit rate', s.hit_rate],
      ['Block rate', s.block_rate],
    ] as Array<[string, number | string]>
  }, [data])

  if (!id.trim()) {
    return (
      <p className="error" role="alert">
        Invalid Digimon id.
      </p>
    )
  }

  if (loading) return <p className="muted">Loading…</p>
  if (error)
    return (
      <div className="error" role="alert">
        {error}
      </div>
    )
  if (!data) return null

  const portraitSrc = digimonPortraitUrl(data.model_id, data.id, data.name)
  const showPortrait = portraitSrc && !portraitBroken
  const status = getDigimonContentStatus(data.skills)

  return (
    <article className="detail">
      <nav className="breadcrumb">
        <Link to="/">Browse</Link>
        <span aria-hidden="true"> / </span>
        <span>{data.name}</span>
      </nav>

      <header className="detail-header detail-header-split">
        <div className="detail-summary-card">
          <div
            className="detail-art"
            style={{ background: digimonStagePortraitGradient(data.stage) }}
          >
            {showPortrait ? (
              <img
                src={portraitSrc}
                alt=""
                onError={() => setPortraitBroken(true)}
              />
            ) : (
              <span className="thumb-initial">{data.name.slice(0, 1)}</span>
            )}
            {data.rank > 0 && (
              <span className="detail-rank-badge-wrap" aria-hidden="true">
                <span style={rankSpriteStyle(data.rank)} />
              </span>
            )}
          </div>
          <h1 className="detail-summary-name">{data.name}</h1>
          <div className="detail-stage">{data.stage}</div>
          <div className="detail-top-badges">
            <span className="detail-info-pill detail-info-pill-type">
              {data.attribute || 'None'}
            </span>
            <span className="detail-info-pill detail-info-pill-attrib">
              {data.element || 'None'}
            </span>
          </div>
          <div className="detail-summary-cta-row">
            <a
              className="wiki-btn"
              href={`https://thedigitalodyssey.com/wiki#digimon/${encodeURIComponent(data.id)}`}
              target="_blank"
              rel="noreferrer"
            >
              Official wiki
            </a>
            <Link className="wiki-btn detail-lab-sim-btn" to={allSkillsLabHref(data.id)}>
              Simulate in Lab
            </Link>
          </div>
        </div>

        <div className="detail-info-card detail-info-card-side" aria-label="Digimon info">
          <h3>Info</h3>
          <div className="detail-info-row">
            <span className="detail-info-label">Class</span>
            <span className="detail-info-value detail-info-pill detail-info-pill-class">
              + {data.role || 'None'}
            </span>
          </div>
          <div className="detail-info-row">
            <span className="detail-info-label">Family</span>
            <span className="detail-info-value">
              {(data.family_types ?? []).join(', ') || 'None'}
            </span>
          </div>
          <div className="detail-info-row">
            <span className="detail-info-label">Skills</span>
            <span className="detail-info-value detail-info-skills">
              {data.skills?.length ?? 0}
            </span>
          </div>
          <div className="detail-info-row">
            <span className="detail-info-label">Status</span>
            <span
              className={`detail-info-value detail-info-pill ${
                status === 'incomplete' ? 'status-pill-incomplete' : 'status-pill-complete'
              }`}
            >
              {contentStatusLabel(status)}
            </span>
          </div>
        </div>
      </header>

      <section className="section">
        <h2>Combat stats</h2>
        <div className="stats-grid">
          {statRows.map(([label, val]) => (
            <div key={label} className="stat-cell">
              <span className="stat-label">{label}</span>
              <span className="stat-val">
                {typeof val === 'number' ? val.toLocaleString() : val}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>Skills ({data.skills?.length ?? 0})</h2>
        <div className="skill-level-bar">
          <label htmlFor="skill-level">
            Skill level (1–{SKILL_LEVEL_CAP}):{' '}
            <strong>{skillLevel}</strong>
            <span className="muted">
              {' '}
              — damage = base + scaling × (level − 1); sustain = damage ÷ (cast
              + cooldown). Support skills (no damage) are omitted from sustain.
            </span>
          </label>
          <input
            id="skill-level"
            type="range"
            min={1}
            max={SKILL_LEVEL_CAP}
            value={skillLevel}
            onChange={(e) => setSkillLevel(Number(e.target.value))}
          />
        </div>
        <ul className="skill-list">
          {(data.skills ?? []).map((s) => {
            const cap = Math.max(
              1,
              Math.min(s.max_level ?? SKILL_LEVEL_CAP, SKILL_LEVEL_CAP),
            )
            const L = Math.min(skillLevel, cap)
            const dmg = skillDamageAtLevel(
              s.base_dmg,
              s.scaling,
              L,
              cap,
            )
            const dps = skillSustainDps(
              s.base_dmg,
              s.scaling,
              L,
              s.cooldown_sec,
              s.cast_time_sec,
              cap,
            )
            const support = skillIsSupportOnly(s.base_dmg, s.scaling)
            const supportEffects = support ? buildSupportSkillEffects(s, L) : []
            return (
              <li
                key={s.id}
                className={support ? 'skill-panel-support' : undefined}
              >
                <div className="skill-head">
                  {skillIconUrl(s.icon_id) && (
                    <img
                      className="skill-icon"
                      src={skillIconUrl(s.icon_id)}
                      alt=""
                      loading="lazy"
                    />
                  )}
                  <strong>{s.name}</strong>
                  {support && (
                    <span className="skill-tag skill-tag-support">Support</span>
                  )}
                  {typeof s.radius === 'number' && s.radius > 0 && (
                    <span
                      className="skill-tag skill-tag-aoe"
                      title={`Radius ${s.radius.toLocaleString()}`}
                    >
                      AOE
                    </span>
                  )}
                  <span className="muted"> · {s.element}</span>
                </div>
                {s.description?.trim() &&
                  (!support || !s.buff?.description?.trim()) && (
                    <p className="skill-desc">{s.description}</p>
                  )}
                {support && s.description?.trim() && s.buff?.description?.trim() && (
                  <details className="skill-flavor-details">
                    <summary>Skill text</summary>
                    <p className="skill-desc">{s.description}</p>
                  </details>
                )}
                {support && supportEffects.length > 0 && (
                  <ul className="support-effects">
                    {supportEffects.map((e, idx) => (
                      <li key={`${s.id}-fx-${idx}`}>
                        <span className="support-effect-label">{e.label}</span>
                        <span className="support-effect-value">
                          {e.valueAtLevel.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })}
                          {e.unit}
                          {e.perLevel > 0 && (
                            <em>
                              {' '}
                              (Lv1 {e.base}
                              {e.unit}, +{e.perLevel}
                              {e.unit}/lvl)
                            </em>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <dl className="skill-meta">
                  {!support && (
                    <>
                      <div>
                        <dt>Base DMG</dt>
                        <dd>{s.base_dmg.toLocaleString()}</dd>
                      </div>
                      <div>
                        <dt>Scaling / lvl</dt>
                        <dd>+{s.scaling}</dd>
                      </div>
                    </>
                  )}
                  <div>
                    <dt>Max level</dt>
                    <dd>{cap}</dd>
                  </div>
                  {!support && (
                    <div>
                      <dt>DMG @ L{L}</dt>
                      <dd>{dmg.toLocaleString()}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Cooldown</dt>
                    <dd>{s.cooldown_sec}s</dd>
                  </div>
                  <div>
                    <dt>Cast</dt>
                    <dd>{s.cast_time_sec}s</dd>
                  </div>
                  <div>
                    <dt>DS cost</dt>
                    <dd>{s.ds_cost}</dd>
                  </div>
                  {typeof s.buff?.duration === 'number' && s.buff.duration > 0 && (
                    <div>
                      <dt>Duration</dt>
                      <dd>{s.buff.duration}s</dd>
                    </div>
                  )}
                  {typeof s.radius === 'number' && s.radius > 0 && (
                    <div>
                      <dt>Radius</dt>
                      <dd>{s.radius.toLocaleString()}</dd>
                    </div>
                  )}
                  {dps != null && (
                    <div>
                      <dt>Sustain*</dt>
                      <dd>{dps.toFixed(1)} / s</dd>
                    </div>
                  )}
                </dl>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="section">
        <h2>Evolution line</h2>
        {(nodes?.length ?? 0) === 0 ? (
          <p className="muted">No evolution nodes returned.</p>
        ) : (
          <ul className="evo-list">
            {(nodes ?? []).map((n) => (
              <li key={`${n.slot}-${n.digimon_id}`}>
                <Link
                  to={`/digimon/${encodeURIComponent(n.digimon_id)}`}
                  className="evo-line-link"
                >
                  <span className="evo-stage">{n.stage}</span>
                  <span className="evo-name">{n.digimon_name}</span>
                  <span className="muted">Lv {n.open_level}+</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="lab-cta muted">
        Skill damage above follows wiki base + per-level scaling at the slider
        level. Use <strong>Simulate in Lab</strong> in the header to open the
        rotation simulator for this Digimon.
      </p>
    </article>
  )
}
