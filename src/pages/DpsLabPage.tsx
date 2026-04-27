import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { fetchDigimonDetail } from '../api/digimonService'
import { digimonPortraitUrl, rankSpriteStyle, skillIconUrl } from '../lib/digimonImage'
import { digimonStagePortraitGradient } from '../lib/digimonStage'
import {
  AUTO_ANIM_CANCEL_OVERLAP_SEC,
  DEFAULT_ROTATION_SIM_DURATION_SEC,
  simulateRotation,
} from '../lib/dpsSim'
import { getGearAttackContribution } from '../lib/gearStats'
import {
  DIGIMON_ROLE_SKILL_CAST_SEC,
  digimonRoleWikiSkills,
  normalizeWikiRole,
  type HybridStance,
} from '../lib/digimonRoleSkills'
import { SKILL_LEVEL_CAP, skillDamageAtLevel, skillIsSupportOnly } from '../lib/skillDamage'
import { buildSupportSkillEffects } from '../lib/supportEffects'
import type { RotationEvent } from '../lib/dpsSim'
import type { WikiDigimonDetail } from '../types/wikiApi'

/** One line of text, or a titled block with sub-bullets (e.g. animation-cancel priority). */
type LabRotationAdviceItem =
  | string
  | {
      kind: 'anim-cancel-priority'
      title: string
      /** Short note under the title (e.g. how cancel-window numbers are defined). */
      caption?: string
      bullets: string[]
    }

type LabRotationMode = 'auto' | 'custom'

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
    closeTimer.current = setTimeout(() => setOpen(false), 120)
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
    const onScroll = () => setOpen(false)
    const onResize = () => setOpen(false)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
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
          {e.eventType === 'auto' ? (
            <>
              Combined attack, flat (as % of wiki ATK), plus buff crit rate / crit damage as
              expected extra damage on autos (wiki baseline crit is subtracted in the Crit chip):{' '}
            </>
          ) : (
            <>
              Combined attack, skill, and flat (as % of wiki ATK). Damage skills never crit in the
              sim — no crit chip:{' '}
            </>
          )}
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
            onMouseLeave={() => setOpen(false)}
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

type CombatStatsState = {
  hp: number
  ds: number
  attack: number
  defense: number
  crit_rate: number
  atk_speed: number
  evasion: number
  hit_rate: number
  block_rate: number
  dex: number
  int: number
}

const COMBAT_STAT_FIELDS: Array<{ key: keyof CombatStatsState; label: string }> = [
  { key: 'hp', label: 'HP' },
  { key: 'ds', label: 'DS' },
  { key: 'attack', label: 'Attack' },
  { key: 'defense', label: 'Defense' },
  { key: 'crit_rate', label: 'Crit rate' },
  { key: 'atk_speed', label: 'ATK speed' },
  { key: 'dex', label: 'DEX' },
  { key: 'int', label: 'INT' },
  { key: 'evasion', label: 'Evasion' },
  { key: 'hit_rate', label: 'Hit rate' },
  { key: 'block_rate', label: 'Block rate' },
]

