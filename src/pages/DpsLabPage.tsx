import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { fetchDigimonDetail } from '../api/digimonService'
import {
  attributeAdvantageSkillDamageMultiplier,
  attributeAdvantageSkillDamageMultiplierWithFoldedTrueVice,
} from '../lib/attributeAdvantage'
import { trueViceElementBonusActive } from '../lib/elementAdvantage'
import { digimonPortraitUrl, rankSpriteStyle, skillIconUrl } from '../lib/digimonImage'
import { digimonStagePortraitGradient } from '../lib/digimonStage'
import {
  ANIM_CANCEL_REACTION_MS_DEFAULT,
  ANIM_CANCEL_REACTION_MS_MAX,
  ANIM_CANCEL_REACTION_MS_MIN,
  clampAnimCancelReactionMs,
  clampCustomRotationFullCycles,
  DEFAULT_CUSTOM_ROTATION_FULL_CYCLES,
  DEFAULT_ROTATION_SIM_DURATION_SEC,
  MAX_CUSTOM_ROTATION_FULL_CYCLES,
  MAX_ROTATION_SIM_DURATION_SEC,
  MIN_ROTATION_SIM_DURATION_SEC,
  clampRotationDurationSec,
  simulateRotation,
  type RotationResult,
} from '../lib/dpsSim'
import { EditableNumberInput } from '../components/EditableNumberInput'
import {
  GEAR_STORAGE_KEY,
  getGearAttackContribution,
  getGearStatBonuses,
  readGearState,
  trueViceDamageFractionsForSkillHit,
} from '../lib/gearStats'
import { digimonRoleWikiSkills, normalizeWikiRole, type HybridStance } from '../lib/digimonRoleSkills'
import { SKILL_LEVEL_CAP, wikiSkillHitCoefficient, skillIsSupportOnly } from '../lib/skillDamage'
import { buildSupportSkillEffects } from '../lib/supportEffects'
import type { RotationEvent } from '../lib/dpsSim'
import { EnemyAttributeTargetField } from '../components/EnemyAttributeTargetField'
import { EnemyElementTargetField } from '../components/EnemyElementTargetField'
import {
  DPS_TARGET_ENEMY_ATTRIBUTE_OPTIONS,
  sanitizeDpsTargetEnemyElement,
} from '../lib/wikiListFacetOptions'
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

/** Slow-hint delay while a rotation sim is in flight (aligned with tier list updates). */
const DPS_LAB_SLOW_HINT_MS = 5_000

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
              sim; no crit chip:{' '}
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

