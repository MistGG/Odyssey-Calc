import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchDigimonDetail } from '../api/digimonService'
import { digimonPortraitUrl, skillIconUrl } from '../lib/digimonImage'
import {
  SKILL_LEVEL_CAP,
  skillDamageAtLevel,
  skillIsSupportOnly,
  skillSustainDps,
} from '../lib/skillDamage'
import { parseBuffNumericEffects, parseSupportEffects } from '../lib/supportEffects'
import type { WikiDigimonDetail } from '../types/wikiApi'

function allSkillsLabHref(digimonId: string) {
  const p = new URLSearchParams()
  p.set('digimonId', digimonId)
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
    return [
      ['HP', s.hp],
      ['DS', s.ds],
      ['Attack', s.attack],
      ['Defense', s.defense],
      ['Crit rate', s.crit_rate],
      ['ATK speed', s.atk_speed],
      ['Evasion', s.evasion],
      ['Hit rate', s.hit_rate],
      ['Block rate', s.block_rate],
    ] as const
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

  return (
    <article className="detail">
      <nav className="breadcrumb">
        <Link to="/">Browse</Link>
        <span aria-hidden="true"> / </span>
        <span>{data.name}</span>
      </nav>

      <header
        className={`detail-header ${showPortrait ? '' : 'detail-header-textonly'}`}
      >
        {showPortrait && (
          <div className="detail-art">
            <img
              src={portraitSrc}
              alt=""
              onError={() => setPortraitBroken(true)}
            />
          </div>
        )}
        <div className="detail-intro">
          <h1>{data.name}</h1>
          <ul className="chips">
            <li>{data.stage}</li>
            <li>{data.element}</li>
            <li>{data.attribute}</li>
            <li>{data.role}</li>
            <li>Rank {data.rank}</li>
          </ul>
          <p className="muted">
            Family: {(data.family_types ?? []).join(', ') || '—'}
          </p>
        </div>
      </header>

      <section className="section">
        <h2>Combat stats</h2>
        <div className="stats-grid">
          {statRows.map(([label, val]) => (
            <div key={label} className="stat-cell">
              <span className="stat-label">{label}</span>
              <span className="stat-val">{val.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>Skills ({data.skills?.length ?? 0})</h2>
        <div className="skill-level-bar">
          <p className="skill-actions">
            <Link to={allSkillsLabHref(data.id)}>
              Send all skills to Lab
            </Link>
          </p>
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
            const supportEffects = support
              ? [
                  ...parseSupportEffects(
                    `${s.description} ${s.buff?.description ?? ''}`,
                    L,
                  ),
                  ...parseBuffNumericEffects(s.buff, L),
                ]
              : []
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
                <p className="skill-desc">{s.description}</p>
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

      <p className="lab-cta">
        <Link to="/lab">Open Lab</Link> for ad-hoc math; skill damage above
        follows wiki base + per-level scaling.
      </p>
    </article>
  )
}
