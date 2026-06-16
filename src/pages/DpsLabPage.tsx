import { createPortal } from 'react-dom'
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, useLocation } from 'react-router-dom'
import { fetchDigimonDetail } from '../api/digimonService'
import {
  communityRotationMatchesLabSubmission,
  communityRotationUsableInLab,
  fetchBestApprovedRotation,
  formatCommunityRotationError,
  isRotationSubmittedLocally,
  labRotationRowsFromSkillIds,
  markRotationSubmitted,
  submitCommunityRotation,
  tierSubmissionAlreadyCovered,
  type CommunityRotation,
} from '../lib/communityRotations'
import { resolveAppSiteOrigin } from '../config/site'
import { refreshTierListDigimonInCache } from '../lib/tierListDigimonEntry'
import { useAuth } from '../auth/useAuth'
import {
  compareTierSubmissionRotations,
  tierSubmissionModifiersFromLab,
  type TierSubmissionRotationCompare,
} from '../lib/tierSubmissionSim'
import { TIER_DPS_SIM_REVISION } from '../lib/dpsSim'
import {
  attributeAdvantageSkillDamageMultiplier,
  attributeAdvantageSkillDamageMultiplierWithFoldedTrueVice,
} from '../lib/attributeAdvantage'
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
  resolveSealStatBonuses,
  getGearEquipmentCombatBonuses,
  aggregateAccessoryCombatBonuses,
  readGearState,
  type WikiCombatBaseForSeals,
  trueViceDamageFractionsForSkillHit,
} from '../lib/gearStats'
import { digimonRoleWikiSkills, normalizeWikiRole, type HybridStance } from '../lib/digimonRoleSkills'
import { SKILL_LEVEL_CAP, skillIsSupportOnly } from '../lib/skillDamage'
import {
  clampDigimonIntLevel,
  DIGIMON_INT_LEVEL_CAP,
  effectiveIntAtDigimonLevel,
  wikiBaseIntFromStats,
} from '../lib/wikiIntScaling'
import type { RotationDamageBreakdown, RotationEvent } from '../lib/dpsSim'
import { EnemyAttributeTargetField } from '../components/EnemyAttributeTargetField'
import { DPS_TARGET_ENEMY_ATTRIBUTE_OPTIONS } from '../lib/wikiListFacetOptions'
import type { WikiDigimonDetail } from '../types/wikiApi'

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
    /** Capture-phase listener sees scroll on every scrollable subtree; ignore panel/trigger so wheel scrolling inside the breakdown works. */
    const onScroll = (ev: Event) => {
      const target = ev.target
      if (!(target instanceof Node)) return
      if (panelRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      setOpen(false)
    }
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
        onClick={(ev) => ev.stopPropagation()}
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
            onWheel={(ev) => {
              ev.stopPropagation()
            }}
          >
            <div className="buff-breakdown-panel">{panelInner}</div>
          </div>,
          document.body,
        )}
    </>
  )
}

function fmtTimelineBreakdownNum(n: number, maxFrac: number) {
  if (!Number.isFinite(n)) return '—'
  const a = Math.abs(n)
  if (a >= 10_000 || (a > 0 && a < 0.001)) {
    return n.toLocaleString(undefined, { maximumFractionDigits: maxFrac })
  }
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFrac,
  })
}

const BK_MULT_IS_ONE_EPS = 1e-5

/** Hide multiplier rows that are effectively ×1 (no effect on damage). */
function approxUnityMultiplier(x: number): boolean {
  return Number.isFinite(x) && Math.abs(x - 1) < BK_MULT_IS_ONE_EPS
}

function BreakdownDt({ title, hint }: { title: string; hint?: string }) {
  return (
    <dt>
      <div className="lab-timeline-breakdown-label">{title}</div>
      {hint ? <div className="lab-timeline-breakdown-hint">{hint}</div> : null}
    </dt>
  )
}