function parseToggleFromParams(params: URLSearchParams, key: string): boolean {
  const raw = (params.get(key) ?? '').trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

function parseRotationModeFromParams(params: URLSearchParams): LabRotationMode {
  return params.get('rotationMode')?.trim().toLowerCase() === 'custom' ? 'custom' : 'auto'
}

function parseCustomRotationFromParams(params: URLSearchParams): string[] {
  const raw = params.get('rotationSeq')?.trim() ?? ''
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
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
  const targetsFromUrl = useMemo(() => {
    const raw = new URLSearchParams(search).get('targets')
    if (raw == null || raw.trim() === '') return null
    return Math.max(1, toInt(raw, 1))
  }, [search])

  const [hybridStance, setHybridStance] = useState<HybridStance>(() =>
    parseHybridStance(params.get('hybrid')),
  )

  const [data, setData] = useState<WikiDigimonDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [globalLevel, setGlobalLevel] = useState(initialLevel)
  const [skillLevels, setSkillLevels] = useState<Record<string, number>>({})
  const [targets, setTargets] = useState(() => targetsFromUrl ?? 1)
  const [durationSec, setDurationSec] = useState(() =>
    durationFromUrl ?? DEFAULT_ROTATION_SIM_DURATION_SEC,
  )
  const [rotationMode, setRotationMode] = useState<LabRotationMode>(() =>
    parseRotationModeFromParams(params),
  )
  const [customRotationSkillIds, setCustomRotationSkillIds] = useState<string[]>(() =>
    parseCustomRotationFromParams(params),
  )
  const [customRotationDraftSkillId, setCustomRotationDraftSkillId] = useState('')
  const [useAutoAnimCancel, setUseAutoAnimCancel] = useState(() =>
    parseToggleFromParams(params, 'animCancel'),
  )
  const [forceAutoCrit, setForceAutoCrit] = useState(() => parseToggleFromParams(params, 'forceAutoCrit'))
  const [perfectAtClone, setPerfectAtClone] = useState(() => parseToggleFromParams(params, 'perfectAtClone'))
  const [shareStatus, setShareStatus] = useState<string | null>(null)
  const [portraitBroken, setPortraitBroken] = useState(false)
  const [combatStats, setCombatStats] = useState<CombatStatsState | null>(null)

  useEffect(() => {
    if (durationFromUrl != null) setDurationSec(durationFromUrl)
  }, [durationFromUrl])

  useEffect(() => {
    if (targetsFromUrl != null) setTargets(targetsFromUrl)
  }, [targetsFromUrl])

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
    const next = new URLSearchParams(search)
    setRotationMode(parseRotationModeFromParams(next))
    setCustomRotationSkillIds(parseCustomRotationFromParams(next))
    setUseAutoAnimCancel(parseToggleFromParams(next, 'animCancel'))
    setForceAutoCrit(parseToggleFromParams(next, 'forceAutoCrit'))
    setPerfectAtClone(parseToggleFromParams(next, 'perfectAtClone'))
  }, [search])

  useEffect(() => {
    setPortraitBroken(false)
  }, [digimonId])

  useEffect(() => {
    if (!data?.stats) {
      setCombatStats(null)
      return
    }
    setCombatStats({
      hp: Math.max(0, Math.floor(data.stats.hp ?? 0)),
      ds: Math.max(0, Math.floor(data.stats.ds ?? 0)),
      attack: Math.max(0, Math.floor(data.attack ?? data.stats.attack ?? 0)),
      defense: Math.max(0, Math.floor(data.stats.defense ?? 0)),
      crit_rate: Math.max(0, Math.floor(data.stats.crit_rate ?? 0)),
      atk_speed: Math.max(0, Math.floor(data.stats.atk_speed ?? 0)),
      evasion: Math.max(0, Math.floor(data.stats.evasion ?? 0)),
      hit_rate: Math.max(0, Math.floor(data.stats.hit_rate ?? 0)),
      block_rate: Math.max(0, Math.floor(data.stats.block_rate ?? 0)),
      dex: Math.max(0, Math.floor(data.stats.dex ?? 0)),
      int: Math.max(0, Math.floor(data.stats.int ?? 0)),
    })
  }, [data])

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
  const gearAttack = useMemo(() => getGearAttackContribution(), [])
  const simBaseAttack = useMemo(
    () => (combatStats ? combatStats.attack + gearAttack.totalAttack : 0),
    [combatStats, gearAttack.totalAttack],
  )

  const digimonRoleWikiSkillsForRole = useMemo(
    () =>
      data
        ? digimonRoleWikiSkills(roleNorm, isHybridRole ? hybridStance : 'melee')
        : [],
    [data, roleNorm, isHybridRole, hybridStance],
  )

  const customRotationSkillOptions = useMemo(() => {
    if (!data) return []
    const out: Array<{
      id: string
      label: string
      kind: 'damage' | 'support' | 'role-support' | 'auto'
    }> = [{ id: 'auto-attack', label: 'Auto Attack', kind: 'auto' }]
    const seen = new Set<string>()
    for (const s of data.skills ?? []) {
      if (seen.has(s.id)) continue
      seen.add(s.id)
      out.push({
        id: s.id,
        label: s.name,
        kind: skillIsSupportOnly(s.base_dmg, s.scaling) ? 'support' : 'damage',
      })
    }
    for (const s of digimonRoleWikiSkillsForRole) {
      if (seen.has(s.id)) continue
      seen.add(s.id)
      out.push({ id: s.id, label: `${s.name} (Role)`, kind: 'role-support' })
    }
    return out
  }, [data, digimonRoleWikiSkillsForRole])

  useEffect(() => {
    setCustomRotationSkillIds((prev) =>
      prev.filter((id) => customRotationSkillOptions.some((opt) => opt.id === id)),
    )
  }, [customRotationSkillOptions])

  useEffect(() => {
    if (!customRotationDraftSkillId) return
    const stillValid = customRotationSkillOptions.some((opt) => opt.id === customRotationDraftSkillId)
    if (!stillValid) setCustomRotationDraftSkillId('')
  }, [customRotationDraftSkillId, customRotationSkillOptions])

  const customRotationResolved = useMemo(
    () =>
      customRotationSkillIds.map((id) => ({
        skillId: id,
        option: customRotationSkillOptions.find((opt) => opt.id === id),
      })),
    [customRotationSkillIds, customRotationSkillOptions],
  )
  const customRotationValidRows = useMemo(
    () =>
      customRotationResolved
        .filter((row) => !!row.option)
        .map((row) => ({ skillId: row.skillId })),
    [customRotationResolved],
  )
  const customRotationInvalidCount = customRotationResolved.filter((row) => !row.option).length

  const sim = useMemo(() => {
    if (!data) return null
    const secs = Math.max(10, durationSec)
    return simulateRotation(
      data.skills ?? [],
      skillLevels,
      secs,
      Math.max(1, targets),
      simBaseAttack,
      combatStats?.atk_speed ?? data.stats?.atk_speed ?? 0,
      combatStats?.crit_rate ?? data.stats?.crit_rate ?? 0,
      {
        role: data.role,
        hybridStance: isHybridRole ? hybridStance : 'best',
        autoAttackAnimationCancel: useAutoAnimCancel,
        forceAutoCrit,
        perfectAtClone,
        customRotation: rotationMode === 'custom' ? customRotationValidRows : undefined,
        manualSupportOnly: rotationMode === 'custom',
      },
    )
  }, [
    data,
    durationSec,
    skillLevels,
    targets,
    isHybridRole,
    hybridStance,
    simBaseAttack,
    combatStats,
    useAutoAnimCancel,
    forceAutoCrit,
    perfectAtClone,
    rotationMode,
    customRotationValidRows,
  ])

  const breakdown = useMemo(() => {
    if (!sim) return []
    const bySkill = new Map<
      string,
      { skillId: string; name: string; casts: number; damage: number }
    >()
    for (const e of sim.events) {
      if (e.eventType === 'support') continue
      const prev = bySkill.get(e.skillId)
      if (prev) {
        prev.casts += 1
        prev.damage += e.damage
      } else {
        bySkill.set(e.skillId, {
          skillId: e.skillId,
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

  const rotationAdvice = useMemo((): LabRotationAdviceItem[] => {
    if (!data || !sim || breakdown.length === 0) return []
    const lines: LabRotationAdviceItem[] = []

    const levelOf = (skillId: string) => skillLevels[skillId] ?? 1
    const top = breakdown[0]
    if (top.skillId === 'auto-attack') {
      lines.push(
        `Auto attacks account for ${top.pct.toFixed(1)}% of damage in this window.`,
        `Keep attack-speed and ATK buffs active so autos stay competitive with filler skills.`,
      )
    } else {
      lines.push(
        `Prioritize ${top.name}; it contributes ${top.pct.toFixed(1)}% of total damage.`,
      )
    }

    const transitions = new Map<string, { from: string; to: string; count: number }>()
    for (let i = 0; i < sim.events.length - 1; i += 1) {
      const a = sim.events[i]
      const b = sim.events[i + 1]
      if (a.skillId === b.skillId) continue
      const key = `${a.skillId}->${b.skillId}`
      const prev = transitions.get(key)
      if (prev) prev.count += 1
      else transitions.set(key, { from: a.skillName, to: b.skillName, count: 1 })
    }
    const bestTransition = [...transitions.values()].sort((a, b) => b.count - a.count)[0]
    if (bestTransition && bestTransition.count >= 2) {
      lines.push(
        `Common follow-up: ${bestTransition.from} → ${bestTransition.to} (${bestTransition.count} times in this timeline).`,
      )
    }

    const supportSkills = (data.skills ?? []).filter((s) =>
      skillIsSupportOnly(s.base_dmg, s.scaling),
    )

    const supportHasAttackSpeed = (s: (typeof supportSkills)[number]) =>
      buildSupportSkillEffects(s, levelOf(s.id)).some(
        (e) => e.unit === '%' && /\battack\s*speed\b/i.test(e.label),
      )

    const supportHasDamageScalingBuff = (s: (typeof supportSkills)[number]) =>
      buildSupportSkillEffects(s, levelOf(s.id)).some((e) => {
        if (e.unit !== '%') return false
        if (/\battack\s*speed\b/i.test(e.label)) return false
        if (/(\bskill damage\b|\bskill dmg\b)/i.test(e.label)) return true
        if (/\battack\b/i.test(e.label) && /(increase|raise|boost)/i.test(e.label)) return true
        return false
      })

    const atkSpdSupports = supportSkills.filter(supportHasAttackSpeed)
    const dmgScalingSupports = supportSkills.filter(supportHasDamageScalingBuff)

    const heavyHitters = breakdown
      .filter((b) => b.skillId !== 'auto-attack')
      .slice(0, 3)
      .map((b) => b.name)

    if (atkSpdSupports.length > 0) {
      const names = atkSpdSupports.map((s) => s.name).join(', ')
      lines.push(
        `When attack speed from ${names} is up, prioritize weaving auto attacks.`,
        `The sim compares auto damage rate to each ready skill and can skip weak filler casts during those windows.`,
      )
    }

    if (dmgScalingSupports.length > 0) {
      const buffNames = dmgScalingSupports.map((s) => s.name).join(', ')
      const targets =
        heavyHitters.length > 0 ? heavyHitters.join(', ') : 'your hardest-hitting damage skills'
      lines.push(
        `When ${buffNames} buffs attack or skill damage, prioritize ${targets}.`,
        `Line them up inside the buff window when possible.`,
      )
    }

    if (atkSpdSupports.length === 0 && dmgScalingSupports.length === 0 && supportSkills.length > 0) {
      const names = supportSkills.map((s) => s.name).join(', ')
      lines.push(`Use support skills (${names}) for utility windows; they are excluded from DPS casts.`)
    }

    if (useAutoAnimCancel) {
      /** One auto: lab ATK with a simple wiki crit rough (same idea as sim fallback); not timeline mean. */
      const autoOneHit =
        (simBaseAttack || 0) * (1 + (combatStats?.crit_rate ?? 0) / 100000 * 0.5)
      const overlap = AUTO_ANIM_CANCEL_OVERLAP_SEC
      const cancelCandidates = (data.skills ?? [])
        .filter((s) => !skillIsSupportOnly(s.base_dmg, s.scaling))
        .map((s) => {
          const level = levelOf(s.id)
          const rawBase = skillDamageAtLevel(s.base_dmg, s.scaling, level, s.max_level)
          const targetHits = s.radius && s.radius > 0 ? Math.max(1, targets) : 1
          const skillOneHit = perfectAtClone
            ? (rawBase * 1.43 + Math.max(0, simBaseAttack)) * targetHits
            : rawBase * targetHits
          const cast = Math.max(0.1, s.cast_time_sec || 0)
          const cd = Math.max(0, s.cooldown_sec || 0)
          const period = cast + cd
          const cancelWeaveRate = (autoOneHit + skillOneHit) / (overlap + cast)
          return { name: s.name, cast, period, cancelWeaveRate }
        })
        .sort((a, b) => {
          if (Math.abs(b.cancelWeaveRate - a.cancelWeaveRate) > 1e-6)
            return b.cancelWeaveRate - a.cancelWeaveRate
          if (Math.abs(a.cast - b.cast) > 1e-6) return a.cast - b.cast
          return a.period - b.period
        })
      if (cancelCandidates.length > 0) {
        lines.push({
          kind: 'anim-cancel-priority',
          title: 'Animation cancel — one-weave rate',
          caption: `Each line is (one expected auto hit + one skill hit from wiki and lab ATK, no stacked buffs) ÷ (${overlap}s cancel overlap + cast). Not sustained sim DPS.`,
          bullets: cancelCandidates.slice(0, 4).map(
            (c) =>
              `${c.name} — ${c.cast.toFixed(1)}s cast · ${c.period.toFixed(1)}s cast+CD · ~${c.cancelWeaveRate.toFixed(0)} / s`,
          ),
        })
      }
    }

    if (digimonRoleWikiSkillsForRole.length > 0) {
      const tn = digimonRoleWikiSkillsForRole.map((s) => s.name).join(', ')
      lines.push(
        `Digimon role skills (${tn}) are cast when ready like other supports.`,
        `Hover buff % on timeline rows for per-hit breakdowns.`,
      )
    }

    return lines
  }, [
    breakdown,
    data,
    sim,
    skillLevels,
    digimonRoleWikiSkillsForRole,
    useAutoAnimCancel,
    simBaseAttack,
    combatStats?.crit_rate,
    perfectAtClone,
    targets,
  ])

  const combatStatRows = useMemo(
    () =>
      combatStats
        ? COMBAT_STAT_FIELDS.map((field) => ({
            key: field.key,
            label: field.label,
            value: combatStats[field.key],
          }))
        : [],
    [combatStats],
  )

  const updateCombatStat = (key: keyof CombatStatsState, raw: string) => {
    const n = Number(raw)
    const next = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
    setCombatStats((prev) => (prev ? { ...prev, [key]: next } : prev))
  }
  const portraitSrc = useMemo(
    () => (data ? digimonPortraitUrl(data.model_id, data.id, data.name) : undefined),
    [data],
  )
  const showLabPortrait = Boolean(portraitSrc && !portraitBroken)

  const buildShareUrl = useCallback(() => {
    const next = new URLSearchParams()
    if (digimonId) next.set('digimonId', digimonId)
    next.set('level', String(globalLevel))
    next.set('duration', String(Math.max(10, durationSec)))
    next.set('targets', String(Math.max(1, targets)))
    next.set('hybrid', hybridStance)
    next.set('rotationMode', rotationMode)
    if (rotationMode === 'custom' && customRotationSkillIds.length > 0) {
      next.set('rotationSeq', customRotationSkillIds.join(','))
    }
    if (useAutoAnimCancel) next.set('animCancel', '1')
    if (forceAutoCrit) next.set('forceAutoCrit', '1')
    if (perfectAtClone) next.set('perfectAtClone', '1')
    const base = window.location.href.split('#')[0]
    return `${base}#/lab?${next.toString()}`
  }, [
    digimonId,
    globalLevel,
    durationSec,
    targets,
    hybridStance,
    rotationMode,
    customRotationSkillIds,
    useAutoAnimCancel,
    forceAutoCrit,
    perfectAtClone,
  ])

  const onShareLabUrl = useCallback(async () => {
    try {
      const url = buildShareUrl()
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url)
      else window.prompt('Copy share URL:', url)
      setShareStatus('Share URL copied.')
    } catch {
      setShareStatus('Failed to copy share URL.')
    }
    window.setTimeout(() => setShareStatus(null), 2200)
  }, [buildShareUrl])

  return (
    <div className="lab lab-page">
      <div className="lab-page-head">
        <h1 className="lab-page-title">Lab</h1>
        <div className="lab-page-head-actions">
          <button type="button" className="lab-share-btn" onClick={onShareLabUrl}>
            Share Lab Sim
          </button>
          {data && (
            <Link className="lab-to-detail-btn" to={`/digimon/${encodeURIComponent(data.id)}`}>
              Go back to {`${data.name}'s page`} →
            </Link>
          )}
        </div>
      </div>
      {shareStatus ? <p className="muted lab-share-status">{shareStatus}</p> : null}
      <p className="muted">
        This lab simulates a timed rotation using your Digimon&apos;s wiki skills plus
        wiki role skills (not tamer skills), with in-game cast times and cooldowns.
        Support skills are cast when ready if their buff is not already active.
        Damage skills use current buffs. Between casts, the sim fills with auto
        attacks. If attack-speed buffs make autos stronger per second than a ready
        damage skill, it weaves an auto instead. Damage skills never crit. Only
        auto attacks use wiki crit rate, base +50% crit damage, and buff crit stats.
      </p>
      <p className="muted">
        When a damage skill is available, the sim previews a short window and compares three
        options: cast the best DPCT skill now, cast another damage skill as filler, or wait and use
        only autos/supports to align with buffs. It picks the option with the highest preview damage,
        then still applies the auto-vs-skill check above. The preview is capped (about 12 seconds or
        35% of time left), so this favors strong short-term decisioning, not a perfect full-fight
        solver.
      </p>
      <p className="muted">
        Rotation mode can be switched to Custom Rotation to run a user-defined fixed sequence. In
        custom mode, support skills are manual-only (they cast only when included in the sequence).
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
          <section className="lab-module lab-module--top" aria-label="Digimon overview and sim controls">
            <div className="lab-top-grid">
              <div className="lab-top-identity">
                <div className="lab-identity-row">
                  <div
                    className="lab-identity-art"
                    style={{ background: digimonStagePortraitGradient(data.stage) }}
                  >
                    {showLabPortrait && portraitSrc ? (
                      <img src={portraitSrc} alt="" onError={() => setPortraitBroken(true)} />
                    ) : (
                      <span className="thumb-initial">{data.name.slice(0, 1)}</span>
                    )}
                    {data.rank > 0 && (
                      <span className="lab-identity-rank" aria-hidden="true">
                        <span style={rankSpriteStyle(data.rank, 0.85)} />
                      </span>
                    )}
                  </div>
                  <div className="lab-identity-body">
                    <h2 className="lab-identity-name">
                      {data.name}{' '}
                      <span className="muted lab-identity-stage">({data.stage})</span>
                    </h2>
                    <div className="lab-identity-pills">
                      <span className="detail-info-pill detail-info-pill-class">+ {data.role || '—'}</span>
                      <span className="detail-info-pill detail-info-pill-type">{data.attribute || '—'}</span>
                      <span className="detail-info-pill detail-info-pill-attrib">{data.element || '—'}</span>
                    </div>
                    <p className="muted lab-identity-sub">
                      {(data.skills ?? []).length} skills · Wiki attack {data.attack.toLocaleString()}
                      {gearAttack.totalAttack > 0
                        ? ` · Lab base ATK ${simBaseAttack.toLocaleString(undefined, { maximumFractionDigits: 1 })}`
                        : ''}
                    </p>
                  </div>
                </div>
              </div>
              <div className="lab-top-combat">
                <h3 className="lab-module-heading" id="lab-combat-stats-heading">
                  Combat stats
                </h3>
                <div
                  className="lab-stats-grid"
                  role="group"
                  aria-labelledby="lab-combat-stats-heading"
                >
                  {combatStatRows.map((row) => (
                    <div key={row.key} className="stat-cell">
                      <span className="stat-label">{row.label}</span>
                      <input
                        className="lab-stat-input"
                        type="number"
                        min={0}
                        value={row.value}
                        onChange={(e) => updateCombatStat(row.key, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="lab-controls-bar">
              <p className="lab-controls-bar-title">Simulation</p>
              <div className="lab-controls-fields">
                <label>
                  Overall skill level
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
              <div className="lab-custom-rotation-mode">
                <p className="lab-controls-bar-title">Rotation mode</p>
                <div className="lab-custom-rotation-mode-options" role="tablist" aria-label="Rotation mode">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={rotationMode === 'auto'}
                    className={
                      rotationMode === 'auto'
                        ? 'lab-rotation-mode-btn lab-rotation-mode-btn--active'
                        : 'lab-rotation-mode-btn'
                    }
                    onClick={() => setRotationMode('auto')}
                  >
                    Auto
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={rotationMode === 'custom'}
                    className={
                      rotationMode === 'custom'
                        ? 'lab-rotation-mode-btn lab-rotation-mode-btn--active'
                        : 'lab-rotation-mode-btn'
                    }
                    onClick={() => setRotationMode('custom')}
                  >
                    Custom Rotation
                  </button>
                </div>
              </div>
              {rotationMode === 'custom' && (
                <div className="lab-custom-rotation-card">
                  <div className="lab-custom-rotation-add">
                    <select
                      value={customRotationDraftSkillId}
                      onChange={(e) => setCustomRotationDraftSkillId(e.target.value)}
                    >
                      <option value="">Select skill…</option>
                      {customRotationSkillOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label} · {opt.kind}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="lab-btn"
                      onClick={() => {
                        if (!customRotationDraftSkillId) return
                        setCustomRotationSkillIds((prev) => [...prev, customRotationDraftSkillId])
                      }}
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      className="lab-btn lab-btn--ghost"
                      onClick={() => setCustomRotationSkillIds([])}
                      disabled={customRotationSkillIds.length === 0}
                    >
                      Clear
                    </button>
                  </div>
                  {customRotationSkillIds.length === 0 ? (
                    <p className="lab-custom-rotation-warning">
                      Add at least one skill to run custom mode.
                    </p>
                  ) : null}
                  {customRotationInvalidCount > 0 ? (
                    <p className="lab-custom-rotation-warning">
                      {customRotationInvalidCount} sequence entr
                      {customRotationInvalidCount === 1 ? 'y is' : 'ies are'} no longer valid for this
                      Digimon/stance and will be ignored.
                    </p>
                  ) : null}
                  <ol className="lab-custom-rotation-list">
                    {customRotationResolved.map((row, idx) => (
                      <li key={`${row.skillId}-${idx}`} className="lab-custom-rotation-row">
                        <select
                          value={row.skillId}
                          onChange={(e) =>
                            setCustomRotationSkillIds((prev) =>
                              prev.map((id, i) => (i === idx ? e.target.value : id)),
                            )
                          }
                        >
                          {customRotationSkillOptions.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label} · {opt.kind}
                            </option>
                          ))}
                        </select>
                        <div className="lab-custom-rotation-row-actions">
                          <button
                            type="button"
                            className="lab-btn lab-btn--ghost"
                            onClick={() =>
                              setCustomRotationSkillIds((prev) => {
                                if (idx <= 0) return prev
                                const next = [...prev]
                                ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
                                return next
                              })
                            }
                            disabled={idx === 0}
                          >
                            Up
                          </button>
                          <button
                            type="button"
                            className="lab-btn lab-btn--ghost"
                            onClick={() =>
                              setCustomRotationSkillIds((prev) => {
                                if (idx >= prev.length - 1) return prev
                                const next = [...prev]
                                ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
                                return next
                              })
                            }
                            disabled={idx >= customRotationSkillIds.length - 1}
                          >
                            Down
                          </button>
                          <button
                            type="button"
                            className="lab-btn lab-btn--danger"
                            onClick={() =>
                              setCustomRotationSkillIds((prev) => prev.filter((_, i) => i !== idx))
                            }
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <div className="lab-special-modifiers">
                <p className="lab-controls-bar-title">Special modifiers</p>
                <div className="lab-special-modifier-list">
                  <label className="lab-special-modifier-toggle">
                    <input
                      type="checkbox"
                      checked={forceAutoCrit}
                      onChange={(e) => setForceAutoCrit(e.target.checked)}
                    />
                    <span>Guaranteed Crit on Auto Attacks (Temporary until more clone research is completed)</span>
                  </label>
                  <label className="lab-special-modifier-toggle">
                    <input
                      type="checkbox"
                      checked={perfectAtClone}
                      onChange={(e) => setPerfectAtClone(e.target.checked)}
                    />
                    <span>Perfect AT clone</span>
                  </label>
                  <label className="lab-special-modifier-toggle">
                    <input
                      type="checkbox"
                      checked={useAutoAnimCancel}
                      onChange={(e) => setUseAutoAnimCancel(e.target.checked)}
                    />
                    <span>
                      Auto attack animation cancelling (Special thanks to Yvelchrome for bringing this to my attention and testing it!)
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </section>

          <div
            className={
              digimonRoleWikiSkillsForRole.length > 0
                ? 'lab-dual-modules lab-dual-modules--pair'
                : 'lab-dual-modules'
            }
          >
          {data && digimonRoleWikiSkillsForRole.length > 0 && (
            <section className="lab-result">
              <h3>Digimon role skills ({data.role})</h3>
              <p className="muted">
                Role skills only (no tamer skills). {DIGIMON_ROLE_SKILL_CAST_SEC}s casts. Hybrid: one
                stance at a time. Hit / INT (and skills that only buff those) aren&apos;t in the rotation sim
                yet—those rows are informational.
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
            <h3>Set skill levels manually</h3>
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
          </div>

          {sim && (
            <div
              className={
                breakdown.length > 0 ? 'lab-dual-modules lab-dual-modules--pair' : 'lab-dual-modules'
              }
            >
              <section className="lab-result lab-result--sim-summary">
                <h3>
                  {rotationMode === 'custom' ? 'Custom rotation simulation' : 'Optimal rotation simulation'} (
                  {sim.durationSec}s)
                </h3>
                <div className="lab-table-wrap lab-kv-table-wrap lab-kv-summary-stack">
                  <table className="lab-kv-table">
                    <tbody>
                      <tr>
                        <th scope="row">Total damage</th>
                        <td className="lab-kv-value-emphasis">
                          {sim.totalDamage.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                      </tr>
                      <tr>
                        <th scope="row">Sustained DPS</th>
                        <td className="lab-kv-value-emphasis">
                          {sim.dps.toLocaleString(undefined, { maximumFractionDigits: 1 })} /s
                        </td>
                      </tr>
                      <tr>
                        <th scope="row">Total casts</th>
                        <td>{sim.casts.toLocaleString()}</td>
                      </tr>
                    </tbody>
                  </table>
                  <details className="lab-kv-details">
                    <summary className="lab-kv-details-summary">Buffs counted toward damage</summary>
                    <div className="lab-kv-details-panel">
                      <table className="lab-kv-table lab-kv-table--nested">
                        <tbody>
                          <tr>
                            <th scope="row">Combined</th>
                            <td>
                              +
                              {sim.totalDpsBuffPct.toLocaleString(undefined, { maximumFractionDigits: 1 })}%
                            </td>
                          </tr>
                          <tr>
                            <th scope="row">ATK%</th>
                            <td>
                              {sim.attackBuffPct.toLocaleString(undefined, { maximumFractionDigits: 1 })}%
                            </td>
                          </tr>
                          <tr>
                            <th scope="row">Skill DMG%</th>
                            <td>
                              {sim.skillDamageBuffPct.toLocaleString(undefined, { maximumFractionDigits: 1 })}%
                            </td>
                          </tr>
                          <tr>
                            <th scope="row">Flat ATK</th>
                            <td>
                              {sim.attackPowerFlat.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                            </td>
                          </tr>
                          <tr>
                            <th scope="row">Crit rate</th>
                            <td>
                              {sim.critRatePct.toLocaleString(undefined, { maximumFractionDigits: 2 })}%
                            </td>
                          </tr>
                          <tr>
                            <th scope="row">Crit DMG%</th>
                            <td>
                              {sim.critDamagePct.toLocaleString(undefined, { maximumFractionDigits: 1 })}%
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </details>
                  <details className="lab-kv-details">
                    <summary className="lab-kv-details-summary">Auto attacks</summary>
                    <div className="lab-kv-details-panel">
                      <table className="lab-kv-table lab-kv-table--nested">
                        <tbody>
                          <tr>
                            <th scope="row">Hits</th>
                            <td>{sim.autoAttackHits.toLocaleString()}</td>
                          </tr>
                          <tr>
                            <th scope="row">Damage</th>
                            <td>
                              {sim.autoDamageTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              {sim.totalDamage > 0 ? (
                                <span className="lab-kv-suffix">
                                  {' '}
                                  ({((sim.autoDamageTotal / sim.totalDamage) * 100).toFixed(1)}% of total)
                                </span>
                              ) : null}
                            </td>
                          </tr>
                          {sim.autoAttackHits > 0 ? (
                            <tr>
                              <th scope="row">Avg / hit</th>
                              <td>
                                {sim.autoDamageAvg.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                              </td>
                            </tr>
                          ) : null}
                          <tr>
                            <th scope="row">Auto DPS</th>
                            <td>{sim.autoDps.toLocaleString(undefined, { maximumFractionDigits: 1 })} /s</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </details>
                  <details className="lab-kv-details">
                    <summary className="lab-kv-details-summary">Damage formulas used</summary>
                    <div className="lab-kv-details-panel">
                      <div className="lab-formula-block">
                        <p className="lab-formula-title">Skill hit (skills do not crit)</p>
                        <code>
                          skill_hit = skill_base(skill_level, targets) * (1 + (ATK% + Skill% + FlatATK/baseATK) / 100)
                        </code>
                      </div>
                      <div className="lab-formula-block">
                        <p className="lab-formula-title">Auto hit (can crit)</p>
                        <code>
                          auto_hit = (baseATK + flatATK) * (1 + ATK% / 100) * crit_mult
                        </code>
                        <code>
                          crit_mult = 1 + p * (1.0 + buffCritDmg% / 100), p = clamp(baseCrit + buffCrit%, 0..1)
                        </code>
                      </div>
                    </div>
                  </details>
                </div>
                <p className="muted lab-sim-summary-note">
                  Sustained DPS is total damage ÷ window (skills + autos). Auto DPS is only the damage from auto
                  hits in that same window.
                </p>
                {gearAttack.totalAttack > 0 && (
                  <p className="muted lab-sim-summary-note">
                    Gear ATK applied: +{gearAttack.totalAttack.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                    {gearAttack.ringAttack > 0
                      ? ` (ring +${gearAttack.ringAttack.toLocaleString()}`
                      : ' ('}
                    {gearAttack.leftWeightedAttack > 0
                      ? `${gearAttack.ringAttack > 0 ? ', ' : ''}left +${gearAttack.leftWeightedAttack.toLocaleString(undefined, { maximumFractionDigits: 1 })} @ 60%`
                      : ''}
                    ).
                  </p>
                )}
              </section>
              {breakdown.length > 0 && (
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
            </div>
          )}

          {rotationAdvice.length > 0 && (
            <section className="lab-result">
              <h3>Rotation Notes</h3>
              <ul className="lab-advice-list">
                {rotationAdvice.map((entry, i) =>
                  typeof entry === 'string' ? (
                    <li key={i} className="lab-advice-item">
                      {entry}
                    </li>
                  ) : (
                    <li key={i} className="lab-advice-item lab-advice-item--with-sublist">
                      <div className="lab-advice-sublist-head" id={`rotation-advice-nested-${i}`}>
                        {entry.title}
                      </div>
                      {entry.caption ? (
                        <p className="lab-advice-anim-cancel-caption">{entry.caption}</p>
                      ) : null}
                      <ul
                        className="lab-advice-sublist"
                        aria-labelledby={`rotation-advice-nested-${i}`}
                      >
                        {entry.bullets.map((b, j) => (
                          <li key={j}>{b}</li>
                        ))}
                      </ul>
                    </li>
                  ),
                )}
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
                            : e.cancelledFromAuto
                              ? 'lab-row-cancel-sub'
                            : e.buffedBy.length > 0
                              ? 'lab-row-buffed'
                              : undefined
                        }
                      >
                        <td>{e.atSec.toFixed(1)}</td>
                        <td>
                          <span className={e.cancelledFromAuto ? 'timeline-skill-subline' : undefined}>
                            {e.cancelledFromAuto ? <span className="timeline-skill-subline-arrow">↳</span> : null}
                            {skillIconUrl(e.iconId) && (
                              <img
                                className="timeline-row-icon"
                                src={skillIconUrl(e.iconId)}
                                alt=""
                              />
                            )}
                            {e.skillName}
                          </span>
                          {e.eventType === 'support' && (
                            <span className="lab-event-tag lab-event-tag-support">Buff</span>
                          )}
                          {e.eventType === 'auto' && e.cancelledBySkillName && (
                            <span className="lab-inline-tooltip-wrap">
                              <span
                                className="lab-event-tag lab-event-tag-cancel"
                                aria-describedby={`ac-tip-${idx}`}
                              >
                                AC
                              </span>
                              <span id={`ac-tip-${idx}`} role="tooltip" className="lab-inline-tooltip">
                                Auto attack animation-cancelled into {e.cancelledBySkillName}
                              </span>
                            </span>
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