/** Default on: instant buffs + cancel meta; set animCancel=0 in URL to disable. */
function parseAnimCancelFromParams(params: URLSearchParams): boolean {
  if (!params.has('animCancel')) return true
  const raw = (params.get('animCancel') ?? '').trim().toLowerCase()
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

function parseReactMsFromParams(params: URLSearchParams): number {
  const raw = params.get('reactMs')
  if (raw == null || raw.trim() === '') return ANIM_CANCEL_REACTION_MS_DEFAULT
  const n = Number(raw)
  if (!Number.isFinite(n)) return ANIM_CANCEL_REACTION_MS_DEFAULT
  return clampAnimCancelReactionMs(Math.round(n))
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

function parseFillerSeqFromParams(params: URLSearchParams): string[] {
  const raw = params.get('fillerSeq')?.trim() ?? ''
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function parseRotCyclesFromParams(params: URLSearchParams): number {
  const raw = params.get('rotCycles')?.trim()
  if (raw == null || raw === '') return DEFAULT_CUSTOM_ROTATION_FULL_CYCLES
  const n = Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_CUSTOM_ROTATION_FULL_CYCLES
  if (n === 0) return 0
  return clampCustomRotationFullCycles(Math.floor(n))
}

function initialRotCyclesFromParams(params: URLSearchParams): number {
  const v = parseRotCyclesFromParams(params)
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_CUSTOM_ROTATION_FULL_CYCLES
}

function parseEnemyAttrFromSearch(search: string): string {
  const raw = new URLSearchParams(search).get('enemyAttr')?.trim() ?? ''
  if (!raw) return ''
  if ((DPS_TARGET_ENEMY_ATTRIBUTE_OPTIONS as readonly string[]).includes(raw)) return raw
  return ''
}

function parseEnemyElementFromSearch(search: string): string {
  return sanitizeDpsTargetEnemyElement(new URLSearchParams(search).get('enemyElement')?.trim() ?? '')
}

const LAB_ROTATION_DND_MIME = 'application/x-odyssey-lab-rotation-index'
const LAB_ROTATION_FILLER_DND_MIME = 'application/x-odyssey-lab-rotation-filler-index'

export function DpsLabPage() {
  const location = useLocation()
  const { search } = location
  const params = useMemo(() => new URLSearchParams(search), [search])
  const digimonId = params.get('digimonId')?.trim() ?? ''
  const initialLevel = Math.max(1, Math.min(SKILL_LEVEL_CAP, toInt(params.get('level'), 25)))
  const durationFromUrl = useMemo(() => {
    const raw = new URLSearchParams(search).get('duration')
    if (raw == null || raw.trim() === '') return null
    return clampRotationDurationSec(toInt(raw, DEFAULT_ROTATION_SIM_DURATION_SEC))
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
  const [customRotationFullCycles, setCustomRotationFullCycles] = useState(() =>
    initialRotCyclesFromParams(params),
  )
  const [customRotationFillerSkillIds, setCustomRotationFillerSkillIds] = useState<string[]>(() =>
    parseFillerSeqFromParams(params),
  )
  const [useAutoAnimCancel, setUseAutoAnimCancel] = useState(() => parseAnimCancelFromParams(params))
  const [animCancelReactionMs, setAnimCancelReactionMs] = useState(() =>
    parseReactMsFromParams(params),
  )
  const [forceAutoCrit, setForceAutoCrit] = useState(() => parseToggleFromParams(params, 'forceAutoCrit'))
  const [perfectAtClone, setPerfectAtClone] = useState(() => parseToggleFromParams(params, 'perfectAtClone'))
  const [targetEnemyAttribute, setTargetEnemyAttribute] = useState(() =>
    parseEnemyAttrFromSearch(search),
  )
  const [targetEnemyElement, setTargetEnemyElement] = useState(() =>
    parseEnemyElementFromSearch(search),
  )
  const [sim, setSim] = useState<RotationResult | null>(null)
  const [simBusy, setSimBusy] = useState(false)
  const [simSlowHint, setSimSlowHint] = useState(false)
  const [shareStatus, setShareStatus] = useState<string | null>(null)
  const [portraitBroken, setPortraitBroken] = useState(false)
  const [combatStats, setCombatStats] = useState<CombatStatsState | null>(null)
  /** Reread gear from localStorage when navigating here or when another tab updates saves. */
  const [gearStorageRevision, setGearStorageRevision] = useState(0)
  useEffect(() => {
    setGearStorageRevision((r) => r + 1)
  }, [location.pathname, location.search, location.key])
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === GEAR_STORAGE_KEY || e.key === null) setGearStorageRevision((x) => x + 1)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  const gearAttack = useMemo(() => getGearAttackContribution(), [gearStorageRevision])
  const sealBonuses = useMemo(() => getGearStatBonuses(), [gearStorageRevision])

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
    setCustomRotationFillerSkillIds(parseFillerSeqFromParams(next))
    setCustomRotationFullCycles(initialRotCyclesFromParams(next))
    setUseAutoAnimCancel(parseAnimCancelFromParams(next))
    setAnimCancelReactionMs(parseReactMsFromParams(next))
    setForceAutoCrit(parseToggleFromParams(next, 'forceAutoCrit'))
    setPerfectAtClone(parseToggleFromParams(next, 'perfectAtClone'))
    const rawEnemy = next.get('enemyAttr')?.trim() ?? ''
    setTargetEnemyAttribute(
      rawEnemy && (DPS_TARGET_ENEMY_ATTRIBUTE_OPTIONS as readonly string[]).includes(rawEnemy)
        ? rawEnemy
        : '',
    )
    setTargetEnemyElement(sanitizeDpsTargetEnemyElement(next.get('enemyElement')?.trim() ?? ''))
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
      hp: Math.max(0, Math.floor(data.stats.hp ?? 0)) + sealBonuses.hp,
      ds: Math.max(0, Math.floor(data.stats.ds ?? 0)) + sealBonuses.ds,
      attack: Math.max(0, Math.floor(data.attack ?? data.stats.attack ?? 0)),
      defense: Math.max(0, Math.floor(data.stats.defense ?? 0)) + sealBonuses.defense,
      crit_rate: Math.max(0, Math.floor(data.stats.crit_rate ?? 0)) + sealBonuses.critRate,
      atk_speed: Math.max(0, Math.floor(data.stats.atk_speed ?? 0)) + sealBonuses.atkSpeed,
      evasion: Math.max(0, Math.floor(data.stats.evasion ?? 0)) + sealBonuses.evasion,
      hit_rate: Math.max(0, Math.floor(data.stats.hit_rate ?? 0)) + sealBonuses.hitRate,
      block_rate: Math.max(0, Math.floor(data.stats.block_rate ?? 0)) + sealBonuses.blockRate,
      dex: Math.max(0, Math.floor(data.stats.dex ?? 0)),
      int: Math.max(0, Math.floor(data.stats.int ?? 0)),
    })
  }, [data, sealBonuses])

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
  const simAttackPreview = useMemo(() => {
    /** Wiki / base attack only (editable field; excludes seals). */
    const baseWikiAttack = Math.max(0, combatStats?.attack ?? 0)
    const sealAttackBonus = Math.max(0, sealBonuses.attack)
    const attackWithSeals = baseWikiAttack + sealAttackBonus
    const gearAttackBonus = Math.max(0, gearAttack.totalAttack)
    const cloneAttackBonus = perfectAtClone ? Math.round(baseWikiAttack * 1.44) : 0
    const totalAttackForSim =
      baseWikiAttack + sealAttackBonus + gearAttackBonus + cloneAttackBonus
    const hasEffectiveOverride =
      sealAttackBonus > 0 || gearAttackBonus > 0 || cloneAttackBonus > 0
    const simAttack = hasEffectiveOverride ? totalAttackForSim : baseWikiAttack
    return {
      baseWikiAttack,
      attackWithSeals,
      sealAttackBonus,
      gearAttackBonus,
      cloneAttackBonus,
      effectiveAttack: totalAttackForSim,
      hasEffectiveOverride,
      simAttack,
    }
  }, [combatStats?.attack, sealBonuses.attack, gearAttack.totalAttack, perfectAtClone])
  const simBaseAttack = simAttackPreview.simAttack

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
      iconId: string
    }> = [{ id: 'auto-attack', label: 'Auto Attack', kind: 'auto', iconId: '' }]
    const seen = new Set<string>()
    for (const s of data.skills ?? []) {
      if (seen.has(s.id)) continue
      seen.add(s.id)
      out.push({
        id: s.id,
        label: s.name,
        kind: skillIsSupportOnly(s.base_dmg, s.scaling) ? 'support' : 'damage',
        iconId: s.icon_id ?? '',
      })
    }
    for (const s of digimonRoleWikiSkillsForRole) {
      if (seen.has(s.id)) continue
      seen.add(s.id)
      out.push({
        id: s.id,
        label: `${s.name} (Role)`,
        kind: 'role-support',
        iconId: s.icon_id ?? '',
      })
    }
    return out
  }, [data, digimonRoleWikiSkillsForRole])

  const customRotationPaletteGroups = useMemo(() => {
    const auto = customRotationSkillOptions.filter((o) => o.kind === 'auto')
    const damage = customRotationSkillOptions
      .filter((o) => o.kind === 'damage')
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label))
    const support = customRotationSkillOptions
      .filter((o) => o.kind === 'support')
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label))
    const role = customRotationSkillOptions
      .filter((o) => o.kind === 'role-support')
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label))
    return { auto, damage, support, role }
  }, [customRotationSkillOptions])

  const skillByIdForLab = useMemo(() => {
    const m = new Map<string, { name: string; icon_id: string }>()
    if (!data) return m
    for (const s of data.skills ?? []) m.set(s.id, { name: s.name, icon_id: s.icon_id ?? '' })
    for (const s of digimonRoleWikiSkillsForRole) {
      if (!m.has(s.id)) m.set(s.id, { name: s.name, icon_id: s.icon_id ?? '' })
    }
    m.set('auto-attack', { name: 'Auto Attack', icon_id: '' })
    return m
  }, [data, digimonRoleWikiSkillsForRole])

  useEffect(() => {
    // While `data` is still loading, options are empty; do not filter or we'd wipe URL-hydrated
    // rotation before skill ids can be validated (breaks share links on cold load / live).
    if (!data || customRotationSkillOptions.length === 0) return
    // While fetching a new Digimon, `data` can still be the previous entry; skip until ids align.
    if (data.id !== digimonId) return
    setCustomRotationSkillIds((prev) =>
      prev.filter((id) => customRotationSkillOptions.some((opt) => opt.id === id)),
    )
    setCustomRotationFillerSkillIds((prev) =>
      prev.filter((id) => customRotationSkillOptions.some((opt) => opt.id === id)),
    )
  }, [data, digimonId, customRotationSkillOptions])

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

  const customRotationFillerResolved = useMemo(
    () =>
      customRotationFillerSkillIds.map((id) => ({
        skillId: id,
        option: customRotationSkillOptions.find((opt) => opt.id === id),
      })),
    [customRotationFillerSkillIds, customRotationSkillOptions],
  )
  const customRotationFillerValidRows = useMemo(
    () =>
      customRotationFillerResolved
        .filter((row) => !!row.option)
        .map((row) => ({ skillId: row.skillId })),
    [customRotationFillerResolved],
  )
  const customRotationFillerInvalidCount = customRotationFillerResolved.filter((row) => !row.option).length

  useEffect(() => {
    if (!data || data.id !== digimonId) {
      setSim(null)
      setSimBusy(false)
      setSimSlowHint(false)
      return
    }

    let cancelled = false
    setSimBusy(true)
    setSimSlowHint(false)
    const slowTimer = window.setTimeout(() => {
      if (!cancelled) setSimSlowHint(true)
    }, DPS_LAB_SLOW_HINT_MS)

    /** Double rAF: let React paint `simBusy` before the synchronous sim blocks the main thread. */
    let rafBeforePaint = 0
    let rafRunSim = 0
    rafBeforePaint = requestAnimationFrame(() => {
      rafRunSim = requestAnimationFrame(() => {
        if (cancelled) return
        try {
          const secs = clampRotationDurationSec(durationSec)
          const result = simulateRotation(
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
              wikiInt: Math.max(0, Math.floor(combatStats?.int ?? data.stats?.int ?? 0)),
              autoAttackAnimationCancel: useAutoAnimCancel,
              animCancelReactionSec: clampAnimCancelReactionMs(animCancelReactionMs) / 1000,
              forceAutoCrit,
              perfectAtClone,
              customRotation: rotationMode === 'custom' ? customRotationValidRows : undefined,
              manualSupportOnly: rotationMode === 'custom',
              customRotationFullCycles:
                rotationMode === 'custom'
                  ? customRotationFullCycles === 0
                    ? 0
                    : clampCustomRotationFullCycles(customRotationFullCycles)
                  : undefined,
              customRotationFiller:
                rotationMode === 'custom' && customRotationFillerValidRows.length > 0
                  ? customRotationFillerValidRows
                  : undefined,
              attackerAttribute: data.attribute ?? '',
              attackerElement: data.element ?? '',
              targetEnemyAttribute: targetEnemyAttribute.trim() || undefined,
              targetEnemyElement: targetEnemyElement.trim() || undefined,
              applySavedGearTrueVice: true,
            },
          )
          if (!cancelled) setSim(result)
        } finally {
          window.clearTimeout(slowTimer)
          if (!cancelled) {
            setSimBusy(false)
            setSimSlowHint(false)
          }
        }
      })
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(rafBeforePaint)
      cancelAnimationFrame(rafRunSim)
      window.clearTimeout(slowTimer)
      setSimBusy(false)
      setSimSlowHint(false)
    }
  }, [
    data,
    digimonId,
    durationSec,
    skillLevels,
    targets,
    isHybridRole,
    hybridStance,
    simBaseAttack,
    combatStats,
    useAutoAnimCancel,
    animCancelReactionMs,
    forceAutoCrit,
    perfectAtClone,
    rotationMode,
    customRotationValidRows,
    customRotationFullCycles,
    customRotationFillerValidRows,
    targetEnemyAttribute,
    targetEnemyElement,
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

  const labTrueViceFrac = useMemo(() => {
    if (!data) return { element: 0, attribute: 0 }
    return trueViceDamageFractionsForSkillHit(
      data.attribute ?? '',
      data.element ?? '',
      targetEnemyAttribute.trim(),
      targetEnemyElement.trim(),
      readGearState(),
    )
  }, [data, targetEnemyAttribute, targetEnemyElement])

  const labAttrSkillDamageMult = useMemo(
    () =>
      attributeAdvantageSkillDamageMultiplierWithFoldedTrueVice(
        data?.attribute,
        targetEnemyAttribute,
        labTrueViceFrac.attribute,
      ),
    [data?.attribute, targetEnemyAttribute, labTrueViceFrac.attribute],
  )

  const rotationAdvice = useMemo((): LabRotationAdviceItem[] => {
    if (!data || !sim || breakdown.length === 0) return []
    const lines: LabRotationAdviceItem[] = []

    const levelOf = (skillId: string) => skillLevels[skillId] ?? 1
    const top = breakdown[0]

    const nameForSkillId = (skillId: string) =>
      skillByIdForLab.get(skillId)?.name ??
      (data.skills ?? []).find((s) => s.id === skillId)?.name ??
      skillId

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

    if (rotationMode === 'custom') {
      if (customRotationValidRows.length > 0) {
        const seq = customRotationValidRows.map((r) => nameForSkillId(r.skillId)).join(' → ')
        lines.push(`Your main sequence (fixed order): ${seq}.`)
      }
      if (customRotationFillerSkillIds.length > 0 && customRotationFillerValidRows.length > 0) {
        const fillerLine = customRotationFillerValidRows.map((r) => nameForSkillId(r.skillId)).join(' → ')
        lines.push(`Downtime gap priority: ${fillerLine}.`)
      } else {
        lines.push(
          'No gap priority set: the sim fills downtime with greedy high-DPS actions (autos vs damage skills using the same effectiveness checks as auto rotation; animation cancel applies when enabled). Supports not listed in your sequence or gap list are not auto-cast.',
        )
      }

      lines.push(
        `Largest damage share in this window: ${top.name} (${top.pct.toFixed(1)}%).`,
      )

      if (bestTransition && bestTransition.count >= 2) {
        lines.push(
          `Common adjacent pair in this timeline: ${bestTransition.from} → ${bestTransition.to} (${bestTransition.count}×).`,
        )
      }

      if (useAutoAnimCancel) {
        const autoOneHit =
          (simBaseAttack || 0) * (1 + (combatStats?.crit_rate ?? 0) / 100000 * 0.5)
        const overlap = clampAnimCancelReactionMs(animCancelReactionMs) / 1000
        const cancelCandidates = (data.skills ?? [])
          .filter((s) => !skillIsSupportOnly(s.base_dmg, s.scaling))
          .map((s) => {
            const level = levelOf(s.id)
            const rawBase = wikiSkillHitCoefficient(s.base_dmg, s.scaling, level, s.max_level)
            const targetHits = s.radius && s.radius > 0 ? Math.max(1, targets) : 1
            const skillOneHit = rawBase * (perfectAtClone ? 1.43 : 1) * targetHits
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
            title: 'Animation cancel DPS',
            bullets: cancelCandidates.slice(0, 4).map(
              (c) =>
                `${c.name}: ${c.cast.toFixed(1)}s cast · ${c.period.toFixed(1)}s cast+CD · ~${c.cancelWeaveRate.toFixed(0)} / s`,
            ),
          })
        }
      }

      if (digimonRoleWikiSkillsForRole.length > 0) {
        const tn = digimonRoleWikiSkillsForRole.map((s) => s.name).join(', ')
        lines.push(
          useAutoAnimCancel
            ? `Role skills (${tn}) are instant — include them in your sequence or gap list to weave after autos.`
            : `Role skills (${tn}) are instant; enable animation cancel under Special modifiers to model weaving.`,
        )
      }

      return lines
    }

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
      lines.push(
        useAutoAnimCancel
          ? `Animation cancel ${names} right after an auto. These buffs are instant and that weaving adds DPS.`
          : `Use support skills (${names}) for utility windows; they are excluded from DPS casts.`,
      )
    }

    if (useAutoAnimCancel) {
      /** One auto: lab ATK with a simple wiki crit rough (same idea as sim fallback); not timeline mean. */
      const autoOneHit =
        (simBaseAttack || 0) * (1 + (combatStats?.crit_rate ?? 0) / 100000 * 0.5)
      const overlap = clampAnimCancelReactionMs(animCancelReactionMs) / 1000
      const cancelCandidates = (data.skills ?? [])
        .filter((s) => !skillIsSupportOnly(s.base_dmg, s.scaling))
        .map((s) => {
          const level = levelOf(s.id)
          const rawBase = wikiSkillHitCoefficient(s.base_dmg, s.scaling, level, s.max_level)
          const targetHits = s.radius && s.radius > 0 ? Math.max(1, targets) : 1
          const skillOneHit = rawBase * (perfectAtClone ? 1.43 : 1) * targetHits
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
          title: 'Animation cancel DPS',
          bullets: cancelCandidates.slice(0, 4).map(
            (c) =>
              `${c.name}: ${c.cast.toFixed(1)}s cast · ${c.period.toFixed(1)}s cast+CD · ~${c.cancelWeaveRate.toFixed(0)} / s`,
          ),
        })
      }
    }

    if (digimonRoleWikiSkillsForRole.length > 0) {
      const tn = digimonRoleWikiSkillsForRole.map((s) => s.name).join(', ')
      lines.push(
        useAutoAnimCancel
          ? `Digimon role skills (${tn}) are instant. Animation cancel them after an auto for more DPS (same idea as your other buffs).`
          : `Digimon role skills (${tn}) are instant cast; turn on animation cancel under Special modifiers to model weaving them after autos.`,
        `Hover buff % on timeline rows for per-hit breakdowns.`,
      )
    }

    return lines
  }, [
    breakdown,
    data,
    sim,
    skillLevels,
    skillByIdForLab,
    rotationMode,
    customRotationValidRows,
    customRotationFillerSkillIds,
    customRotationFillerValidRows,
    digimonRoleWikiSkillsForRole,
    useAutoAnimCancel,
    animCancelReactionMs,
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
  const sealBonusByCombatKey = useMemo<Record<keyof CombatStatsState, number>>(
    () => ({
      hp: sealBonuses.hp,
      ds: sealBonuses.ds,
      attack: sealBonuses.attack,
      defense: sealBonuses.defense,
      crit_rate: sealBonuses.critRate,
      atk_speed: sealBonuses.atkSpeed,
      evasion: sealBonuses.evasion,
      hit_rate: sealBonuses.hitRate,
      block_rate: sealBonuses.blockRate,
      dex: 0,
      int: 0,
    }),
    [sealBonuses],
  )
  const gearBonusByCombatKey = useMemo<Record<keyof CombatStatsState, number>>(
    () => ({
      hp: 0,
      ds: 0,
      attack: gearAttack.totalAttack,
      defense: 0,
      crit_rate: 0,
      atk_speed: 0,
      evasion: 0,
      hit_rate: 0,
      block_rate: 0,
      dex: 0,
      int: 0,
    }),
    [gearAttack.totalAttack],
  )
  const perfectCloneAttackPreview = useMemo(
    () => ({
      baseAttack: simAttackPreview.attackWithSeals,
      bonusAttack: simAttackPreview.cloneAttackBonus,
      effectiveAttack: simAttackPreview.effectiveAttack,
      simAttack: simAttackPreview.simAttack,
    }),
    [simAttackPreview],
  )

  const updateCombatStat = (key: keyof CombatStatsState, next: number) => {
    setCombatStats((prev) => (prev ? { ...prev, [key]: next } : prev))
  }
  const portraitSrc = useMemo(
    () => (data ? digimonPortraitUrl(data.model_id, data.id, data.name) : undefined),
    [data],
  )
  const showLabPortrait = Boolean(portraitSrc && !portraitBroken)

  const moveRotationStep = useCallback((from: number, to: number) => {
    setCustomRotationSkillIds((prev) => {
      if (
        from === to ||
        from < 0 ||
        to < 0 ||
        from >= prev.length ||
        to >= prev.length
      ) {
        return prev
      }
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }, [])

  const moveFillerStep = useCallback((from: number, to: number) => {
    setCustomRotationFillerSkillIds((prev) => {
      if (
        from === to ||
        from < 0 ||
        to < 0 ||
        from >= prev.length ||
        to >= prev.length
      ) {
        return prev
      }
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }, [])

  const [rotationDnd, setRotationDnd] = useState<{ source: number | null; over: number | null }>({
    source: null,
    over: null,
  })
  const [fillerDnd, setFillerDnd] = useState<{ source: number | null; over: number | null }>({
    source: null,
    over: null,
  })

  const buildShareUrl = useCallback(() => {
    const next = new URLSearchParams()
    if (digimonId) next.set('digimonId', digimonId)
    next.set('level', String(globalLevel))
    next.set('duration', String(clampRotationDurationSec(durationSec)))
    next.set('targets', String(Math.max(1, targets)))
    next.set('hybrid', hybridStance)
    next.set('rotationMode', rotationMode)
    if (rotationMode === 'custom' && customRotationSkillIds.length > 0) {
      next.set('rotationSeq', customRotationSkillIds.join(','))
      next.set('rotCycles', String(customRotationFullCycles))
    }
    if (rotationMode === 'custom' && customRotationFillerSkillIds.length > 0) {
      next.set('fillerSeq', customRotationFillerSkillIds.join(','))
    }
    if (useAutoAnimCancel) {
      next.set('animCancel', '1')
      next.set('reactMs', String(clampAnimCancelReactionMs(animCancelReactionMs)))
    }
    if (forceAutoCrit) next.set('forceAutoCrit', '1')
    if (perfectAtClone) next.set('perfectAtClone', '1')
    if (targetEnemyAttribute.trim()) next.set('enemyAttr', targetEnemyAttribute.trim())
    if (targetEnemyElement.trim()) next.set('enemyElement', targetEnemyElement.trim())
    /** Canonical GitHub Pages URL so shared links work outside localhost. */
    const shareBase = 'https://mistgg.github.io/Odyssey-Calc'
    return `${shareBase}#/lab?${next.toString()}`
  }, [
    digimonId,
    globalLevel,
    durationSec,
    targets,
    hybridStance,
    rotationMode,
    customRotationSkillIds,
    customRotationFullCycles,
    customRotationFillerSkillIds,
    useAutoAnimCancel,
    animCancelReactionMs,
    forceAutoCrit,
    perfectAtClone,
    targetEnemyAttribute,
    targetEnemyElement,
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

      {!digimonId && (
        <p className="error">
          Open this page from the Digimon detail button (uses
          <code> digimonId </code> in the URL).
        </p>
      )}
      {loading && <p className="muted">Loading Digimon data…</p>}
      {error && <p className="error">{error}</p>}
      {simBusy && data && data.id === digimonId && (
        <p className="muted lab-sim-busy-status" role="status" aria-live="polite">
          Running rotation simulation…
          {simSlowHint ? ' (Taking longer than expected, please wait.)' : ''}
        </p>
      )}

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
                      <span className="detail-info-pill detail-info-pill-class">+ {data.role || '-'}</span>
                      <span className="detail-info-pill detail-info-pill-type">{data.attribute || '-'}</span>
                      <span className="detail-info-pill detail-info-pill-attrib">{data.element || '-'}</span>
                    </div>
                    <p className="muted lab-identity-sub">
                      {(data.skills ?? []).length} skills · Wiki attack {data.attack.toLocaleString()}
                      {simAttackPreview.hasEffectiveOverride
                        ? ` · Effective AT ${simBaseAttack.toLocaleString(undefined, { maximumFractionDigits: 1 })}`
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
                    <div
                      key={row.key}
                      className={[
                        'stat-cell',
                        row.key === 'attack' && perfectAtClone ? 'stat-cell--perfect-clone' : '',
                        sealBonusByCombatKey[row.key] > 0 ? 'stat-cell--seal' : '',
                        gearBonusByCombatKey[row.key] > 0 ? 'stat-cell--gear' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {(() => {
                        const sealBonus = sealBonusByCombatKey[row.key]
                        const gearBonus = gearBonusByCombatKey[row.key]
                        const isAttackRow = row.key === 'attack'
                        const hasAttackModifier =
                          isAttackRow &&
                          (sealBonus > 0 || gearBonus > 0 || simAttackPreview.cloneAttackBonus > 0)
                        return (
                          <>
                      <span className="stat-label">{row.label}</span>
                      <EditableNumberInput
                        className={[
                          'lab-stat-input',
                          row.key === 'attack' && perfectAtClone ? 'lab-stat-input--perfect-clone' : '',
                          sealBonusByCombatKey[row.key] > 0 ? 'lab-stat-input--seal' : '',
                          gearBonusByCombatKey[row.key] > 0 ? 'lab-stat-input--gear' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        min={0}
                        integer
                        emptyValue={0}
                        value={row.value}
                        onCommit={(next) => updateCombatStat(row.key, next)}
                      />
                      {hasAttackModifier ? (
                        <div className="lab-perfect-clone-popover" role="note" aria-live="polite">
                          {sealBonus > 0 ? (
                            <div className="lab-perfect-clone-popover-row">
                              <span className="lab-seal-badge-label">
                                <span className="lab-seal-badge-icon" aria-hidden="true" />
                                <span>Seals</span>
                              </span>
                              <strong>+{sealBonus.toLocaleString()}</strong>
                            </div>
                          ) : null}
                          {gearBonus > 0 ? (
                            <div className="lab-perfect-clone-popover-row">
                              <span className="lab-gear-badge-label">
                                <span className="lab-gear-badge-icon" aria-hidden="true" />
                                <span>Gear</span>
                              </span>
                              <strong>
                                +
                                {gearBonus.toLocaleString(undefined, {
                                  maximumFractionDigits: 1,
                                })}
                              </strong>
                            </div>
                          ) : null}
                          {simAttackPreview.cloneAttackBonus > 0 ? (
                            <div className="lab-perfect-clone-popover-row">
                              <span className="lab-perfect-clone-badge-label">
                                <span className="lab-perfect-clone-badge">15</span>
                                <span>Clone AT</span>
                              </span>
                              <strong>+{perfectCloneAttackPreview.bonusAttack.toLocaleString()}</strong>
                            </div>
                          ) : null}
                          <div className="lab-perfect-clone-popover-row lab-perfect-clone-popover-row--total">
                            <span>Effective AT</span>
                            <strong>
                              {simAttackPreview.simAttack.toLocaleString(undefined, {
                                maximumFractionDigits: 1,
                              })}
                            </strong>
                          </div>
                        </div>
                      ) : sealBonus > 0 || gearBonus > 0 ? (
                        <div className="lab-seal-popover" role="note">
                          {sealBonus > 0 ? (
                            <div className="lab-perfect-clone-popover-row">
                              <span className="lab-seal-badge-label">
                                <span className="lab-seal-badge-icon" aria-hidden="true" />
                                <span>Seals</span>
                              </span>
                              <strong>+{sealBonus.toLocaleString()}</strong>
                            </div>
                          ) : null}
                          {gearBonus > 0 ? (
                            <div className="lab-perfect-clone-popover-row">
                              <span className="lab-gear-badge-label">
                                <span className="lab-gear-badge-icon" aria-hidden="true" />
                                <span>Gear</span>
                              </span>
                              <strong>
                                +
                                {gearBonus.toLocaleString(undefined, {
                                  maximumFractionDigits: 1,
                                })}
                              </strong>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                          </>
                        )
                      })()}
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
                  <EditableNumberInput
                    min={1}
                    max={SKILL_LEVEL_CAP}
                    integer
                    emptyValue={1}
                    value={globalLevel}
                    onCommit={(v) => {
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
                  <EditableNumberInput
                    min={1}
                    integer
                    emptyValue={1}
                    value={targets}
                    onCommit={(next) => setTargets(next)}
                  />
                </label>
                <label className="lab-sim-duration-label">
                  <span className="lab-sim-duration-label-text">
                    {rotationMode === 'custom' ? 'Max simulation time' : 'Simulation seconds'}
                  </span>
                  <EditableNumberInput
                    min={MIN_ROTATION_SIM_DURATION_SEC}
                    max={MAX_ROTATION_SIM_DURATION_SEC}
                    step={5}
                    integer
                    emptyValue={DEFAULT_ROTATION_SIM_DURATION_SEC}
                    value={durationSec}
                    onCommit={(next) => setDurationSec(clampRotationDurationSec(next))}
                  />
                </label>
                <div className="lab-enemy-attr-field lab-target-matchups">
                  <div className="lab-matchup-section lab-matchup-section--attribute">
                    <p className="lab-matchup-heading" id="lab-matchup-attribute-heading">
                      Target attribute (Vaccine · Data · Virus)
                    </p>
                    <EnemyAttributeTargetField
                      value={targetEnemyAttribute}
                      onChange={setTargetEnemyAttribute}
                      attackerAttribute={data?.attribute}
                      ariaLabel="Enemy Digimon wiki attribute for Vaccine–Data–Virus skill damage advantage"
                      fieldCaption="Enemy attribute"
                    />
                  </div>
                  <div
                    className="lab-matchup-section lab-matchup-section--element"
                    aria-labelledby="lab-matchup-element-heading"
                  >
                    <p className="lab-matchup-heading" id="lab-matchup-element-heading">
                      Target element (True Vice chart)
                    </p>
                    <EnemyElementTargetField
                      value={targetEnemyElement}
                      onChange={setTargetEnemyElement}
                      attackerElement={data?.element}
                      ariaLabel="Enemy wiki element for True Vice element-damage lines on gear"
                      fieldCaption="Enemy element (True Vice)"
                      showLegend={true}
                    />
                  </div>
                </div>
                {rotationMode === 'custom' ? (
                  <>
                    <label className="lab-sim-duration-label">
                      <span className="lab-sim-duration-label-text">Full rotation passes</span>
                      <EditableNumberInput
                        min={0}
                        max={MAX_CUSTOM_ROTATION_FULL_CYCLES}
                        integer
                        emptyValue={DEFAULT_CUSTOM_ROTATION_FULL_CYCLES}
                        value={customRotationFullCycles}
                        onCommit={(v) =>
                          setCustomRotationFullCycles(
                            v === 0 ? 0 : clampCustomRotationFullCycles(v),
                          )
                        }
                      />
                    </label>
                    <div
                      className="lab-rotation-passes-callout"
                      role="note"
                      aria-label="How full rotation passes work"
                    >
                      <p className="lab-rotation-passes-callout-title">How full passes work</p>
                      <ul className="lab-rotation-passes-callout-list">
                        <li>
                          This is how many times your <strong>entire</strong> custom sequence runs
                          (every step, in order).
                        </li>
                        <li>
                          Gaps while waiting on your sequence use your <strong>cooldown gap priority</strong>{' '}
                          list when set. If you leave it empty, the sim uses <strong>greedy high-DPS filler</strong>{' '}
                          (autos vs damage skills; animation-cancel rules apply). Off-sequence supports are not
                          auto-cast in custom mode unless you add them to the sequence or gap list.
                        </li>
                        <li>
                          <strong>0</strong> repeats the sequence until <strong>max simulation time</strong>{' '}
                          is reached.
                        </li>
                      </ul>
                    </div>
                  </>
                ) : null}
              </div>
              {data && labAttrSkillDamageMult > 1 + 1e-9 ? (
                <p className="lab-enemy-attr-active-hint" role="status">
                  {targetEnemyAttribute === 'None'
                    ? 'Attribute matchup: neutral enemy (None) — '
                    : `Attribute matchup: your type beats ${targetEnemyAttribute} — `}
                  skill damage ×
                  {labAttrSkillDamageMult.toFixed(2).replace(/\.?0+$/, '')} on the full skill hit (
                  {labTrueViceFrac.attribute > 1e-9 &&
                  attributeAdvantageSkillDamageMultiplier(data.attribute ?? '', targetEnemyAttribute) > 1 + 1e-9
                    ? `${Math.round((attributeAdvantageSkillDamageMultiplier(data.attribute ?? '', targetEnemyAttribute) - 1) * 100)}% triangle + ${Math.round(labTrueViceFrac.attribute * 100)}% True Vice attribute from Gear`
                    : `${Math.round((labAttrSkillDamageMult - 1) * 100)}% if the correct attribute`}
                  ). Auto damage unchanged.
                </p>
              ) : null}
              {data &&
              targetEnemyElement.trim() &&
              trueViceElementBonusActive(data.element ?? '', targetEnemyElement) ? (
                <p className="lab-enemy-element-active-hint" role="status">
                  Element matchup: enemy <strong>{targetEnemyElement}</strong> is the element your digimon beats
                  on the True Vice chart — True Vice <strong>element</strong> % lines on saved gear can apply in
                  the sim.
                </p>
              ) : null}
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
                  <div className="lab-custom-rotation-card-head">
                    <div>
                      <p className="lab-custom-rotation-card-title">Build your rotation</p>
                      <p className="lab-custom-rotation-card-sub">
                        Click a skill to append. Drag tiles to reorder. The sim follows this list in
                        order.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="lab-btn lab-btn--ghost"
                      onClick={() => setCustomRotationSkillIds([])}
                      disabled={customRotationSkillIds.length === 0}
                    >
                      Clear all
                    </button>
                  </div>

                  <div className="lab-rotation-palette">
                    {customRotationPaletteGroups.auto.length > 0 ? (
                      <div className="lab-rotation-palette-row">
                        <span className="lab-rotation-palette-row-label">Basics</span>
                        <div className="lab-rotation-palette-chips">
                          {customRotationPaletteGroups.auto.map((opt) => (
                            <button
                              type="button"
                              key={opt.id}
                              className="lab-rotation-palette-chip"
                              onClick={() =>
                                setCustomRotationSkillIds((prev) => [...prev, opt.id])
                              }
                            >
                              {skillIconUrl(opt.iconId) ? (
                                <img
                                  src={skillIconUrl(opt.iconId)}
                                  alt=""
                                  className="lab-rotation-palette-chip-icon"
                                />
                              ) : (
                                <span className="lab-rotation-palette-chip-fallback" aria-hidden>
                                  A
                                </span>
                              )}
                              <span className="lab-rotation-palette-chip-text">{opt.label}</span>
                              <span className="lab-rotation-palette-chip-kind">Auto</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {customRotationPaletteGroups.damage.length > 0 ? (
                      <div className="lab-rotation-palette-row">
                        <span className="lab-rotation-palette-row-label">Damage</span>
                        <div className="lab-rotation-palette-chips">
                          {customRotationPaletteGroups.damage.map((opt) => (
                            <button
                              type="button"
                              key={opt.id}
                              className="lab-rotation-palette-chip"
                              onClick={() =>
                                setCustomRotationSkillIds((prev) => [...prev, opt.id])
                              }
                            >
                              {skillIconUrl(opt.iconId) ? (
                                <img
                                  src={skillIconUrl(opt.iconId)}
                                  alt=""
                                  className="lab-rotation-palette-chip-icon"
                                />
                              ) : (
                                <span className="lab-rotation-palette-chip-fallback" aria-hidden>
                                  ◆
                                </span>
                              )}
                              <span className="lab-rotation-palette-chip-text">{opt.label}</span>
                              <span className="lab-rotation-palette-chip-kind">DMG</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {customRotationPaletteGroups.support.length > 0 ? (
                      <div className="lab-rotation-palette-row">
                        <span className="lab-rotation-palette-row-label">Support</span>
                        <div className="lab-rotation-palette-chips">
                          {customRotationPaletteGroups.support.map((opt) => (
                            <button
                              type="button"
                              key={opt.id}
                              className="lab-rotation-palette-chip"
                              onClick={() =>
                                setCustomRotationSkillIds((prev) => [...prev, opt.id])
                              }
                            >
                              {skillIconUrl(opt.iconId) ? (
                                <img
                                  src={skillIconUrl(opt.iconId)}
                                  alt=""
                                  className="lab-rotation-palette-chip-icon"
                                />
                              ) : (
                                <span className="lab-rotation-palette-chip-fallback" aria-hidden>
                                  +
                                </span>
                              )}
                              <span className="lab-rotation-palette-chip-text">{opt.label}</span>
                              <span className="lab-rotation-palette-chip-kind">Sup</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {customRotationPaletteGroups.role.length > 0 ? (
                      <div className="lab-rotation-palette-row">
                        <span className="lab-rotation-palette-row-label">Role</span>
                        <div className="lab-rotation-palette-chips">
                          {customRotationPaletteGroups.role.map((opt) => (
                            <button
                              type="button"
                              key={opt.id}
                              className="lab-rotation-palette-chip"
                              onClick={() =>
                                setCustomRotationSkillIds((prev) => [...prev, opt.id])
                              }
                            >
                              {skillIconUrl(opt.iconId) ? (
                                <img
                                  src={skillIconUrl(opt.iconId)}
                                  alt=""
                                  className="lab-rotation-palette-chip-icon"
                                />
                              ) : (
                                <span className="lab-rotation-palette-chip-fallback" aria-hidden>
                                  R
                                </span>
                              )}
                              <span className="lab-rotation-palette-chip-text">{opt.label}</span>
                              <span className="lab-rotation-palette-chip-kind">Role</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {customRotationSkillIds.length === 0 ? (
                    <p className="lab-custom-rotation-warning">
                      Add at least one step to run custom mode.
                    </p>
                  ) : null}
                  {customRotationInvalidCount > 0 ? (
                    <p className="lab-custom-rotation-warning">
                      {customRotationInvalidCount} sequence entr
                      {customRotationInvalidCount === 1 ? 'y is' : 'ies are'} no longer valid for this
                      Digimon/stance and will be ignored.
                    </p>
                  ) : null}

                  {customRotationSkillIds.length > 0 ? (
                    <div className="lab-rotation-timeline-wrap">
                      <p className="lab-rotation-timeline-label">Order (drag to reorder)</p>
                      <div
                        className={
                          rotationDnd.source != null
                            ? 'lab-rotation-timeline lab-rotation-timeline--dnd-active'
                            : 'lab-rotation-timeline'
                        }
                        onDragLeave={(e) => {
                          const related = e.relatedTarget as Node | null
                          if (related && e.currentTarget.contains(related)) return
                          setRotationDnd((s) => (s.source == null ? s : { ...s, over: null }))
                        }}
                      >
                        {customRotationResolved.map((row, idx) => {
                          const skWiki = skillByIdForLab.get(row.skillId)
                          const name = row.option?.label ?? skWiki?.name ?? row.skillId
                          const iconId = row.option?.iconId ?? skWiki?.icon_id ?? ''
                          const kind = row.option?.kind ?? 'invalid'
                          const isDragging = rotationDnd.source === idx
                          const isDropTarget =
                            rotationDnd.over === idx &&
                            rotationDnd.source != null &&
                            rotationDnd.source !== idx
                          return (
                            <div
                              key={`${row.skillId}-${idx}`}
                              className={[
                                'lab-rotation-tile',
                                isDragging ? 'lab-rotation-tile--dragging' : '',
                                isDropTarget ? 'lab-rotation-tile--drop-target' : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData(LAB_ROTATION_DND_MIME, String(idx))
                                e.dataTransfer.effectAllowed = 'move'
                                setRotationDnd({ source: idx, over: null })
                              }}
                              onDragEnter={(e) => {
                                e.preventDefault()
                                setRotationDnd((s) =>
                                  s.source == null ? s : { ...s, over: idx },
                                )
                              }}
                              onDragOver={(e) => {
                                e.preventDefault()
                                e.dataTransfer.dropEffect = 'move'
                              }}
                              onDragEnd={() => setRotationDnd({ source: null, over: null })}
                              onDrop={(e) => {
                                e.preventDefault()
                                const raw = e.dataTransfer.getData(LAB_ROTATION_DND_MIME)
                                const from = Number(raw)
                                setRotationDnd({ source: null, over: null })
                                if (!Number.isFinite(from)) return
                                moveRotationStep(from, idx)
                              }}
                            >
                              <span className="lab-rotation-tile-grip" aria-hidden>
                                ⋮⋮
                              </span>
                              {skillIconUrl(iconId) ? (
                                <img
                                  src={skillIconUrl(iconId)}
                                  alt=""
                                  className="lab-rotation-tile-icon"
                                />
                              ) : (
                                <span className="lab-rotation-tile-icon-fallback" aria-hidden>
                                  {kind === 'auto' ? 'A' : kind === 'invalid' ? '?' : '◇'}
                                </span>
                              )}
                              <div className="lab-rotation-tile-body">
                                <span className="lab-rotation-tile-name">{name}</span>
                                <span className="lab-rotation-tile-meta">
                                  #{idx + 1} · {kind}
                                </span>
                              </div>
                              <button
                                type="button"
                                className="lab-rotation-tile-remove"
                                aria-label={`Remove ${name}`}
                                onPointerDown={(ev) => ev.stopPropagation()}
                                onClick={() =>
                                  setCustomRotationSkillIds((prev) =>
                                    prev.filter((_, i) => i !== idx),
                                  )
                                }
                              >
                                ×
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className="lab-custom-rotation-filler" aria-label="Cooldown gap priority">
                    <div className="lab-custom-rotation-card-head">
                      <div>
                        <p className="lab-custom-rotation-card-title">Cooldown gap priority</p>
                        <p className="lab-custom-rotation-card-sub">
                          While waiting to run your rotation, the sim will attempt to run these skills in the
                          order you provide.{' '}
                          <strong>
                            If nothing is provided, the sim will try to calculate the best options
                          </strong>{' '}
                          (greedy DPS while respecting custom rotation rules).
                        </p>
                      </div>
                      <button
                        type="button"
                        className="lab-btn lab-btn--ghost"
                        onClick={() => setCustomRotationFillerSkillIds([])}
                        disabled={customRotationFillerSkillIds.length === 0}
                      >
                        Clear gap list
                      </button>
                    </div>

                    <div className="lab-rotation-palette">
                      <div className="lab-rotation-palette-row lab-rotation-palette-row--filler">
                        <span className="lab-rotation-palette-row-label">Add to gap priority</span>
                        <div className="lab-rotation-palette-chips lab-rotation-palette-chips--filler-wrap">
                          {customRotationSkillOptions.map((opt) => (
                            <button
                              type="button"
                              key={`filler-${opt.id}`}
                              className="lab-rotation-palette-chip"
                              onClick={() =>
                                setCustomRotationFillerSkillIds((prev) => [...prev, opt.id])
                              }
                            >
                              {skillIconUrl(opt.iconId) ? (
                                <img
                                  src={skillIconUrl(opt.iconId)}
                                  alt=""
                                  className="lab-rotation-palette-chip-icon"
                                />
                              ) : (
                                <span className="lab-rotation-palette-chip-fallback" aria-hidden>
                                  {opt.kind === 'auto'
                                    ? 'A'
                                    : opt.kind === 'role-support'
                                      ? 'R'
                                      : opt.kind === 'support'
                                        ? '+'
                                        : '◆'}
                                </span>
                              )}
                              <span className="lab-rotation-palette-chip-text">{opt.label}</span>
                              <span className="lab-rotation-palette-chip-kind">
                                {opt.kind === 'auto'
                                  ? 'Auto'
                                  : opt.kind === 'support'
                                    ? 'Sup'
                                    : opt.kind === 'role-support'
                                      ? 'Role'
                                      : 'DMG'}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {customRotationFillerInvalidCount > 0 ? (
                      <p className="lab-custom-rotation-warning">
                        {customRotationFillerInvalidCount} gap-priority entr
                        {customRotationFillerInvalidCount === 1 ? 'y is' : 'ies are'} no longer valid and
                        will be ignored.
                      </p>
                    ) : null}

                    {customRotationFillerSkillIds.length > 0 ? (
                      <div className="lab-rotation-timeline-wrap">
                        <p className="lab-rotation-timeline-label">Gap priority order (drag to reorder)</p>
                        <div
                          className={
                            fillerDnd.source != null
                              ? 'lab-rotation-timeline lab-rotation-timeline--dnd-active'
                              : 'lab-rotation-timeline'
                          }
                          onDragLeave={(e) => {
                            const related = e.relatedTarget as Node | null
                            if (related && e.currentTarget.contains(related)) return
                            setFillerDnd((s) => (s.source == null ? s : { ...s, over: null }))
                          }}
                        >
                          {customRotationFillerResolved.map((row, idx) => {
                            const skWiki = skillByIdForLab.get(row.skillId)
                            const name = row.option?.label ?? skWiki?.name ?? row.skillId
                            const iconId = row.option?.iconId ?? skWiki?.icon_id ?? ''
                            const kind = row.option?.kind ?? 'invalid'
                            const isDragging = fillerDnd.source === idx
                            const isDropTarget =
                              fillerDnd.over === idx &&
                              fillerDnd.source != null &&
                              fillerDnd.source !== idx
                            return (
                              <div
                                key={`filler-${row.skillId}-${idx}`}
                                className={[
                                  'lab-rotation-tile',
                                  isDragging ? 'lab-rotation-tile--dragging' : '',
                                  isDropTarget ? 'lab-rotation-tile--drop-target' : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.setData(LAB_ROTATION_FILLER_DND_MIME, String(idx))
                                  e.dataTransfer.effectAllowed = 'move'
                                  setFillerDnd({ source: idx, over: null })
                                }}
                                onDragEnter={(e) => {
                                  e.preventDefault()
                                  setFillerDnd((s) =>
                                    s.source == null ? s : { ...s, over: idx },
                                  )
                                }}
                                onDragOver={(e) => {
                                  e.preventDefault()
                                  e.dataTransfer.dropEffect = 'move'
                                }}
                                onDragEnd={() => setFillerDnd({ source: null, over: null })}
                                onDrop={(e) => {
                                  e.preventDefault()
                                  const raw = e.dataTransfer.getData(LAB_ROTATION_FILLER_DND_MIME)
                                  const from = Number(raw)
                                  setFillerDnd({ source: null, over: null })
                                  if (!Number.isFinite(from)) return
                                  moveFillerStep(from, idx)
                                }}
                              >
                                <span className="lab-rotation-tile-grip" aria-hidden>
                                  ⋮⋮
                                </span>
                                {skillIconUrl(iconId) ? (
                                  <img
                                    src={skillIconUrl(iconId)}
                                    alt=""
                                    className="lab-rotation-tile-icon"
                                  />
                                ) : (
                                  <span className="lab-rotation-tile-icon-fallback" aria-hidden>
                                    {kind === 'auto' ? 'A' : kind === 'invalid' ? '?' : '◇'}
                                  </span>
                                )}
                                <div className="lab-rotation-tile-body">
                                  <span className="lab-rotation-tile-name">{name}</span>
                                  <span className="lab-rotation-tile-meta">
                                    #{idx + 1} · {kind}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className="lab-rotation-tile-remove"
                                  aria-label={`Remove ${name} from gap priority`}
                                  onPointerDown={(ev) => ev.stopPropagation()}
                                  onClick={() =>
                                    setCustomRotationFillerSkillIds((prev) =>
                                      prev.filter((_, i) => i !== idx),
                                    )
                                  }
                                >
                                  ×
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
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
                    <span>Guaranteed Crit</span>
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
                  {useAutoAnimCancel ? (
                    <div className="lab-special-modifier-reaction">
                      <label htmlFor="lab-anim-cancel-react-ms" className="lab-special-modifier-reaction-label">
                        Reaction time
                      </label>
                      <div className="lab-special-modifier-reaction-field">
                        <input
                          id="lab-anim-cancel-react-ms"
                          type="number"
                          inputMode="numeric"
                          min={ANIM_CANCEL_REACTION_MS_MIN}
                          max={ANIM_CANCEL_REACTION_MS_MAX}
                          step={10}
                          value={animCancelReactionMs}
                          onChange={(e) => {
                            const v = e.target.valueAsNumber
                            if (!Number.isFinite(v)) return
                            setAnimCancelReactionMs(clampAnimCancelReactionMs(v))
                          }}
                          aria-label="Animation cancel reaction time in milliseconds"
                        />
                        <span className="muted">
                          ms ({ANIM_CANCEL_REACTION_MS_MIN}-{ANIM_CANCEL_REACTION_MS_MAX}, default{' '}
                          {ANIM_CANCEL_REACTION_MS_DEFAULT})
                        </span>
                      </div>
                    </div>
                  ) : null}
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
                Role skills only (no tamer skills). They have no skill levels or scaling in the sim — effects use
                full description values. Instant casts (0s), like all buffs in the current sim. Hybrid: one
                stance at a time. Hit / INT (and skills that only buff those) aren&apos;t in the rotation sim
                yet. Those rows are informational.
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
                        <td>{typeof s.buff?.duration === 'number' ? `${s.buff.duration}s` : '-'}</td>
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
                            : '-'}
                        </td>
                        <td>{cap}</td>
                        <td>
                          <EditableNumberInput
                            className="lab-level-input"
                            min={1}
                            max={cap}
                            integer
                            emptyValue={1}
                            value={levelValue}
                            onCommit={(v) => {
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
                  {rotationMode === 'custom' ? 'Custom rotation simulation' : 'Optimal rotation simulation'}
                </h3>
                <p className="lab-sim-window-meta">
                  Simulated time:{' '}
                  <span className="lab-sim-window-meta-value">
                    {sim.durationSec.toLocaleString(undefined, { maximumFractionDigits: 2 })}s
                  </span>
                  {rotationMode === 'custom' && sim.simCapSec != null ? (
                    <>
                      {' '}
                      · Cap {sim.simCapSec}s
                      {sim.durationSec + 0.015 < sim.simCapSec ? (
                        <span className="lab-sim-window-meta-note"> (stopped early)</span>
                      ) : null}
                    </>
                  ) : null}
                  {sim.customRotationCyclesCompleted != null ? (
                    <>
                      {' '}
                      · {sim.customRotationCyclesCompleted} full rotation pass
                      {sim.customRotationCyclesCompleted === 1 ? '' : 'es'}
                    </>
                  ) : null}
                </p>
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