/** Expanded row: intermediate numbers from the same step as the damage sim. */
function TimelineDamageBreakdownPanel({ b }: { b: RotationDamageBreakdown }) {
  if (b.kind === 'auto') {
    const showCritMult = !approxUnityMultiplier(b.critMult)
    const showTargetMult = !approxUnityMultiplier(b.targetMultiplier)
    return (
      <div className="lab-timeline-breakdown">
        <div className="lab-timeline-breakdown-title">Auto attack damage</div>
        <dl className="lab-timeline-breakdown-dl">
          <BreakdownDt title="Base ATK (sim)" />
          <dd>{fmtTimelineBreakdownNum(b.simBaseAttack, 2)}</dd>
          <BreakdownDt title="+ Flat ATK from buffs" />
          <dd>{fmtTimelineBreakdownNum(b.buffFlatAttack, 2)}</dd>
          <BreakdownDt title="ATK % from buffs" />
          <dd>{fmtTimelineBreakdownNum(b.attackPctFromBuffs, 2)}%</dd>
          <BreakdownDt title="ATK after flat &amp; %" />
          <dd>{fmtTimelineBreakdownNum(b.atkAfterFlatAndPct, 2)}</dd>
          {showCritMult ? (
            <>
              <BreakdownDt
                title="Crit multiplier"
                hint="Expected damage vs never critting: blends non-crit and crit using crit chance (wiki crit stat + buff %) and buff crit damage. Same formula as autos in the sim."
              />
              <dd>×{fmtTimelineBreakdownNum(b.critMult, 4)}</dd>
            </>
          ) : null}
          {showTargetMult ? (
            <>
              <BreakdownDt title="Target / hits multiplier" hint="Extra enemies when the sim uses multiple targets." />
              <dd>×{fmtTimelineBreakdownNum(b.targetMultiplier, 4)}</dd>
            </>
          ) : null}
          <BreakdownDt title="Final damage" />
          <dd className="lab-timeline-breakdown-dd-strong">
            {fmtTimelineBreakdownNum(b.finalDamage, 2)}
          </dd>
        </dl>
        {!showCritMult ? (
          <p className="lab-timeline-breakdown-footnote">
            Crit line omitted when the multiplier is ×1 (0% crit chance and no extra crit damage, or
            crit effectively neutral).
          </p>
        ) : null}
      </div>
    )
  }

  const showPreSkill = !approxUnityMultiplier(b.preSkillBuffMult)
  const showSkillPct = !approxUnityMultiplier(b.skillPctMult)
  const showCritMult = !approxUnityMultiplier(b.critMult)
  const showTargetHits = !approxUnityMultiplier(b.targetHits)
  const showAttrAdv = !approxUnityMultiplier(b.attributeAdvantageSkillMult)

  return (
    <div className="lab-timeline-breakdown">
      <div className="lab-timeline-breakdown-title">Skill hit damage</div>
      <dl className="lab-timeline-breakdown-dl">
        <BreakdownDt
          title="Wiki Skill Damage x Target Count"
          hint="Wiki base/scaling at your skill level, times how many enemies this cast hits in the sim (1 for single-target)."
        />
        <dd>{fmtTimelineBreakdownNum(b.wikiCoefficientTotal, 2)}</dd>
        {showPreSkill ? (
          <>
            <BreakdownDt
              title="Clone / True Vice (pre–skill-damage)"
              hint="Extra fraction applied to the wiki portion before skill-damage % (clone stance, True Vice chip)."
            />
            <dd>×{fmtTimelineBreakdownNum(b.preSkillBuffMult, 4)}</dd>
          </>
        ) : null}
        {showSkillPct ? (
          <>
            <BreakdownDt title="Skill damage % (buffs + INT)" />
            <dd>×{fmtTimelineBreakdownNum(b.skillPctMult, 4)}</dd>
          </>
        ) : null}
        <BreakdownDt
          title="Wiki damage after clone, TV, and skill %"
          hint="Previous row × clone/True Vice mult × skill damage % (buffs + INT). This is only the wiki-based slice of the skill, before adding the ATK-scaling slice."
        />
        <dd>{fmtTimelineBreakdownNum(b.baseSkillTerm, 2)}</dd>
        <BreakdownDt title="ATK after buffs" hint="Sim ATK with flat and attack % from buffs." />
        <dd>{fmtTimelineBreakdownNum(b.atkBuffedWithBuffs, 2)}</dd>
        {showCritMult ? (
          <>
            <BreakdownDt
              title="Crit multiplier"
              hint="Same expected crit blending as autos when this skill can crit; omitted at ×1 if the skill cannot crit."
            />
            <dd>×{fmtTimelineBreakdownNum(b.critMult, 4)}</dd>
          </>
        ) : null}
        {showTargetHits ? (
          <>
            <BreakdownDt
              title="AoE target factor"
              hint="Hit count for radius skills (extra targets in the sim)."
            />
            <dd>×{fmtTimelineBreakdownNum(b.targetHits, 4)}</dd>
          </>
        ) : null}
        <BreakdownDt
          title="ATK-scaling portion"
          hint="Buffed ATK × crit mult × target factor — the part of the skill that scales off ATK. Added to the wiki portion above (not another × on the whole hit)."
        />
        <dd>{fmtTimelineBreakdownNum(b.atkTerm, 2)}</dd>
        <BreakdownDt title="Wiki portion + ATK portion" />
        <dd>{fmtTimelineBreakdownNum(b.rawSkillHit, 2)}</dd>
        {showAttrAdv ? (
          <>
            <BreakdownDt title="Attribute advantage (skill)" />
            <dd>×{fmtTimelineBreakdownNum(b.attributeAdvantageSkillMult, 4)}</dd>
          </>
        ) : null}
        <BreakdownDt title="Final damage" />
        <dd className="lab-timeline-breakdown-dd-strong">
          {fmtTimelineBreakdownNum(b.finalDamage, 2)}
        </dd>
      </dl>
    </div>
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

/** Lab special modifiers default on; URL can disable with `key=0`. */
function parseToggleFromParams(params: URLSearchParams, key: string): boolean {
  if (!params.has(key)) return true
  const raw = (params.get(key) ?? '').trim().toLowerCase()
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

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

/** Expand `auto-attack×7` / `auto-attackx7` tokens into repeated auto steps for shared URLs. */
function expandCustomRotationSeqToken(token: string): string[] {
  const m = /^auto-attack\s*[×x]\s*(\d+)$/i.exec(token.trim())
  if (!m) return [token]
  const n = Math.min(100, Math.max(1, Number.parseInt(m[1], 10) || 1))
  return Array.from({ length: n }, () => 'auto-attack')
}

function parseCustomRotationFromParams(params: URLSearchParams): string[] {
  const raw = params.get('rotationSeq')?.trim() ?? ''
  if (!raw) return []
  return raw
    .split(',')
    .flatMap((s) => expandCustomRotationSeqToken(s.trim()))
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

const LAB_ROTATION_DND_MIME = 'application/x-odyssey-lab-rotation-index'
const LAB_ROTATION_FILLER_DND_MIME = 'application/x-odyssey-lab-rotation-filler-index'

export function DpsLabPage() {
  const location = useLocation()
  const { user, supabase, profileDisplayName } = useAuth()
  const { search } = location
  const params = useMemo(() => new URLSearchParams(search), [search])
  const digimonId = params.get('digimonId')?.trim() ?? ''
  const initialLevel = Math.max(1, Math.min(SKILL_LEVEL_CAP, toInt(params.get('level'), 25)))
  const initialDigimonLevel = clampDigimonIntLevel(
    toInt(params.get('digimonLevel'), DIGIMON_INT_LEVEL_CAP),
  )
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
  const [digimonLevel, setDigimonLevel] = useState(initialDigimonLevel)
  const wikiBaseIntRef = useRef(0)
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
  const [sim, setSim] = useState<RotationResult | null>(null)
  const [simBusy, setSimBusy] = useState(false)
  const [simSlowHint, setSimSlowHint] = useState(false)
  const [expandedTimelineIdx, setExpandedTimelineIdx] = useState<number | null>(null)
  /** Icon strip above the table; off by default. */
  const [timelineIconsExpanded, setTimelineIconsExpanded] = useState(false)
  const [shareStatus, setShareStatus] = useState<string | null>(null)
  const [submitBusy, setSubmitBusy] = useState(false)
  type RotationSubmitToast =
    | { kind: 'prompt'; compare: TierSubmissionRotationCompare }
    | { kind: 'success'; message: string }
    | { kind: 'error'; message: string }
  const [rotationSubmitToast, setRotationSubmitToast] = useState<RotationSubmitToast | null>(null)
  const [compareBusy, setCompareBusy] = useState(false)
  /** Set when tier-rules compare finishes but custom does not beat auto (no toast). */
  const [tierSubmitBlockReason, setTierSubmitBlockReason] = useState<string | null>(null)
  const dismissedRotationKeyRef = useRef<string | null>(null)
  const tierCompareGenRef = useRef(0)
  const suppressTierCompareRef = useRef(false)
  const [labApprovedRotation, setLabApprovedRotation] = useState<CommunityRotation | null>(null)
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
  useEffect(() => {
    setExpandedTimelineIdx(null)
    setTimelineIconsExpanded(false)
  }, [sim])
  const gearAttack = useMemo(() => getGearAttackContribution(), [gearStorageRevision])
  const equipmentBonuses = useMemo(() => getGearEquipmentCombatBonuses(readGearState()), [gearStorageRevision])
  const accessoryBonuses = useMemo(() => aggregateAccessoryCombatBonuses(readGearState()), [gearStorageRevision])
  const wikiBaseForSeals = useMemo<WikiCombatBaseForSeals>(
    () => ({
      hp: Math.max(0, Math.floor(data?.stats?.hp ?? 0)),
      attack: Math.max(0, Math.floor(data?.attack ?? data?.stats?.attack ?? 0)),
      defense: Math.max(0, Math.floor(data?.stats?.defense ?? 0)),
      crit_rate: Math.max(0, Math.floor(data?.stats?.crit_rate ?? 0)),
      block_rate: Math.max(0, Math.floor(data?.stats?.block_rate ?? 0)),
      evasion: Math.max(0, Math.floor(data?.stats?.evasion ?? 0)),
    }),
    [data],
  )
  const sealBonuses = useMemo(
    () => resolveSealStatBonuses(readGearState().seals, wikiBaseForSeals),
    [gearStorageRevision, wikiBaseForSeals],
  )

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
    setDigimonLevel(initialDigimonLevel)
  }, [initialDigimonLevel])

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
  }, [search])

  useEffect(() => {
    setPortraitBroken(false)
  }, [digimonId])

  useEffect(() => {
    if (!data?.stats) {
      setCombatStats(null)
      return
    }
    wikiBaseIntRef.current = wikiBaseIntFromStats(data.stats)
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
      int: effectiveIntAtDigimonLevel(wikiBaseIntRef.current, digimonLevel),
    })
  }, [data, sealBonuses, digimonLevel])

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

  /** Wiki-valid skill ids only — tier submit compare ignores Lab gear / edited combat stats. */
  const tierSubmissionSkillIds = useMemo(
    () => customRotationValidRows.map((r) => r.skillId),
    [customRotationValidRows],
  )
  const tierSubmissionFillerIds = useMemo(
    () => customRotationFillerValidRows.map((r) => r.skillId),
    [customRotationFillerValidRows],
  )

  /** Special modifiers from Lab — used for submit compare (wiki stats only, no gear). */
  const tierSubmissionModifiers = useMemo(
    () => tierSubmissionModifiersFromLab(forceAutoCrit, perfectAtClone, useAutoAnimCancel),
    [forceAutoCrit, perfectAtClone, useAutoAnimCancel],
  )

  const customRotationOptionIds = useMemo(
    () => new Set(customRotationSkillOptions.map((o) => o.id)),
    [customRotationSkillOptions],
  )

  useEffect(() => {
    if (!supabase || !digimonId) {
      setLabApprovedRotation(null)
      return
    }
    let cancelled = false
    void fetchBestApprovedRotation(supabase, digimonId, tierSubmissionModifiers).then((row) => {
      if (!cancelled) setLabApprovedRotation(row)
    })
    return () => {
      cancelled = true
    }
  }, [supabase, digimonId, tierSubmissionModifiers])

  const labCommunityRotation = useMemo(
    () => (communityRotationUsableInLab(labApprovedRotation) ? labApprovedRotation : null),
    [labApprovedRotation],
  )

  const communityRotationRows = useMemo(
    () =>
      labCommunityRotation
        ? labRotationRowsFromSkillIds(labCommunityRotation.skill_ids, customRotationOptionIds)
        : [],
    [labCommunityRotation, customRotationOptionIds],
  )

  const communityFillerRows = useMemo(
    () =>
      labCommunityRotation
        ? labRotationRowsFromSkillIds(labCommunityRotation.filler_ids, customRotationOptionIds)
        : [],
    [labCommunityRotation, customRotationOptionIds],
  )

  const useCommunityRotationInAuto =
    rotationMode === 'auto' && labCommunityRotation != null && communityRotationRows.length > 0

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
              customRotation:
                rotationMode === 'custom'
                  ? customRotationValidRows
                  : useCommunityRotationInAuto
                    ? communityRotationRows
                    : undefined,
              manualSupportOnly: rotationMode === 'custom' || useCommunityRotationInAuto,
              customRotationFullCycles:
                rotationMode === 'custom'
                  ? customRotationFullCycles === 0
                    ? 0
                    : clampCustomRotationFullCycles(customRotationFullCycles)
                  : useCommunityRotationInAuto
                    ? 0
                    : undefined,
              customRotationFiller:
                rotationMode === 'custom' && customRotationFillerValidRows.length > 0
                  ? customRotationFillerValidRows
                  : useCommunityRotationInAuto && communityFillerRows.length > 0
                    ? communityFillerRows
                    : undefined,
              attackerAttribute: data.attribute ?? '',
              attackerElement: data.element ?? '',
              targetEnemyAttribute: targetEnemyAttribute.trim() || undefined,
              applySavedGearTrueVice: true,
              applySavedGearAccessories: true,
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
    combatStats?.int,
    digimonLevel,
    combatStats?.atk_speed,
    combatStats?.crit_rate,
    useAutoAnimCancel,
    animCancelReactionMs,
    forceAutoCrit,
    perfectAtClone,
    rotationMode,
    customRotationValidRows,
    customRotationFullCycles,
    customRotationFillerValidRows,
    useCommunityRotationInAuto,
    communityRotationRows,
    communityFillerRows,
    targetEnemyAttribute,
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
      readGearState(),
    )
  }, [data, targetEnemyAttribute])

  const labAttrSkillDamageMult = useMemo(
    () =>
      attributeAdvantageSkillDamageMultiplierWithFoldedTrueVice(
        data?.attribute,
        targetEnemyAttribute,
        labTrueViceFrac.attribute,
      ),
    [data?.attribute, targetEnemyAttribute, labTrueViceFrac.attribute],
  )

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
      hp: equipmentBonuses.hp,
      ds: equipmentBonuses.ds,
      attack: gearAttack.totalAttack,
      defense: equipmentBonuses.defense,
      crit_rate: 0,
      atk_speed: 0,
      evasion: equipmentBonuses.evasion + accessoryBonuses.evasionPct,
      hit_rate: accessoryBonuses.hitRatePct,
      block_rate: accessoryBonuses.blockPct,
      dex: 0,
      int: 0,
    }),
    [gearAttack.totalAttack, equipmentBonuses, accessoryBonuses],
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
    next.set('digimonLevel', String(digimonLevel))
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
    return `${resolveAppSiteOrigin()}#/lab?${next.toString()}`
  }, [
    digimonId,
    globalLevel,
    digimonLevel,
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

  const rotationCompareKey = useMemo(() => {
    if (rotationMode !== 'custom' || tierSubmissionSkillIds.length === 0 || !digimonId) return ''
    return JSON.stringify({
      digimonId,
      ids: tierSubmissionSkillIds,
      filler: tierSubmissionFillerIds,
      cycles: customRotationFullCycles,
      mods: tierSubmissionModifiers,
    })
  }, [
    rotationMode,
    digimonId,
    tierSubmissionSkillIds,
    tierSubmissionFillerIds,
    customRotationFullCycles,
    tierSubmissionModifiers,
  ])

  useEffect(() => {
    suppressTierCompareRef.current = false
  }, [rotationCompareKey])

  useEffect(() => {
    if (rotationMode !== 'custom' || !data || tierSubmissionSkillIds.length === 0 || simBusy) {
      if (rotationMode !== 'custom') {
        setRotationSubmitToast(null)
        setTierSubmitBlockReason(null)
      }
      return
    }
    if (!sim) return
    if (suppressTierCompareRef.current) return
    const key = rotationCompareKey
    if (!key || key === dismissedRotationKeyRef.current || isRotationSubmittedLocally(key)) {
      setRotationSubmitToast(null)
      if (isRotationSubmittedLocally(key)) {
        setTierSubmitBlockReason(null)
      }
      return
    }

    let cancelled = false
    const gen = ++tierCompareGenRef.current
    setCompareBusy(true)

    void (async () => {
      try {
        const result = compareTierSubmissionRotations(
          data,
          tierSubmissionSkillIds,
          tierSubmissionFillerIds,
          tierSubmissionModifiers,
        )
        if (cancelled || gen !== tierCompareGenRef.current || suppressTierCompareRef.current) return

        if (!result.isBetter) {
          setRotationSubmitToast(null)
          if (!result.hitDurationCap) {
            setTierSubmitBlockReason(
              'Current rotation does not run the full 180s window required for tier submit.',
            )
          } else {
            setTierSubmitBlockReason(
              'Current rotation is not better than Auto. A 180s rotation that is better than auto may be submitted for the tier list.',
            )
          }
          return
        }

        let skipPrompt = false
        if (supabase && digimonId) {
          const approved = await fetchBestApprovedRotation(
            supabase,
            digimonId,
            tierSubmissionModifiers,
          )
          if (cancelled || gen !== tierCompareGenRef.current || suppressTierCompareRef.current) return
          if (approved) {
            if (
              communityRotationMatchesLabSubmission(
                approved,
                tierSubmissionSkillIds,
                tierSubmissionFillerIds,
                tierSubmissionModifiers,
              ) ||
              tierSubmissionAlreadyCovered(approved.comparable_dps, result.customDps)
            ) {
              skipPrompt = true
              markRotationSubmitted(key)
            }
          }
        }

        if (skipPrompt) {
          setRotationSubmitToast(null)
          setTierSubmitBlockReason(null)
          return
        }

        setTierSubmitBlockReason(null)
        setRotationSubmitToast({ kind: 'prompt', compare: result })
      } finally {
        if (!cancelled && gen === tierCompareGenRef.current) setCompareBusy(false)
      }
    })()

    return () => {
      cancelled = true
      setCompareBusy(false)
    }
  }, [
    rotationMode,
    data,
    tierSubmissionSkillIds,
    tierSubmissionFillerIds,
    tierSubmissionModifiers,
    simBusy,
    sim,
    rotationCompareKey,
    supabase,
    digimonId,
  ])

  const dismissRotationSubmitToast = useCallback(() => {
    dismissedRotationKeyRef.current = rotationCompareKey
    setRotationSubmitToast(null)
  }, [rotationCompareKey])

  const onSubmitRotation = useCallback(async () => {
    if (!data || !supabase || !user || rotationSubmitToast?.kind !== 'prompt') return

    setSubmitBusy(true)
    tierCompareGenRef.current += 1
    suppressTierCompareRef.current = true

    const compare = compareTierSubmissionRotations(
      data,
      tierSubmissionSkillIds,
      tierSubmissionFillerIds,
      tierSubmissionModifiers,
    )
    if (!compare.isBetter) {
      setSubmitBusy(false)
      setRotationSubmitToast({
        kind: 'error',
        message: 'This rotation no longer beats auto under tier rules. Try simulating again.',
      })
      return
    }

    const authorName =
      profileDisplayName?.trim() || user.email?.split('@')[0] || 'Player'

    const result = await submitCommunityRotation(supabase, user.id, {
      digimonId: digimonId,
      authorName,
      skillIds: tierSubmissionSkillIds,
      fillerIds: tierSubmissionFillerIds,
      fullCycles: 0,
      comparableDps: compare.customDps,
      simRevision: TIER_DPS_SIM_REVISION,
      modifiers: tierSubmissionModifiers,
    })

    setSubmitBusy(false)

    if (result.status === 'submitted') {
      dismissedRotationKeyRef.current = rotationCompareKey
      markRotationSubmitted(rotationCompareKey)
      const approved = await fetchBestApprovedRotation(supabase, digimonId, tierSubmissionModifiers)
      setLabApprovedRotation(approved)
      const cacheResult = await refreshTierListDigimonInCache(supabase, digimonId)
      let message = `Rotation submitted (${compare.customDps.toFixed(1)} DPS at tier rules).`
      if (cacheResult.status === 'updated') {
        message += ' Local tier list cache updated — open Tier list to see the ★ and new DPS.'
      } else if (cacheResult.status === 'no-cache') {
        message += ' Open Tier list and run Update tier list to apply it everywhere.'
      } else if (cacheResult.status === 'error') {
        message += ` Run Update tier list to refresh (${cacheResult.message}).`
      }
      setRotationSubmitToast({ kind: 'success', message })
      window.setTimeout(() => setRotationSubmitToast(null), 7000)
    } else if (result.status === 'not_better') {
      setRotationSubmitToast({
        kind: 'error',
        message: `Not saved — another approved rotation for this Digimon already has higher DPS at these modifiers (${compare.customDps.toFixed(1)} vs existing best).`,
      })
    } else {
      setRotationSubmitToast({
        kind: 'error',
        message: formatCommunityRotationError(result.message),
      })
    }
  }, [
    rotationSubmitToast,
    tierSubmissionFillerIds,
    tierSubmissionSkillIds,
    tierSubmissionModifiers,
    data,
    digimonId,
    profileDisplayName,
    rotationCompareKey,
    supabase,
    user,
  ])

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
                  Digimon level
                  <EditableNumberInput
                    min={1}
                    max={DIGIMON_INT_LEVEL_CAP}
                    integer
                    emptyValue={DIGIMON_INT_LEVEL_CAP}
                    value={digimonLevel}
                    onCommit={(v) => setDigimonLevel(clampDigimonIntLevel(v))}
                  />
                </label>
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
              {data && labTrueViceFrac.element > 1e-9 ? (
                <p className="lab-enemy-element-active-hint" role="status">
                  True Vice <strong>element</strong> % from saved gear applies: your digimon&apos;s element matches
                  your True Vice element rolls (enemy element is not used).
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
                    {labCommunityRotation ? (
                      <span
                        className="tier-community-badge lab-rotation-mode-community-badge"
                        title={`Tier rotation by ${labCommunityRotation.author_name}`}
                        aria-hidden
                      >
                        ★
                      </span>
                    ) : null}
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
              {rotationMode === 'auto' && labCommunityRotation && communityRotationRows.length > 0 ? (
                <div className="lab-community-rotation-card">
                  <p className="lab-community-rotation-card-title">
                    <span
                      className="tier-community-badge"
                      title={`Community rotation by ${labCommunityRotation.author_name}`}
                    >
                      ★
                    </span>
                    Tier rotation by <strong>{labCommunityRotation.author_name}</strong>
                  </p>
                  {communityFillerRows.length > 0 ? (
                    <div className="lab-rotation-timeline-wrap">
                      <p className="lab-rotation-timeline-label">Gap priority</p>
                      <div
                        className="lab-rotation-timeline lab-rotation-timeline--readonly"
                        aria-label="Tier rotation gap priority"
                      >
                        {communityFillerRows.map((row, idx) => {
                          const meta = skillByIdForLab.get(row.skillId)
                          const icon = skillIconUrl(meta?.icon_id ?? '')
                          const label =
                            meta?.name ??
                            (data?.skills ?? []).find((s) => s.id === row.skillId)?.name ??
                            row.skillId
                          return (
                            <div key={`filler-${row.skillId}-${idx}`} className="lab-rotation-tile" title={label}>
                              {icon ? (
                                <img src={icon} alt="" className="lab-rotation-tile-icon" />
                              ) : (
                                <span className="lab-rotation-tile-icon-fallback" aria-hidden>
                                  {row.skillId === 'auto-attack' ? 'A' : label.slice(0, 2)}
                                </span>
                              )}
                              <span className="lab-rotation-tile-name">{label}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : rotationMode === 'auto' ? (
                <p className="lab-community-rotation-fallback muted">
                  No tier rotation for this Digimon at these special modifiers — using wiki optimal auto.
                </p>
              ) : null}
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
                full description values. Role skills use a 0.2s cast; kit supports stay instant (0s). Hybrid: one
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
                  {rotationMode === 'custom'
                    ? 'Custom rotation simulation'
                    : useCommunityRotationInAuto && labCommunityRotation
                      ? `Tier rotation by ${labCommunityRotation.author_name}`
                      : 'Optimal rotation simulation'}
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
                {(gearAttack.totalAttack > 0 ||
                  accessoryBonuses.attackPct > 0 ||
                  accessoryBonuses.skillPct > 0 ||
                  accessoryBonuses.skillFlat > 0) && (
                  <p className="muted lab-sim-summary-note">
                    {gearAttack.totalAttack > 0 ? (
                      <>
                        Gear ATK applied: +{gearAttack.totalAttack.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                        {' ('}
                        {[
                          gearAttack.leftWeightedAttack > 0
                            ? `left +${gearAttack.leftWeightedAttack.toLocaleString(undefined, { maximumFractionDigits: 1 })} @ 60%`
                            : null,
                          gearAttack.gogglesAllStatAttack > 0
                            ? `goggles +${gearAttack.gogglesAllStatAttack.toLocaleString()} @ 100%`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(', ')}
                        ).
                      </>
                    ) : null}
                    {accessoryBonuses.attackPct > 0 ||
                    accessoryBonuses.skillPct > 0 ||
                    accessoryBonuses.skillFlat > 0 ||
                    accessoryBonuses.critDamagePct > 0 ? (
                      <>
                        {gearAttack.totalAttack > 0 ? ' ' : ''}
                        Accessory rolls:{' '}
                        {[
                          accessoryBonuses.attackPct > 0
                            ? `+${accessoryBonuses.attackPct}% ATK`
                            : null,
                          accessoryBonuses.skillPct > 0
                            ? `+${accessoryBonuses.skillPct}% skill`
                            : null,
                          accessoryBonuses.skillFlat > 0
                            ? `+${accessoryBonuses.skillFlat} skill flat`
                            : null,
                          accessoryBonuses.critDamagePct > 0
                            ? `+${accessoryBonuses.critDamagePct}% crit dmg`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(', ')}
                        .
                      </>
                    ) : null}
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

          {sim && sim.events.length > 0 && (
            <section
              className={`lab-result lab-timeline-section${timelineIconsExpanded ? ' lab-timeline-section--icons-visible' : ''}`}
            >
              <div className="lab-timeline-header">
                <h3>Rotation timeline</h3>
                <button
                  type="button"
                  className="lab-timeline-view-toggle"
                  onClick={() => setTimelineIconsExpanded((open) => !open)}
                  aria-expanded={timelineIconsExpanded}
                >
                  {timelineIconsExpanded ? 'Hide skill rotation' : 'Show skill rotation'}
                </button>
              </div>
              <p className="muted timeline-buff-hint">
                Click a damage or auto row for the damage formula; hover the buff % for buff sources.
                {timelineIconsExpanded ? ' Skill rotation shows cast order at a glance.' : ''}
              </p>
              {timelineIconsExpanded ? (
                <div className="timeline-sequence" aria-label="Sequential skill icon order">
                  {sim.events.map((e, idx) => {
                    const icon = skillIconUrl(e.iconId)
                    const expandable = e.damageBreakdown != null
                    const seqExpanded = expandedTimelineIdx === idx
                    return (
                      <span key={`seq-${e.skillId}-${idx}`} className="timeline-seq-node">
                        <span
                          className={
                            e.eventType === 'support'
                              ? 'timeline-seq-item timeline-seq-support'
                              : expandable && seqExpanded
                                ? 'timeline-seq-item timeline-seq-item--expanded'
                                : e.buffedBy.length > 0
                                  ? 'timeline-seq-item timeline-seq-buffed'
                                  : expandable
                                    ? 'timeline-seq-item timeline-seq-expandable'
                                    : 'timeline-seq-item'
                          }
                          title={`${e.atSec.toFixed(1)}s · ${e.skillName}${expandable ? ' · click for damage breakdown' : ''}`}
                          role={expandable ? 'button' : undefined}
                          tabIndex={expandable ? 0 : undefined}
                          aria-expanded={expandable ? seqExpanded : undefined}
                          onClick={
                            expandable
                              ? () => setExpandedTimelineIdx((cur) => (cur === idx ? null : idx))
                              : undefined
                          }
                          onKeyDown={
                            expandable
                              ? (ev) => {
                                  if (ev.key === 'Enter' || ev.key === ' ') {
                                    ev.preventDefault()
                                    setExpandedTimelineIdx((cur) => (cur === idx ? null : idx))
                                  }
                                }
                              : undefined
                          }
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
              ) : null}
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
                    {sim.events.map((e, idx) => {
                      const hasBreakdown = e.damageBreakdown != null
                      const rowExpanded = expandedTimelineIdx === idx
                      const rowClass =
                        e.eventType === 'support'
                          ? 'lab-row-support'
                          : e.cancelledFromAuto
                            ? 'lab-row-cancel-sub'
                            : e.buffedBy.length > 0
                              ? 'lab-row-buffed'
                              : undefined
                      return (
                        <Fragment key={`tl-${e.skillId}-${idx}`}>
                          <tr
                            className={
                              hasBreakdown
                                ? [rowClass, 'lab-row-expandable', rowExpanded ? 'lab-row-expanded' : '']
                                    .filter(Boolean)
                                    .join(' ')
                                : rowClass
                            }
                            onClick={
                              hasBreakdown
                                ? () =>
                                    setExpandedTimelineIdx((cur) => (cur === idx ? null : idx))
                                : undefined
                            }
                            tabIndex={hasBreakdown ? 0 : undefined}
                            role={hasBreakdown ? 'button' : undefined}
                            aria-expanded={hasBreakdown ? rowExpanded : undefined}
                            onKeyDown={
                              hasBreakdown
                                ? (ev) => {
                                    if (ev.key === 'Enter' || ev.key === ' ') {
                                      ev.preventDefault()
                                      setExpandedTimelineIdx((cur) => (cur === idx ? null : idx))
                                    }
                                  }
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
                            <td>
                              {e.castTimeSec.toFixed(1)}s
                              {e.eventType === 'support' && e.cooldownSecAfterCast != null ? (
                                <span className="lab-support-cd muted">
                                  {' '}
                                  → {e.cooldownSecAfterCast.toFixed(1)}s CD
                                </span>
                              ) : null}
                            </td>
                            <td>{e.damage.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                            <td>
                              {e.cumulativeDamage.toLocaleString(undefined, {
                                maximumFractionDigits: 0,
                              })}
                            </td>
                          </tr>
                          {hasBreakdown && rowExpanded && e.damageBreakdown ? (
                            <tr key={`detail-${e.skillId}-${idx}`} className="lab-row-detail">
                              <td colSpan={5}>
                                <TimelineDamageBreakdownPanel b={e.damageBreakdown} />
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      )
                    })}
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

      {rotationSubmitToast ? (
        <div
          className={`lab-rotation-toast lab-rotation-toast--${rotationSubmitToast.kind}`}
          role={rotationSubmitToast.kind === 'prompt' ? 'dialog' : 'status'}
          aria-labelledby="lab-rotation-toast-title"
          aria-live="polite"
        >
          {rotationSubmitToast.kind === 'prompt' ? (
            <>
              <p id="lab-rotation-toast-title" className="lab-rotation-toast-title">
                Detected a better rotation, would you like to submit this?
              </p>
          <p className="lab-rotation-toast-detail">
                Custom <strong>{rotationSubmitToast.compare.customDps.toFixed(1)}</strong> DPS vs auto{' '}
                <strong>{rotationSubmitToast.compare.autoDps.toFixed(1)}</strong> DPS
          </p>
          <div className="lab-rotation-toast-actions">
            {user && supabase ? (
              <button
                type="button"
                className="lab-rotation-toast-submit"
                onClick={() => void onSubmitRotation()}
                disabled={submitBusy}
              >
                {submitBusy ? 'Submitting…' : 'Submit rotation'}
              </button>
            ) : (
              <Link
                to={`/auth?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
                className="lab-rotation-toast-submit"
              >
                Sign in to submit
              </Link>
            )}
            <button
              type="button"
              className="lab-rotation-toast-dismiss"
              onClick={dismissRotationSubmitToast}
              disabled={submitBusy}
            >
              Not now
            </button>
              </div>
            </>
          ) : (
            <>
              <p id="lab-rotation-toast-title" className="lab-rotation-toast-title">
                {rotationSubmitToast.kind === 'success' ? 'Rotation submitted' : 'Could not submit'}
              </p>
              <p className="lab-rotation-toast-detail">{rotationSubmitToast.message}</p>
              <div className="lab-rotation-toast-actions">
                <button
                  type="button"
                  className="lab-rotation-toast-dismiss"
                  onClick={() => setRotationSubmitToast(null)}
                >
                  Dismiss
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
      {rotationMode === 'custom' && compareBusy && rotationSubmitToast?.kind !== 'prompt' ? (
        <p className="lab-rotation-compare-hint muted" role="status">
          Checking vs tier auto rotation (180s, wiki stats)…
        </p>
      ) : null}
      {rotationMode === 'custom' && tierSubmitBlockReason && rotationSubmitToast?.kind !== 'prompt' ? (
        <p className="lab-rotation-compare-hint lab-rotation-compare-hint--block muted" role="status">
          {tierSubmitBlockReason}
        </p>
      ) : null}
    </div>
  )
}
