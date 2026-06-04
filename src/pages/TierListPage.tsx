import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchApprovedRotations, type CommunityRotation } from '../lib/communityRotations'
import { useAuth } from '../auth/useAuth'
import { fetchDigimonDetail } from '../api/digimonService'
import { EnemyAttributeTargetField } from '../components/EnemyAttributeTargetField'
import { TierDpsModifiersControls } from './tierList/TierDpsModifiersControls'
import {
  adjustDpsRotationCategoryScoresForAttributeTarget,
  adjustRotationDpsForAttributeTarget,
} from '../lib/attributeAdvantage'
import { computeDpsAoeCategoryScores } from '../lib/aoeTierScore'
import { BURST_DPS_WINDOW_SEC } from '../lib/dpsTierScore'
import {
  clampTierFightDurationSec,
  TIER_FIGHT_DURATION_DEFAULT_SEC,
} from '../lib/tierFightDurationScale'
import { resimTierEntrySustainedAtFightDuration } from '../lib/tierListFightDurationResim'
import {
  buildFightResimCacheRevision,
  buildFightResimParamKey,
  clearTierFightDurationResimCacheStorage,
  communityRotationsMapFingerprint,
  readTierFightDurationResimCacheRoot,
  writeTierFightDurationResimCacheRoot,
  type TierFightResimCacheRootV1,
} from '../lib/tierListFightDurationResimCacheStorage'
import {
  DEFAULT_ROTATION_SIM_DURATION_SEC,
  simulateRotation,
  TIER_DPS_SIM_REVISION,
} from '../lib/dpsSim'
import { buildComparableRotationConfig } from '../lib/rotationComparable'
import { computeHealerTierScore } from '../lib/healerTierScore'
import { computeTankTierScore } from '../lib/tankTierScore'
import {
  contentStatusLabel,
  getDigimonContentStatus,
  type DigimonContentStatus,
} from '../lib/contentStatus'
import {
  buildTierGroups,
  createEmptyTierListCache,
  DPS_TIER_CATEGORY_ORDER,
  DPS_TIER_MATRIX_COLUMN_LABELS,
  loadTierListCache,
  saveTierListCache,
  tierEntryDpsCategoryScoresComplete,
  tierEntryNeedsAnimationCancelScores,
  tierEntryNeedsAutoCritScores,
  tierEntryNeedsPerfectAtCloneScores,
  tierEntryNeedsDpsSimRefresh,
  formatAoeTierMatrixCell,
  TIER_SUPPORT_SCORE_REVISION,
  type BuildTierGroupsOptions,
  type DpsRotationCategoryScores,
  type DpsTierCategoryKey,
  type TierApiSnapshot,
  type SustainedDpsEntry,
  type TierListCache,
  type TierListMode,
} from '../lib/tierList'
import { digimonPortraitUrl } from '../lib/digimonImage'
import { digimonStageBorderColor, digimonStageTierFilterStyle } from '../lib/digimonStage'
import { tierSkillsSignature } from '../lib/tierSkillsSignature'
import {
  WIKI_ATTRIBUTE_OPTIONS,
  WIKI_ELEMENT_OPTIONS,
  WIKI_FAMILY_OPTIONS,
} from '../lib/wikiListFacetOptions'
import type { WikiDigimonDetail, WikiDigimonListItem } from '../types/wikiApi'
import { fetchPublishedTierListSnapshot } from '../lib/tierListPublished'
import {
  appendTierChangeHistory,
  buildTierListUpdateSummary,
  fetchAllDigimonIndex,
  formatTierStatus,
  labHrefForTierEntry,
  levelMapForSkills,
  loadTierUpdateSummaryFromStorage,
  RATE_LIMIT_COOLDOWN_MS,
  readDpsTierCategory,
  readDpsAutoAnimCancel,
  readDpsForceAutoCrit,
  readDpsPerfectAtClone,
  readTierFightDurationSec,
  readTierDpsTargetEnemyAttribute,
  readTierIgnoreIncomplete,
  readTierListMode,
  readTierUpdatePanelMinimized,
  REQUEST_DELAY_MS,
  saveTierUpdateSummaryToStorage,
  sleep,
  writeDpsTierCategory,
  writeDpsAutoAnimCancel,
  writeDpsForceAutoCrit,
  writeDpsPerfectAtClone,
  writeTierFightDurationSec,
  writeTierDpsTargetEnemyAttribute,
  writeTierIgnoreIncomplete,
  writeTierListMode,
  writeTierUpdatePanelMinimized,
  type TierChangeCause,
  type TierListChangeHistoryRow,
  type TierListUpdateSummary,
  type TierListUpdateSummaryTabKey,
} from './tierList/tierListModel'

/** After this many ms on one Digimon, append a reassurance line (heavy DPS sims can block the UI). */
const TIER_UPDATE_SLOW_HINT_MS = 5_000

/** Matrix fight-length resims run after the slider stops moving for this long (keeps dragging smooth). */
const TIER_FIGHT_DURATION_MATRIX_DEBOUNCE_MS = 400

type TierRefreshCauseFlags = {
  api: boolean
  tier: boolean
  other: boolean
}

function collapseTierRefreshCause(cause?: TierRefreshCauseFlags): TierChangeCause {
  if (!cause) return 'tier'
  if (cause.api) return 'api'
  return 'tier'
}

function buildTierApiSnapshot(detail: WikiDigimonDetail): TierApiSnapshot {
  return {
    id: detail.id,
    name: detail.name,
    role: detail.role,
    attribute: detail.attribute,
    element: detail.element,
    rank: detail.rank,
    hp: detail.hp,
    attack: detail.attack,
    stats: {
      hp: detail.stats?.hp ?? 0,
      ds: detail.stats?.ds ?? 0,
      attack: detail.stats?.attack ?? 0,
      defense: detail.stats?.defense ?? 0,
      crit_rate: detail.stats?.crit_rate ?? 0,
      atk_speed: detail.stats?.atk_speed ?? 0,
      evasion: detail.stats?.evasion ?? 0,
      hit_rate: detail.stats?.hit_rate ?? 0,
      block_rate: detail.stats?.block_rate ?? 0,
      dex: detail.stats?.dex ?? 0,
      int: detail.stats?.int ?? 0,
    },
    skills: (detail.skills ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      base_dmg: s.base_dmg,
      scaling: s.scaling,
      cast_time_sec: s.cast_time_sec,
      cooldown_sec: s.cooldown_sec,
      ds_cost: s.ds_cost,
      radius: s.radius,
      description: s.description,
      buff_name: s.buff?.name,
      buff_description: s.buff?.description,
      buff_duration: s.buff?.duration,
    })),
  }
}

function diffTierApiSnapshot(prev: TierApiSnapshot | undefined, next: TierApiSnapshot): string[] {
  if (!prev) return []
  const lines: string[] = []
  const push = (line: string) => {
    if (lines.length < 20) lines.push(line)
  }
  /** Normalize whitespace only — tier change history must keep full strings so the Changes page can expand clamps. */
  const normText = (v?: string) => (v ?? '').replace(/\s+/g, ' ').trim()
  const cmpNum = (label: string, a: number, b: number) => {
    if (a !== b) push(`${label}: ${a} -> ${b}`)
  }
  const cmpText = (label: string, a?: string, b?: string) => {
    if (normText(a) !== normText(b)) push(`${label}: "${normText(a)}" -> "${normText(b)}"`)
  }

  cmpText('Role', prev.role, next.role)
  cmpText('Attribute', prev.attribute, next.attribute)
  cmpText('Element', prev.element, next.element)
  cmpNum('Rank', prev.rank, next.rank)
  cmpNum('HP', prev.hp, next.hp)
  cmpNum('Attack', prev.attack, next.attack)
  for (const key of Object.keys(prev.stats) as Array<keyof TierApiSnapshot['stats']>) {
    // Avoid duplicating HP / Attack: same fields are already compared above.
    if (key === 'hp' || key === 'attack') continue
    cmpNum(`Stats.${key}`, prev.stats[key], next.stats[key])
  }

  const prevSkills = new Map(prev.skills.map((s) => [s.id, s] as const))
  const nextSkills = new Map(next.skills.map((s) => [s.id, s] as const))
  for (const [id, ns] of nextSkills.entries()) {
    const ps = prevSkills.get(id)
    if (!ps) {
      push(`Skill added: ${ns.name}`)
      continue
    }
    cmpText(`Skill ${ns.name} name`, ps.name, ns.name)
    cmpNum(`Skill ${ns.name} base_dmg`, ps.base_dmg, ns.base_dmg)
    cmpNum(`Skill ${ns.name} scaling`, ps.scaling, ns.scaling)
    cmpNum(`Skill ${ns.name} cast_time`, ps.cast_time_sec, ns.cast_time_sec)
    cmpNum(`Skill ${ns.name} cooldown`, ps.cooldown_sec, ns.cooldown_sec)
    cmpNum(`Skill ${ns.name} ds_cost`, ps.ds_cost, ns.ds_cost)
    cmpNum(`Skill ${ns.name} radius`, ps.radius ?? 0, ns.radius ?? 0)
    cmpText(`Skill ${ns.name} description`, ps.description, ns.description)
    cmpText(`Skill ${ns.name} buff name`, ps.buff_name, ns.buff_name)
    cmpText(`Skill ${ns.name} buff description`, ps.buff_description, ns.buff_description)
    cmpNum(`Skill ${ns.name} buff duration`, ps.buff_duration ?? 0, ns.buff_duration ?? 0)
  }
  for (const [id, ps] of prevSkills.entries()) {
    if (!nextSkills.has(id)) push(`Skill removed: ${ps.name}`)
  }
  return lines
}

const WIKI_ATTR_STRINGS = WIKI_ATTRIBUTE_OPTIONS as readonly string[]
const WIKI_EL_STRINGS = WIKI_ELEMENT_OPTIONS as readonly string[]
const WIKI_FAMILY_STRINGS = WIKI_FAMILY_OPTIONS as readonly string[]

function tierEntryWithAttributeTarget(
  e: SustainedDpsEntry,
  targetAttr: string,
  attackerAttr: string | undefined,
): SustainedDpsEntry {
  const adj = (s?: DpsRotationCategoryScores) =>
    adjustDpsRotationCategoryScoresForAttributeTarget(s, attackerAttr, targetAttr) ?? s
  const base = e.dpsCategoryScores
  const adjBase = adj(base)
  return {
    ...e,
    dps:
      adjBase?.sustained ??
      adjustRotationDpsForAttributeTarget(e.dps, base?.sustainedAutoDps, attackerAttr, targetAttr),
    dpsCategoryScores: adjBase ?? base,
    dpsCategoryScoresAutoCrit: adj(e.dpsCategoryScoresAutoCrit) ?? e.dpsCategoryScoresAutoCrit,
    dpsCategoryScoresPerfectAtClone:
      adj(e.dpsCategoryScoresPerfectAtClone) ?? e.dpsCategoryScoresPerfectAtClone,
    dpsCategoryScoresPerfectAtCloneAutoCrit:
      adj(e.dpsCategoryScoresPerfectAtCloneAutoCrit) ?? e.dpsCategoryScoresPerfectAtCloneAutoCrit,
    dpsCategoryScoresAnimationCancel:
      adj(e.dpsCategoryScoresAnimationCancel) ?? e.dpsCategoryScoresAnimationCancel,
    dpsCategoryScoresAnimationCancelAutoCrit:
      adj(e.dpsCategoryScoresAnimationCancelAutoCrit) ?? e.dpsCategoryScoresAnimationCancelAutoCrit,
    dpsCategoryScoresPerfectAtCloneAnimationCancel:
      adj(e.dpsCategoryScoresPerfectAtCloneAnimationCancel) ??
      e.dpsCategoryScoresPerfectAtCloneAnimationCancel,
    dpsCategoryScoresPerfectAtCloneAnimationCancelAutoCrit:
      adj(e.dpsCategoryScoresPerfectAtCloneAnimationCancelAutoCrit) ??
      e.dpsCategoryScoresPerfectAtCloneAnimationCancelAutoCrit,
  }
}

function isTierListCacheShape(value: unknown): value is TierListCache {
  if (!value || typeof value !== 'object') return false
  const o = value as Record<string, unknown>
  return (
    typeof o.version === 'number' &&
    typeof o.total === 'number' &&
    Array.isArray(o.queue) &&
    !!o.entries &&
    typeof o.entries === 'object' &&
    !!o.listSignatures &&
    typeof o.listSignatures === 'object'
  )
}

export function TierListPage() {
  const { supabase, user, authReady } = useAuth()
  const [searchParams] = useSearchParams()
  const workerForceRefresh = searchParams.get('forceRefresh') === '1'
  const workerForceRefreshStartedRef = useRef(false)
  const [cache, setCache] = useState<TierListCache | null>(null)
  const [listMeta, setListMeta] = useState<Record<string, WikiDigimonListItem>>({})
  const [initializing, setInitializing] = useState(true)
  const [building, setBuilding] = useState(false)
  const [, setStatus] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [publishedSnapshotAt, setPublishedSnapshotAt] = useState<string | null>(null)
  /** Empty = show all. Otherwise OR-filter by listed values (multi-select). */
  const [selectedStages, setSelectedStages] = useState<string[]>([])
  const [selectedAttributes, setSelectedAttributes] = useState<string[]>([])
  const [selectedElements, setSelectedElements] = useState<string[]>([])
  const [selectedFamilies, setSelectedFamilies] = useState<string[]>([])
  /** Planned queue length for the in-flight tier build (for progress UI; cleared when build ends). */
  const [tierBuildQueueTotal, setTierBuildQueueTotal] = useState<number | null>(null)
  const [updateSummary, setUpdateSummary] = useState<TierListUpdateSummary | null>(
    loadTierUpdateSummaryFromStorage,
  )
  const [updatePanelMinimized, setUpdatePanelMinimized] = useState(readTierUpdatePanelMinimized)
  const [updateSummaryTab, setUpdateSummaryTab] = useState<TierListUpdateSummaryTabKey>('dps')
  const [tierMode, setTierMode] = useState<TierListMode>(readTierListMode)
  const [dpsTierCategory, setDpsTierCategory] = useState<DpsTierCategoryKey>(readDpsTierCategory)
  const [dpsForceAutoCrit, setDpsForceAutoCrit] = useState<boolean>(readDpsForceAutoCrit)
  const [dpsPerfectAtClone, setDpsPerfectAtClone] = useState<boolean>(readDpsPerfectAtClone)
  const [dpsAutoAnimCancel, setDpsAutoAnimCancel] = useState<boolean>(readDpsAutoAnimCancel)
  const initialFightDurationSec = readTierFightDurationSec()
  const [tierFightDurationSec, setTierFightDurationSec] = useState<number>(initialFightDurationSec)
  const [fightDurationAppliedSec, setFightDurationAppliedSec] = useState<number>(initialFightDurationSec)
  const tierFightDurationSliderRef = useRef(initialFightDurationSec)
  tierFightDurationSliderRef.current = clampTierFightDurationSec(tierFightDurationSec)
  /** Sustained fight-length resims keyed by tier revision + sim params (cleared on tier list update). */
  const fightResimCacheRef = useRef<TierFightResimCacheRootV1 | null>(null)
  const [dpsTargetEnemyAttribute, setDpsTargetEnemyAttribute] = useState<string>(() =>
    readTierDpsTargetEnemyAttribute(),
  )
  const [communityRotationsMap, setCommunityRotationsMap] = useState<Map<string, CommunityRotation>>(
    () => new Map(),
  )
  const [ignoreIncomplete, setIgnoreIncomplete] = useState<boolean>(readTierIgnoreIncomplete)

  function setTierModePersist(next: TierListMode) {
    setTierMode(next)
    writeTierListMode(next)
  }

  function setDpsTierCategoryPersist(next: DpsTierCategoryKey) {
    setDpsTierCategory(next)
    writeDpsTierCategory(next)
  }

  function setDpsForceAutoCritPersist(next: boolean) {
    setDpsForceAutoCrit(next)
    writeDpsForceAutoCrit(next)
  }

  function setDpsPerfectAtClonePersist(next: boolean) {
    setDpsPerfectAtClone(next)
    writeDpsPerfectAtClone(next)
  }

  function setDpsAutoAnimCancelPersist(next: boolean) {
    setDpsAutoAnimCancel(next)
    writeDpsAutoAnimCancel(next)
  }

  function setTierFightDurationSecPersist(next: number) {
    setTierFightDurationSec(clampTierFightDurationSec(next))
  }

  function commitFightDurationFromSlider() {
    const v = clampTierFightDurationSec(tierFightDurationSliderRef.current)
    setFightDurationAppliedSec((prev) => {
      if (v === prev) return prev
      writeTierFightDurationSec(v)
      return v
    })
  }

  function setDpsTargetEnemyAttributePersist(next: string) {
    setDpsTargetEnemyAttribute(next)
    writeTierDpsTargetEnemyAttribute(next)
  }

  function setIgnoreIncompletePersist(next: boolean) {
    setIgnoreIncomplete(next)
    writeTierIgnoreIncomplete(next)
  }

  useEffect(() => {
    let cancelled = false
    async function init() {
      setInitializing(true)
      setError(null)
      const existing = loadTierListCache()
      try {
        const published = await fetchPublishedTierListSnapshot()
        const remoteRow = published.snapshot
        if (!published.error && remoteRow && isTierListCacheShape(remoteRow.cache)) {
          const remoteCache = remoteRow.cache as TierListCache
          const remoteAt = new Date(remoteRow.updated_at ?? 0).getTime()
          const localAt = new Date(existing?.lastCheckedAt ?? 0).getTime()
          const localEntryCount = Object.keys(existing?.entries ?? {}).length
          const remoteEntryCount = Object.keys(remoteCache.entries ?? {}).length
          if (!existing || remoteAt > localAt || remoteEntryCount > localEntryCount) {
            saveTierListCache(remoteCache)
            if (!cancelled) {
              setCache(remoteCache)
              setPublishedSnapshotAt(remoteRow.updated_at)
              setStatus('Loaded latest published tier snapshot.')
              setInitializing(false)
            }
            return
          }
          if (!cancelled) setPublishedSnapshotAt(remoteRow.updated_at)
        }
      } catch {
        /* best effort */
      }
      if (existing) {
        if (!cancelled) {
          setCache(existing)
          setStatus('Tier cache loaded from local storage.')
          setInitializing(false)
        }
        return
      }

      try {
        setStatus('Fetching Digimon index…')
        const { all, meta, signatures } = await fetchAllDigimonIndex()
        const ids = all.map((d) => d.id)
        const created = createEmptyTierListCache(ids)
        created.listSignatures = signatures
        saveTierListCache(created)
        if (!cancelled) {
          setListMeta(meta)
          setCache(created)
          setStatus('Tier cache initialized. Run the Tier list rebuild workflow to publish updates.')
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to initialize tier cache.')
        }
      } finally {
        if (!cancelled) setInitializing(false)
      }
    }
    void init()
    return () => {
      cancelled = true
    }
  }, [supabase])

  useEffect(() => {
    if (!supabase) {
      setCommunityRotationsMap(new Map())
      return
    }
    let cancelled = false
    void fetchApprovedRotations(supabase).then((m) => {
      if (!cancelled) setCommunityRotationsMap(m)
    })
    return () => {
      cancelled = true
    }
  }, [supabase])

  useEffect(() => {
    const id = window.setTimeout(() => {
      const v = clampTierFightDurationSec(tierFightDurationSliderRef.current)
      setFightDurationAppliedSec((prev) => {
        if (v === prev) return prev
        writeTierFightDurationSec(v)
        return v
      })
    }, TIER_FIGHT_DURATION_MATRIX_DEBOUNCE_MS)
    return () => window.clearTimeout(id)
  }, [tierFightDurationSec])

  // If cache loaded first (from local storage), lazily fetch meta list for names/roles of pending queue.
  useEffect(() => {
    if (!cache || Object.keys(listMeta).length > 0) return
    let cancelled = false
    async function fillMeta() {
      try {
        const { meta } = await fetchAllDigimonIndex()
        if (cancelled) return
        setListMeta(meta)
      } catch {
        // Best effort for display metadata.
      }
    }
    void fillMeta()
    return () => {
      cancelled = true
    }
  }, [cache, listMeta])

  useEffect(() => {
    if (!workerForceRefresh || !supabase || !authReady || !user || !cache || initializing || building) {
      return
    }
    if (workerForceRefreshStartedRef.current) return
    workerForceRefreshStartedRef.current = true
    void updateTierList()
  }, [workerForceRefresh, supabase, authReady, user, cache, initializing, building])

  /** Full index refresh + detail fetch for every Digimon (API index signatures are too coarse for reliable diffs). */
  async function updateTierList() {
    if (!cache || building || initializing) return
    clearTierFightDurationResimCacheStorage()
    fightResimCacheRef.current = null
    /**
     * Only DPS “Enemy attribute” is cleared — stage/element/family filters and Ignore incomplete persist.
     * Baked scores stay neutral; the dropdown applies triangle scaling live after refresh.
     */
    setDpsTargetEnemyAttribute('')
    writeTierDpsTargetEnemyAttribute('')
    setTierFightDurationSec(TIER_FIGHT_DURATION_DEFAULT_SEC)
    setFightDurationAppliedSec(TIER_FIGHT_DURATION_DEFAULT_SEC)
    writeTierFightDurationSec(TIER_FIGHT_DURATION_DEFAULT_SEC)
    setBuilding(true)
    setError(null)
    const working: TierListCache = {
      ...cache,
      queue: [...cache.queue],
      entries: { ...cache.entries },
      listSignatures: { ...cache.listSignatures },
    }

    try {
      const snapshotBefore: Record<
        string,
        {
          dps: number
          tankScore?: number
          healerScore?: number
          status?: DigimonContentStatus
        }
      > = {}
      for (const [id, e] of Object.entries(cache.entries)) {
        snapshotBefore[id] = {
          dps: e.dps,
          tankScore: e.tankScore,
          healerScore: e.healerScore,
          status: e.status,
        }
      }
      const refreshedIds = new Set<string>()

      setStatus('Fetching Digimon index…')
      // Load approved community rotations (if Supabase is configured); used per-Digimon below
      let communityRotations = new Map<string, CommunityRotation>()
      if (supabase) {
        try {
          communityRotations = await fetchApprovedRotations(supabase)
        } catch {
          // Non-fatal: fall back to auto planner if Supabase fetch fails
        }
      }
      const { all, meta, signatures } = await fetchAllDigimonIndex()
      setListMeta(meta)

      const latestIds = new Set(all.map((d) => d.id))
      for (const cachedId of Object.keys(working.entries)) {
        if (!latestIds.has(cachedId)) delete working.entries[cachedId]
      }
      for (const cachedId of Object.keys(working.listSignatures)) {
        if (!latestIds.has(cachedId)) delete working.listSignatures[cachedId]
      }
      working.total = all.length

      const hadPriorSignatures = Object.keys(working.listSignatures).length > 0
      const refreshCauseById = new Map<string, TierRefreshCauseFlags>()
      const apiDiffById = new Map<string, string[]>()

      const plannedQueue = all.map((d) => d.id)

      for (const d of all) {
        const id = d.id
        if (refreshCauseById.has(id)) continue
        const entry = working.entries[id]
        const apiChanged = !entry || (hadPriorSignatures && working.listSignatures[id] !== signatures[id])
        const formulaChanged =
          !!entry &&
          (entry.supportScoreRevision !== TIER_SUPPORT_SCORE_REVISION ||
            tierEntryNeedsDpsSimRefresh(entry) ||
            tierEntryNeedsAutoCritScores(entry) ||
            tierEntryNeedsPerfectAtCloneScores(entry) ||
            tierEntryNeedsAnimationCancelScores(entry))
        refreshCauseById.set(id, {
          api: apiChanged,
          tier: formulaChanged,
          other: !apiChanged && !formulaChanged,
        })
      }

      working.queue = plannedQueue
      const initialBuildQueueTotal = plannedQueue.length
      setTierBuildQueueTotal(initialBuildQueueTotal > 0 ? initialBuildQueueTotal : null)
      working.listSignatures = signatures
      working.lastCheckedAt = new Date().toISOString()
      saveTierListCache(working)
      setCache({
        ...working,
        queue: [...working.queue],
        entries: { ...working.entries },
        listSignatures: { ...working.listSignatures },
      })

      if (working.queue.length === 0) {
        setStatus('Digimon index is empty — nothing to refresh.')
        setTierBuildQueueTotal(null)
        return
      }

      let processed = 0
      let backoffMs = 0
      while (working.queue.length > 0) {
        const id = working.queue[0]
        const meta = listMeta[id]
        const runDone =
          initialBuildQueueTotal > 0
            ? Math.min(initialBuildQueueTotal, initialBuildQueueTotal - working.queue.length)
            : 0
        const runTotalForMsg =
          initialBuildQueueTotal > 0 ? initialBuildQueueTotal : working.queue.length
        setStatus(`Checking all Digimon… ${runDone}/${runTotalForMsg} (checking ${meta?.name ?? id})`)

        if (backoffMs > 0) {
          const runTotal = runTotalForMsg
          setStatus(
            `Rate limit cooldown (${Math.ceil(backoffMs / 1000)}s)… then resuming at ${runDone}/${runTotal || 1}.`,
          )
          await sleep(backoffMs)
          backoffMs = 0
        }

        const checkingLabel = meta?.name ?? id
        const slowHintSuffix = ' (Taking longer than expected, please wait.)'
        const slowStatusLine = `Checking all Digimon… ${runDone}/${runTotalForMsg} (checking ${checkingLabel})${slowHintSuffix}`
        const slowHintTimer = window.setTimeout(() => {
          setStatus(slowStatusLine)
        }, TIER_UPDATE_SLOW_HINT_MS)

        try {
          try {
            const detail = await fetchDigimonDetail(id)
          const prevApiSnapshot = working.entries[id]?.apiSnapshot
          const nextApiSnapshot = buildTierApiSnapshot(detail)
          const levels = levelMapForSkills(detail.skills)
          const communityRotation = communityRotations.get(id)
          const runComparableSim = (
            durationSec: number,
            options?: {
              forceAutoCrit?: boolean
              perfectAtClone?: boolean
              autoAttackAnimationCancel?: boolean
            },
          ) => {
            const cfg = buildComparableRotationConfig(detail, durationSec, 1, {
              ...options,
              targetEnemyAttribute: '',
            })
            return simulateRotation(
              detail.skills,
              levels,
              cfg.durationSec,
              cfg.targets,
              cfg.baseAttack,
              cfg.attackSpeed,
              cfg.baseCritRateStat,
              {
                ...cfg.options,
                ...(communityRotation && communityRotation.sim_revision === TIER_DPS_SIM_REVISION
                  ? {
                      customRotation: communityRotation.skill_ids.map((sid) => ({ skillId: sid })),
                      customRotationFiller:
                        communityRotation.filler_ids.length > 0
                          ? communityRotation.filler_ids.map((sid) => ({ skillId: sid }))
                          : undefined,
                      customRotationFullCycles: 0,
                      manualSupportOnly: true,
                    }
                  : {}),
              },
            )
          }
          const sim = runComparableSim(DEFAULT_ROTATION_SIM_DURATION_SEC)
          const simBurst = runComparableSim(BURST_DPS_WINDOW_SEC)
          const simAutoCrit = runComparableSim(DEFAULT_ROTATION_SIM_DURATION_SEC, {
            forceAutoCrit: true,
          })
          const simPerfectAtClone = runComparableSim(DEFAULT_ROTATION_SIM_DURATION_SEC, {
            perfectAtClone: true,
          })
          const simBurstAutoCrit = runComparableSim(BURST_DPS_WINDOW_SEC, { forceAutoCrit: true })
          const simBurstPerfectAtClone = runComparableSim(BURST_DPS_WINDOW_SEC, {
            perfectAtClone: true,
          })
          const simPerfectAtCloneAutoCrit = runComparableSim(DEFAULT_ROTATION_SIM_DURATION_SEC, {
            perfectAtClone: true,
            forceAutoCrit: true,
          })
          const simBurstPerfectAtCloneAutoCrit = runComparableSim(BURST_DPS_WINDOW_SEC, {
            perfectAtClone: true,
            forceAutoCrit: true,
          })
          const simAnimationCancel = runComparableSim(DEFAULT_ROTATION_SIM_DURATION_SEC, {
            autoAttackAnimationCancel: true,
          })
          const simBurstAnimationCancel = runComparableSim(BURST_DPS_WINDOW_SEC, {
            autoAttackAnimationCancel: true,
          })
          const simAnimationCancelAutoCrit = runComparableSim(DEFAULT_ROTATION_SIM_DURATION_SEC, {
            autoAttackAnimationCancel: true,
            forceAutoCrit: true,
          })
          const simBurstAnimationCancelAutoCrit = runComparableSim(BURST_DPS_WINDOW_SEC, {
            autoAttackAnimationCancel: true,
            forceAutoCrit: true,
          })
          const simPerfectAtCloneAnimationCancel = runComparableSim(
            DEFAULT_ROTATION_SIM_DURATION_SEC,
            {
              perfectAtClone: true,
              autoAttackAnimationCancel: true,
            },
          )
          const simBurstPerfectAtCloneAnimationCancel = runComparableSim(BURST_DPS_WINDOW_SEC, {
            perfectAtClone: true,
            autoAttackAnimationCancel: true,
          })
          const simPerfectAtCloneAnimationCancelAutoCrit = runComparableSim(
            DEFAULT_ROTATION_SIM_DURATION_SEC,
            {
              perfectAtClone: true,
              autoAttackAnimationCancel: true,
              forceAutoCrit: true,
            },
          )
          const simBurstPerfectAtCloneAnimationCancelAutoCrit = runComparableSim(
            BURST_DPS_WINDOW_SEC,
            {
              perfectAtClone: true,
              autoAttackAnimationCancel: true,
              forceAutoCrit: true,
            },
          )
          const aoeScores = computeDpsAoeCategoryScores(detail)
          const tank = computeTankTierScore(detail)
          const healer = computeHealerTierScore(detail)
          const entry: SustainedDpsEntry = {
            id: detail.id,
            name: detail.name,
            role: detail.role,
            stage: detail.stage,
            dps: sim.dps,
            dpsCategoryScores: {
              sustained: sim.dps,
              burst: simBurst.dps,
              sustainedAutoDps: sim.autoDps,
              burstAutoDps: simBurst.autoDps,
            },
            dpsCategoryScoresAutoCrit: {
              sustained: simAutoCrit.dps,
              burst: simBurstAutoCrit.dps,
              sustainedAutoDps: simAutoCrit.autoDps,
              burstAutoDps: simBurstAutoCrit.autoDps,
            },
            dpsCategoryScoresPerfectAtClone: {
              sustained: simPerfectAtClone.dps,
              burst: simBurstPerfectAtClone.dps,
              sustainedAutoDps: simPerfectAtClone.autoDps,
              burstAutoDps: simBurstPerfectAtClone.autoDps,
            },
            dpsCategoryScoresPerfectAtCloneAutoCrit: {
              sustained: simPerfectAtCloneAutoCrit.dps,
              burst: simBurstPerfectAtCloneAutoCrit.dps,
              sustainedAutoDps: simPerfectAtCloneAutoCrit.autoDps,
              burstAutoDps: simBurstPerfectAtCloneAutoCrit.autoDps,
            },
            dpsCategoryScoresAnimationCancel: {
              sustained: simAnimationCancel.dps,
              burst: simBurstAnimationCancel.dps,
              sustainedAutoDps: simAnimationCancel.autoDps,
              burstAutoDps: simBurstAnimationCancel.autoDps,
            },
            dpsCategoryScoresAnimationCancelAutoCrit: {
              sustained: simAnimationCancelAutoCrit.dps,
              burst: simBurstAnimationCancelAutoCrit.dps,
              sustainedAutoDps: simAnimationCancelAutoCrit.autoDps,
              burstAutoDps: simBurstAnimationCancelAutoCrit.autoDps,
            },
            dpsCategoryScoresPerfectAtCloneAnimationCancel: {
              sustained: simPerfectAtCloneAnimationCancel.dps,
              burst: simBurstPerfectAtCloneAnimationCancel.dps,
              sustainedAutoDps: simPerfectAtCloneAnimationCancel.autoDps,
              burstAutoDps: simBurstPerfectAtCloneAnimationCancel.autoDps,
            },
            dpsCategoryScoresPerfectAtCloneAnimationCancelAutoCrit: {
              sustained: simPerfectAtCloneAnimationCancelAutoCrit.dps,
              burst: simBurstPerfectAtCloneAnimationCancelAutoCrit.dps,
              sustainedAutoDps: simPerfectAtCloneAnimationCancelAutoCrit.autoDps,
              burstAutoDps: simBurstPerfectAtCloneAnimationCancelAutoCrit.autoDps,
            },
            aoeCategoryScores: aoeScores,
            tankScore: tank.score,
            tankCategoryScores: tank.categoryScores,
            tankEffectiveDisplay: tank.effectiveDisplay,
            healerScore: healer.score,
            healerCategoryScores: healer.categoryScores,
            healerDisplayMetrics: {
              healHps: healer.healSustainHps,
              shieldHps: healer.shieldSustainHps,
              buffPctEquiv: healer.buffDmgGainDisplay,
              intTotal: healer.intStat,
            },
            status: getDigimonContentStatus(detail.skills),
            checkedAt: new Date().toISOString(),
            skillsSignature: tierSkillsSignature(detail.skills),
            supportScoreRevision: TIER_SUPPORT_SCORE_REVISION,
            dpsSimRevision: TIER_DPS_SIM_REVISION,
            communityRotationAuthor:
              communityRotation && communityRotation.sim_revision === TIER_DPS_SIM_REVISION
                ? communityRotation.author_name
                : undefined,
            communityRotationId:
              communityRotation && communityRotation.sim_revision === TIER_DPS_SIM_REVISION
                ? communityRotation.id
                : undefined,
            apiSnapshot: nextApiSnapshot,
          }
          const apiDiffLines = diffTierApiSnapshot(prevApiSnapshot, nextApiSnapshot)
          if (apiDiffLines.length > 0) {
            apiDiffById.set(id, apiDiffLines)
            const prevCause = refreshCauseById.get(id)
            refreshCauseById.set(id, {
              api: true,
              tier: prevCause?.tier ?? false,
              other: prevCause?.other ?? false,
            })
          }
          working.entries[id] = entry
          refreshedIds.add(id)
          working.queue.shift()
          processed += 1
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'unknown error'
          if (/429|rate/i.test(msg)) {
            // Backoff and retry same id later, keeping queue intact.
            backoffMs = Math.max(backoffMs, RATE_LIMIT_COOLDOWN_MS)
            working.queue.shift()
            working.queue.push(id)
            saveTierListCache(working)
            setCache({
              ...working,
              queue: [...working.queue],
              entries: { ...working.entries },
              listSignatures: { ...working.listSignatures },
            })
            continue
          }
          // Move failed id to back of queue so build can continue later.
          working.queue.shift()
          working.queue.push(id)
          processed += 1
        }

        working.lastCheckedAt = new Date().toISOString()
        saveTierListCache(working)
        setCache({
          ...working,
          queue: [...working.queue],
          entries: { ...working.entries },
          listSignatures: { ...working.listSignatures },
        })
        } finally {
          window.clearTimeout(slowHintTimer)
        }
        await sleep(REQUEST_DELAY_MS)
      }

      if (working.queue.length === 0) {
        setStatus('Tier list refresh complete. All Digimon were recalculated.')
        if (refreshedIds.size > 0) {
          const nextSummary = buildTierListUpdateSummary(
            'force',
            snapshotBefore,
            working.entries,
            refreshedIds,
          )
          setUpdateSummary(nextSummary)
          saveTierUpdateSummaryToStorage(nextSummary)

          let apiCount = 0
          let tierCount = 0
          const sampleDigimon: TierListChangeHistoryRow['sampleDigimon'] = []
          for (const id of refreshedIds) {
            const entry = working.entries[id]
            if (!entry) continue
            const rawCause = refreshCauseById.get(id)
            const cause = collapseTierRefreshCause(rawCause)
            if (cause === 'api') apiCount += 1
            if (rawCause?.tier || rawCause?.other || !rawCause || cause === 'tier') tierCount += 1
            if (sampleDigimon.length < 12) {
              sampleDigimon.push({ id, name: entry.name, cause })
            }
          }
          const compactApiDiffById: Record<string, string[]> = {}
          const compactApiDiffs: Array<{ id: string; name: string; lines: string[] }> = []
          let apiDiffBuckets = 0
          for (const [id, lines] of apiDiffById.entries()) {
            if (lines.length === 0) continue
            const clipped = lines.slice(0, 8)
            compactApiDiffById[id] = clipped
            compactApiDiffs.push({ id, name: working.entries[id]?.name ?? id, lines: clipped })
            apiDiffBuckets += 1
            if (apiDiffBuckets >= 60) break
          }
          const historyRow: TierListChangeHistoryRow = {
            id: `${nextSummary.finishedAt}-${Math.random().toString(36).slice(2, 8)}`,
            finishedAt: nextSummary.finishedAt,
            mode: 'force',
            refreshedCount: refreshedIds.size,
            apiCount,
            tierCount,
            sampleDigimon,
            apiDiffById: compactApiDiffById,
            apiDiffs: compactApiDiffs,
            summary: nextSummary,
          }
          appendTierChangeHistory(historyRow)
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Tier update failed.')
    } finally {
      setBuilding(false)
      setTierBuildQueueTotal(null)
    }
  }

  const checkedCount = cache ? Object.keys(cache.entries).length : 0
  const total = cache?.total ?? 0
  const runTotal = tierBuildQueueTotal
  /** Set when a build has a non-empty planned queue; pairs with `cache.queue` for progress text. */
  const hasActiveBuildRun = Boolean(building && runTotal !== null && runTotal > 0)
  const progressNumerator = hasActiveBuildRun
    ? Math.min(runTotal!, runTotal! - (cache?.queue.length ?? runTotal!))
    : building
      ? 0
      : checkedCount
  const progressDenominator = hasActiveBuildRun
    ? runTotal!
    : building
      ? Math.max(1, total || 1)
      : total
  const progress = progressDenominator > 0 ? (progressNumerator / progressDenominator) * 100 : 0
  const tierEntryIds = useMemo(() => Object.keys(cache?.entries ?? {}), [cache?.entries])

  const stageOptions = useMemo(() => {
    const stages = new Set<string>()
    Object.values(cache?.entries ?? {}).forEach((e) => {
      if (e.stage?.trim()) stages.add(e.stage.trim())
    })
    return ['All', ...[...stages].sort((a, b) => a.localeCompare(b))]
  }, [cache?.entries])

  const attributeOptions = useMemo(() => {
    const found = new Set<string>()
    for (const id of tierEntryIds) {
      const a = listMeta[id]?.attribute?.trim()
      if (a) found.add(a)
    }
    const preferred = WIKI_ATTR_STRINGS.filter((x) => found.has(x))
    const rest = [...found]
      .filter((x) => !WIKI_ATTR_STRINGS.includes(x))
      .sort((a, b) => a.localeCompare(b))
    return ['All', ...preferred, ...rest]
  }, [tierEntryIds, listMeta])

  const elementOptions = useMemo(() => {
    const found = new Set<string>()
    for (const id of tierEntryIds) {
      const el = listMeta[id]?.element?.trim()
      if (el) found.add(el)
    }
    const preferred = WIKI_EL_STRINGS.filter((x) => found.has(x))
    const rest = [...found]
      .filter((x) => !WIKI_EL_STRINGS.includes(x))
      .sort((a, b) => a.localeCompare(b))
    return ['All', ...preferred, ...rest]
  }, [tierEntryIds, listMeta])

  const familyOptions = useMemo(() => {
    const found = new Set<string>()
    for (const id of tierEntryIds) {
      for (const ft of listMeta[id]?.family_types ?? []) {
        const t = ft.trim()
        if (t) found.add(t)
      }
    }
    const preferred = WIKI_FAMILY_STRINGS.filter((x) => found.has(x))
    const rest = [...found]
      .filter((x) => !WIKI_FAMILY_STRINGS.includes(x))
      .sort((a, b) => a.localeCompare(b))
    return ['All', ...preferred, ...rest]
  }, [tierEntryIds, listMeta])

  const filteredEntries = useMemo(() => {
    const all = cache?.entries ?? {}
    const out: Record<string, SustainedDpsEntry> = {}
    for (const [id, e] of Object.entries(all)) {
      if (ignoreIncomplete && e.status === 'incomplete') continue
      if (selectedStages.length > 0 && !selectedStages.includes(e.stage)) continue
      const meta = listMeta[id]
      if (selectedAttributes.length > 0) {
        const a = meta?.attribute?.trim()
        if (!a || !selectedAttributes.includes(a)) continue
      }
      if (selectedElements.length > 0) {
        const el = meta?.element?.trim()
        if (!el || !selectedElements.includes(el)) continue
      }
      if (selectedFamilies.length > 0) {
        const families = meta?.family_types ?? []
        const match = families.some(
          (ft) => ft.trim() && selectedFamilies.includes(ft.trim()),
        )
        if (!match) continue
      }
      out[id] = e
    }
    return out
  }, [
    cache?.entries,
    listMeta,
    selectedStages,
    selectedAttributes,
    selectedElements,
    selectedFamilies,
    ignoreIncomplete,
  ])

  const communityRotationsFingerprint = useMemo(
    () => communityRotationsMapFingerprint(communityRotationsMap),
    [communityRotationsMap],
  )

  const fightResimRevision = useMemo(
    () =>
      buildFightResimCacheRevision({
        lastCheckedAt: cache?.lastCheckedAt,
        queueLen: cache?.queue?.length ?? 0,
        cacheTotal: cache?.total ?? 0,
        communityFp: communityRotationsFingerprint,
      }),
    [cache?.lastCheckedAt, cache?.queue?.length, cache?.total, communityRotationsFingerprint],
  )

  const entriesForMatrix = useMemo(() => {
    if (tierMode === 'dps') {
      if (dpsTierCategory === 'aoe') return filteredEntries

      let out: Record<string, SustainedDpsEntry>
      if (!dpsForceAutoCrit && !dpsPerfectAtClone && !dpsAutoAnimCancel) {
        out = Object.fromEntries(
          Object.entries(filteredEntries).map(([id, e]) => [id, { ...e }]),
        )
      } else {
        out = {}
        for (const [id, e] of Object.entries(filteredEntries)) {
          const s = dpsAutoAnimCancel
            ? dpsPerfectAtClone
              ? dpsForceAutoCrit
                ? e.dpsCategoryScoresPerfectAtCloneAnimationCancelAutoCrit
                : e.dpsCategoryScoresPerfectAtCloneAnimationCancel
              : dpsForceAutoCrit
                ? e.dpsCategoryScoresAnimationCancelAutoCrit
                : e.dpsCategoryScoresAnimationCancel
            : dpsPerfectAtClone
              ? dpsForceAutoCrit
                ? e.dpsCategoryScoresPerfectAtCloneAutoCrit
                : e.dpsCategoryScoresPerfectAtClone
              : e.dpsCategoryScoresAutoCrit
          out[id] = {
            ...e,
            dps: s?.sustained ?? e.dps,
            dpsCategoryScores: s ?? e.dpsCategoryScores,
          }
        }
      }

      const targetTrim = dpsTargetEnemyAttribute.trim()
      const needFightResim =
        dpsTierCategory === 'sustained' &&
        clampTierFightDurationSec(fightDurationAppliedSec) !== TIER_FIGHT_DURATION_DEFAULT_SEC

      const resimDoneIds = new Set<string>()
      if (needFightResim) {
        const dur = clampTierFightDurationSec(fightDurationAppliedSec)
        const modifiers = {
          forceAutoCrit: dpsForceAutoCrit,
          perfectAtClone: dpsPerfectAtClone,
          autoAttackAnimationCancel: dpsAutoAnimCancel,
        }
        const paramKey = buildFightResimParamKey({
          durationSec: dur,
          forceAutoCrit: modifiers.forceAutoCrit,
          perfectAtClone: modifiers.perfectAtClone,
          autoAnimCancel: modifiers.autoAttackAnimationCancel,
          targetEnemyAttributeTrim: targetTrim,
        })

        let root = fightResimCacheRef.current
        if (!root || root.revision !== fightResimRevision) {
          const stored = readTierFightDurationResimCacheRoot()
          root =
            stored && stored.revision === fightResimRevision
              ? {
                  v: 1,
                  revision: stored.revision,
                  byParamKey: structuredClone(stored.byParamKey) as TierFightResimCacheRootV1['byParamKey'],
                }
              : { v: 1, revision: fightResimRevision, byParamKey: {} }
          fightResimCacheRef.current = root
        }
        const bucket = root.byParamKey[paramKey] ?? (root.byParamKey[paramKey] = {})

        for (const [id, e] of Object.entries(out)) {
          const base = e.dpsCategoryScores
          if (!base) continue

          const entrySig = e.skillsSignature ?? ''
          const cached = bucket[id]
          if (cached && cached.sig === entrySig) {
            resimDoneIds.add(id)
            out[id] = {
              ...e,
              dps: cached.dps,
              dpsCategoryScores: { ...cached.dpsCategoryScores },
            }
            continue
          }

          const sim = resimTierEntrySustainedAtFightDuration(e, dur, {
            modifiers,
            targetEnemyAttribute: dpsTargetEnemyAttribute,
            communityRotation: communityRotationsMap.get(id),
          })
          if (!sim) continue
          resimDoneIds.add(id)
          const attacker = listMeta[id]?.attribute?.trim()
          let nextScores = { ...base, sustained: sim.sustained, sustainedAutoDps: sim.sustainedAutoDps }
          if (targetTrim) {
            nextScores = {
              ...nextScores,
              burst: adjustRotationDpsForAttributeTarget(
                nextScores.burst,
                nextScores.burstAutoDps,
                attacker,
                targetTrim,
              ),
            }
          }
          bucket[id] = { sig: entrySig, dps: sim.sustained, dpsCategoryScores: nextScores }
          out[id] = { ...e, dps: sim.sustained, dpsCategoryScores: nextScores }
        }
      }

      if (targetTrim) {
        for (const id of Object.keys(out)) {
          if (resimDoneIds.has(id)) continue
          const attacker = listMeta[id]?.attribute?.trim()
          out[id] = tierEntryWithAttributeTarget(out[id], targetTrim, attacker)
        }
      }

      return out
    }
    const out: Record<string, SustainedDpsEntry> = {}
    for (const [id, e] of Object.entries(filteredEntries)) {
      const r = (e.role || '').trim()
      if (tierMode === 'tank' && r === 'Tank') out[id] = e
      if (tierMode === 'healer' && r === 'Support') out[id] = e
    }
    return out
  }, [
    filteredEntries,
    tierMode,
    dpsForceAutoCrit,
    dpsPerfectAtClone,
    dpsAutoAnimCancel,
    dpsTierCategory,
    dpsTargetEnemyAttribute,
    fightDurationAppliedSec,
    communityRotationsMap,
    fightResimRevision,
    cache,
    listMeta,
  ])

  useEffect(() => {
    const root = fightResimCacheRef.current
    if (!root || root.revision !== fightResimRevision) return
    if (Object.keys(root.byParamKey).length === 0) return
    const t = window.setTimeout(() => {
      const latest = fightResimCacheRef.current
      if (latest && latest.revision === fightResimRevision) {
        writeTierFightDurationResimCacheRoot(latest)
      }
    }, 450)
    return () => window.clearTimeout(t)
  }, [
    fightResimRevision,
    fightDurationAppliedSec,
    dpsForceAutoCrit,
    dpsPerfectAtClone,
    dpsAutoAnimCancel,
    dpsTargetEnemyAttribute,
    tierMode,
    dpsTierCategory,
    filteredEntries,
  ])

  function toggleMultiFilter(label: string, setter: Dispatch<SetStateAction<string[]>>) {
    if (label === 'All') {
      setter([])
      return
    }
    setter((prev) => {
      if (prev.includes(label)) return prev.filter((x) => x !== label)
      return [...prev, label].sort((a, b) => a.localeCompare(b))
    })
  }

  function toggleUpdatePanelMinimized() {
    setUpdatePanelMinimized((prev) => {
      const next = !prev
      writeTierUpdatePanelMinimized(next)
      return next
    })
  }

  const tierGroupOptions = useMemo<BuildTierGroupsOptions | undefined>(
    () => (tierMode === 'dps' ? { dpsCategory: dpsTierCategory } : undefined),
    [tierMode, dpsTierCategory],
  )

  const groups = useMemo(
    () => buildTierGroups(entriesForMatrix, tierMode, tierGroupOptions),
    [entriesForMatrix, tierMode, tierGroupOptions],
  )
  const roles = useMemo(() => groups.map((g) => g.role), [groups])
  const byRole = useMemo(() => {
    const map: Record<string, (typeof groups)[number]> = {}
    groups.forEach((g) => {
      map[g.role] = g
    })
    return map
  }, [groups])

  const tankScoresStale = useMemo(() => {
    if (tierMode !== 'tank') return false
    return Object.values(entriesForMatrix).some(
      (e) =>
        e.tankScore == null ||
        e.tankCategoryScores == null ||
        e.tankEffectiveDisplay == null,
    )
  }, [tierMode, entriesForMatrix])

  const healerScoresStale = useMemo(() => {
    if (tierMode !== 'healer') return false
    return Object.values(entriesForMatrix).some(
      (e) =>
        e.healerScore == null ||
        e.healerCategoryScores == null ||
        e.healerDisplayMetrics == null,
    )
  }, [tierMode, entriesForMatrix])

  const dpsScoresStale = useMemo(() => {
    if (tierMode !== 'dps') return false
    return Object.values(entriesForMatrix).some(
      (e) =>
        !tierEntryDpsCategoryScoresComplete(e) ||
        tierEntryNeedsDpsSimRefresh(e) ||
        tierEntryNeedsAutoCritScores(e) ||
        tierEntryNeedsPerfectAtCloneScores(e) ||
        tierEntryNeedsAnimationCancelScores(e),
    )
  }, [tierMode, entriesForMatrix])

  const updateSummarySections = useMemo(() => {
    if (!updateSummary) return []
    const u = updateSummary
    const sections: {
      id: TierListUpdateSummaryTabKey
      label: string
      shortLabel: string
      count: number
    }[] = [
      {
        id: 'dps',
        label: `DPS (${DEFAULT_ROTATION_SIM_DURATION_SEC}s sustained)`,
        shortLabel: 'DPS',
        count: u.dpsUp.length + u.dpsDown.length + u.dpsNew.length,
      },
      {
        id: 'tank',
        label: 'Tank score (heuristic)',
        shortLabel: 'Tank',
        count: u.tankUp.length + u.tankDown.length + u.tankNew.length,
      },
      {
        id: 'healer',
        label: 'Healer score (Support role, heuristic)',
        shortLabel: 'Healer',
        count: u.healerUp.length + u.healerDown.length + u.healerNew.length,
      },
      {
        id: 'status',
        label: 'Content status',
        shortLabel: 'Status',
        count: u.statusChanges.length,
      },
    ]
    return sections.filter((s) => s.count > 0)
  }, [updateSummary])

  const effectiveUpdateSummaryTab = useMemo((): TierListUpdateSummaryTabKey => {
    if (updateSummarySections.length === 0) return 'dps'
    if (updateSummarySections.length === 1) return updateSummarySections[0].id
    return updateSummaryTab
  }, [updateSummarySections, updateSummaryTab])

  useEffect(() => {
    if (updateSummarySections.length === 0) return
    setUpdateSummaryTab((prev) =>
      updateSummarySections.some((s) => s.id === prev) ? prev : updateSummarySections[0].id,
    )
  }, [updateSummarySections])

  const tierWorkerState = initializing
    ? 'init'
    : building
      ? 'building'
      : workerForceRefresh
        ? 'ready'
        : 'idle'

  return (
    <div className="tier-page" data-tier-worker-state={tierWorkerState}>
      <div className="tier-shell">
        <div className="tier-shell-nav">
          <div
            className={
              tierMode === 'dps'
                ? 'tier-shell-tab-strip tier-shell-tab-strip--has-subtabs'
                : 'tier-shell-tab-strip tier-shell-tab-strip--solo'
            }
          >
            <nav className="tier-shell-tabs" role="tablist" aria-label="Tier list type">
              <button type="button" role="tab" className="tier-shell-tab" aria-selected={tierMode === 'dps'} onClick={() => setTierModePersist('dps')}>DPS</button>
              <button type="button" role="tab" className="tier-shell-tab" aria-selected={tierMode === 'tank'} onClick={() => setTierModePersist('tank')}>Tank</button>
              <button type="button" role="tab" className="tier-shell-tab" aria-selected={tierMode === 'healer'} onClick={() => setTierModePersist('healer')}>Healer</button>
            </nav>
            {tierMode === 'dps' ? (
              <nav className="tier-shell-subtabs" role="tablist" aria-label="DPS ranking metric">
                {DPS_TIER_CATEGORY_ORDER.map((key) => (
                  <button key={key} type="button" role="tab" className="tier-shell-subtab" aria-selected={dpsTierCategory === key} onClick={() => setDpsTierCategoryPersist(key)}>
                    {DPS_TIER_MATRIX_COLUMN_LABELS[key]}
                  </button>
                ))}
              </nav>
            ) : null}
          </div>
        </div>
        <div className="tier-shell-bar" aria-label="Tier list status">
          <div className="tier-shell-bar-main">
            {building ? (
              <span className="tier-shell-meta muted" aria-live="polite">
                <strong>{progressNumerator}/{progressDenominator || '…'}</strong> ({progress.toFixed(0)}%)
              </span>
            ) : (
              <span className="tier-shell-meta muted" title={cache?.lastCheckedAt ? new Date(cache.lastCheckedAt).toLocaleString() : 'Never refreshed'}>
                Last checked: {cache?.lastCheckedAt ? new Date(cache.lastCheckedAt).toLocaleString() : 'Never'}
              </span>
            )}
            {publishedSnapshotAt ? (
              <span
                className="tier-shell-meta muted"
                title={`Published snapshot: ${new Date(publishedSnapshotAt).toLocaleString()}`}
              >
                Published: {new Date(publishedSnapshotAt).toLocaleString()}
              </span>
            ) : null}
          </div>
        </div>
        {error ? <p className="error tier-shell-error" role="alert">{error}</p> : null}
        {initializing ? (
          <p className="tier-server-rebuild-banner muted" role="status">
            Loading published tier list…
          </p>
        ) : null}
        {!initializing && building ? (
          <p className="tier-server-rebuild-banner" role="status" aria-live="polite">
            Updating tier list…{' '}
            <strong>
              {progressNumerator}/{progressDenominator || '…'}
            </strong>{' '}
            ({progress.toFixed(0)}%)
          </p>
        ) : null}
      </div>

      {updateSummary && (
        <section
          className="tier-update-banner"
          style={{ display: 'none' }}
          aria-label="Last tier list update summary"
        >
          <div className="tier-update-summary-head">
            <div className="tier-update-summary-head-text">
              <h3>Last update</h3>
              {!updatePanelMinimized && (
                <p className="muted tier-update-summary-meta">
                  {new Date(updateSummary.finishedAt).toLocaleString()}
                  {' · '}
                  Full refresh
                  {' · '}
                  {updateSummary.refreshedCount} Digimon refreshed
                </p>
              )}
            </div>
            <div className="tier-update-summary-actions">
              <button
                type="button"
                className="tier-update-summary-btn"
                onClick={toggleUpdatePanelMinimized}
                aria-expanded={!updatePanelMinimized}
              >
                {updatePanelMinimized ? 'Expand' : 'Minimize'}
              </button>
              <button
                type="button"
                className="tier-update-summary-btn tier-update-summary-btn-dismiss"
                onClick={() => {
                  setUpdateSummary(null)
                  saveTierUpdateSummaryToStorage(null)
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
          {updatePanelMinimized ? (
            <div className="tier-update-summary-collapsed">
              <p className="tier-update-summary-collapsed-time muted">
                {new Date(updateSummary.finishedAt).toLocaleString()}
              </p>
              <div className="tier-update-summary-stat-chips" role="list" aria-label="Score changes by type">
                <span className="tier-update-summary-stat-chip" role="listitem">
                  DPS
                  <span className="tier-update-summary-stat-chip-delta" aria-label="DPS up, down, new">
                    {updateSummary.dpsUp.length}↑ {updateSummary.dpsDown.length}↓ · {updateSummary.dpsNew.length}{' '}
                    new
                  </span>
                </span>
                <span className="tier-update-summary-stat-chip" role="listitem">
                  Tank
                  <span className="tier-update-summary-stat-chip-delta" aria-label="Tank up, down, new">
                    {updateSummary.tankUp.length}↑ {updateSummary.tankDown.length}↓ · {updateSummary.tankNew.length}{' '}
                    new
                  </span>
                </span>
                <span className="tier-update-summary-stat-chip" role="listitem">
                  Healer
                  <span className="tier-update-summary-stat-chip-delta" aria-label="Healer up, down, new">
                    {updateSummary.healerUp.length}↑ {updateSummary.healerDown.length}↓ ·{' '}
                    {updateSummary.healerNew.length} new
                  </span>
                </span>
                {updateSummary.statusChanges.length > 0 ? (
                  <span className="tier-update-summary-stat-chip" role="listitem">
                    Status
                    <span className="tier-update-summary-stat-chip-delta">
                      {updateSummary.statusChanges.length} change
                      {updateSummary.statusChanges.length === 1 ? '' : 's'}
                    </span>
                  </span>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="tier-update-summary-body">
              {updateSummary.dpsUp.length === 0 &&
              updateSummary.dpsDown.length === 0 &&
              updateSummary.dpsNew.length === 0 &&
              updateSummary.tankUp.length === 0 &&
              updateSummary.tankDown.length === 0 &&
              updateSummary.tankNew.length === 0 &&
              updateSummary.healerUp.length === 0 &&
              updateSummary.healerDown.length === 0 &&
              updateSummary.healerNew.length === 0 &&
              updateSummary.statusChanges.length === 0 ? (
                <p className="muted">
                  No DPS, tank, or healer score shifts above thresholds and no content status changes
                  among refreshed Digimon.
                </p>
              ) : (
                <>
                  {updateSummarySections.length > 1 ? (
                    <div
                      className="tier-update-summary-tabs"
                      role="tablist"
                      aria-label="Update breakdown by score type"
                    >
                      {updateSummarySections.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          role="tab"
                          aria-selected={effectiveUpdateSummaryTab === s.id}
                          aria-controls="tier-update-summary-panel"
                          id={`tier-update-tab-${s.id}`}
                          className="tier-update-summary-tab"
                          onClick={() => setUpdateSummaryTab(s.id)}
                        >
                          <span className="tier-update-summary-tab-label">{s.shortLabel}</span>
                          <span className="tier-update-summary-tab-badge">{s.count}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div
                    className="tier-update-summary-tab-panel tier-update-summary-tab-panel-scroll"
                    role="tabpanel"
                    id="tier-update-summary-panel"
                    aria-labelledby={
                      updateSummarySections.length > 1
                        ? `tier-update-tab-${effectiveUpdateSummaryTab}`
                        : undefined
                    }
                  >
                    {effectiveUpdateSummaryTab === 'dps' && (
                      <div className="tier-update-summary-block">
                  <h4 className="tier-update-summary-subhead">DPS ({DEFAULT_ROTATION_SIM_DURATION_SEC}s sustained)</h4>
                  {updateSummary.dpsUp.length > 0 && (
                    <div className="tier-update-summary-subblock">
                      <p className="tier-update-summary-label">Increased</p>
                      <table className="tier-update-summary-table">
                        <thead>
                          <tr>
                            <th>Digimon</th>
                            <th>Role</th>
                            <th>Before</th>
                            <th>After</th>
                            <th>Δ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {updateSummary.dpsUp.map((r) => (
                            <tr key={`up-${r.id}`}>
                              <td>
                                <Link to={labHrefForTierEntry(r.id)}>{r.name}</Link>
                              </td>
                              <td>{r.role}</td>
                              <td>{r.before.toFixed(1)}</td>
                              <td>{r.after.toFixed(1)}</td>
                              <td className="tier-update-summary-delta-pos">+{r.delta.toFixed(1)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {updateSummary.dpsDown.length > 0 && (
                    <div className="tier-update-summary-subblock">
                      <p className="tier-update-summary-label">Decreased</p>
                      <table className="tier-update-summary-table">
                        <thead>
                          <tr>
                            <th>Digimon</th>
                            <th>Role</th>
                            <th>Before</th>
                            <th>After</th>
                            <th>Δ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {updateSummary.dpsDown.map((r) => (
                            <tr key={`dn-${r.id}`}>
                              <td>
                                <Link to={labHrefForTierEntry(r.id)}>{r.name}</Link>
                              </td>
                              <td>{r.role}</td>
                              <td>{r.before.toFixed(1)}</td>
                              <td>{r.after.toFixed(1)}</td>
                              <td className="tier-update-summary-delta-neg">{r.delta.toFixed(1)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {updateSummary.dpsNew.length > 0 && (
                    <div className="tier-update-summary-subblock">
                      <p className="tier-update-summary-label">Newly calculated</p>
                      <table className="tier-update-summary-table">
                        <thead>
                          <tr>
                            <th>Digimon</th>
                            <th>Role</th>
                            <th>DPS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {updateSummary.dpsNew.map((r) => (
                            <tr key={`nw-${r.id}`}>
                              <td>
                                <Link to={labHrefForTierEntry(r.id)}>{r.name}</Link>
                              </td>
                              <td>{r.role}</td>
                              <td>{r.after.toFixed(1)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {effectiveUpdateSummaryTab === 'tank' && (
                <div className="tier-update-summary-block">
                  <h4 className="tier-update-summary-subhead">Tank score (heuristic)</h4>
                  {updateSummary.tankUp.length > 0 && (
                    <div className="tier-update-summary-subblock">
                      <p className="tier-update-summary-label">Increased</p>
                      <table className="tier-update-summary-table">
                        <thead>
                          <tr>
                            <th>Digimon</th>
                            <th>Role</th>
                            <th>Before</th>
                            <th>After</th>
                            <th>Δ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {updateSummary.tankUp.map((r) => (
                            <tr key={`tup-${r.id}`}>
                              <td>
                                <Link to={labHrefForTierEntry(r.id)}>{r.name}</Link>
                              </td>
                              <td>{r.role}</td>
                              <td>{r.before.toFixed(2)}</td>
                              <td>{r.after.toFixed(2)}</td>
                              <td className="tier-update-summary-delta-pos">+{r.delta.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {updateSummary.tankDown.length > 0 && (
                    <div className="tier-update-summary-subblock">
                      <p className="tier-update-summary-label">Decreased</p>
                      <table className="tier-update-summary-table">
                        <thead>
                          <tr>
                            <th>Digimon</th>
                            <th>Role</th>
                            <th>Before</th>
                            <th>After</th>
                            <th>Δ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {updateSummary.tankDown.map((r) => (
                            <tr key={`tdn-${r.id}`}>
                              <td>
                                <Link to={labHrefForTierEntry(r.id)}>{r.name}</Link>
                              </td>
                              <td>{r.role}</td>
                              <td>{r.before.toFixed(2)}</td>
                              <td>{r.after.toFixed(2)}</td>
                              <td className="tier-update-summary-delta-neg">{r.delta.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {updateSummary.tankNew.length > 0 && (
                    <div className="tier-update-summary-subblock">
                      <p className="tier-update-summary-label">Newly calculated</p>
                      <table className="tier-update-summary-table">
                        <thead>
                          <tr>
                            <th>Digimon</th>
                            <th>Role</th>
                            <th>Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {updateSummary.tankNew.map((r) => (
                            <tr key={`tnw-${r.id}`}>
                              <td>
                                <Link to={labHrefForTierEntry(r.id)}>{r.name}</Link>
                              </td>
                              <td>{r.role}</td>
                              <td>{r.after.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {effectiveUpdateSummaryTab === 'healer' && (
                <div className="tier-update-summary-block">
                  <h4 className="tier-update-summary-subhead">Healer score (Support role, heuristic)</h4>
                  {updateSummary.healerUp.length > 0 && (
                    <div className="tier-update-summary-subblock">
                      <p className="tier-update-summary-label">Increased</p>
                      <table className="tier-update-summary-table">
                        <thead>
                          <tr>
                            <th>Digimon</th>
                            <th>Role</th>
                            <th>Before</th>
                            <th>After</th>
                            <th>Δ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {updateSummary.healerUp.map((r) => (
                            <tr key={`hup-${r.id}`}>
                              <td>
                                <Link to={labHrefForTierEntry(r.id)}>{r.name}</Link>
                              </td>
                              <td>{r.role}</td>
                              <td>{r.before.toFixed(2)}</td>
                              <td>{r.after.toFixed(2)}</td>
                              <td className="tier-update-summary-delta-pos">+{r.delta.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {updateSummary.healerDown.length > 0 && (
                    <div className="tier-update-summary-subblock">
                      <p className="tier-update-summary-label">Decreased</p>
                      <table className="tier-update-summary-table">
                        <thead>
                          <tr>
                            <th>Digimon</th>
                            <th>Role</th>
                            <th>Before</th>
                            <th>After</th>
                            <th>Δ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {updateSummary.healerDown.map((r) => (
                            <tr key={`hdn-${r.id}`}>
                              <td>
                                <Link to={labHrefForTierEntry(r.id)}>{r.name}</Link>
                              </td>
                              <td>{r.role}</td>
                              <td>{r.before.toFixed(2)}</td>
                              <td>{r.after.toFixed(2)}</td>
                              <td className="tier-update-summary-delta-neg">{r.delta.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {updateSummary.healerNew.length > 0 && (
                    <div className="tier-update-summary-subblock">
                      <p className="tier-update-summary-label">Newly calculated</p>
                      <table className="tier-update-summary-table">
                        <thead>
                          <tr>
                            <th>Digimon</th>
                            <th>Role</th>
                            <th>Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {updateSummary.healerNew.map((r) => (
                            <tr key={`hnw-${r.id}`}>
                              <td>
                                <Link to={labHrefForTierEntry(r.id)}>{r.name}</Link>
                              </td>
                              <td>{r.role}</td>
                              <td>{r.after.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {effectiveUpdateSummaryTab === 'status' && (
                <div className="tier-update-summary-block">
                  <h4 className="tier-update-summary-subhead">Content status</h4>
                  <table className="tier-update-summary-table">
                    <thead>
                      <tr>
                        <th>Digimon</th>
                        <th>Role</th>
                        <th>Was</th>
                        <th>Now</th>
                      </tr>
                    </thead>
                    <tbody>
                      {updateSummary.statusChanges.map((r) => (
                        <tr key={`st-${r.id}`}>
                          <td>
                            <Link to={labHrefForTierEntry(r.id)}>{r.name}</Link>
                          </td>
                          <td>{r.role}</td>
                          <td>{formatTierStatus(r.from)}</td>
                          <td>{formatTierStatus(r.to)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {cache && !initializing && checkedCount === 0 && !building ? (
        <p className="tier-server-rebuild-banner muted" role="status">
          Waiting for the published tier list. This page will update automatically when ready.
        </p>
      ) : null}

      {cache && !initializing && checkedCount > 0 && (
        <section className="tier-matrix-section">
          {dpsScoresStale && tierMode === 'dps' ? (
            <p className="tier-stale-note" role="status">
              Some rows need a DPS refresh (missing category scores or an older rotation sim). Run{' '}
              <strong>Update tier list</strong> (full wiki pass) to recalculate.
            </p>
          ) : null}
          {tankScoresStale && tierMode === 'tank' ? (
            <p className="tier-stale-note" role="status">
              Some rows are missing tank scores. Run <strong>Update tier list</strong> to recalculate.
            </p>
          ) : null}
          {healerScoresStale && tierMode === 'healer' ? (
            <p className="tier-stale-note" role="status">
              Some rows are missing healer scores. Run <strong>Update tier list</strong> to recalculate.
            </p>
          ) : null}
          <div className="tier-filters-compact">
            <div className="tier-filter-row" role="group" aria-labelledby="tier-filter-stage-label">
              <span className="tier-filter-label" id="tier-filter-stage-label">
                Stage
              </span>
              <div className="stage-tabs tier-filter-chips">
                {stageOptions.map((s) => {
                  const selected =
                    s === 'All' ? selectedStages.length === 0 : selectedStages.includes(s)
                  return (
                    <button
                      key={s}
                      type="button"
                      className="stage-tab"
                      style={digimonStageTierFilterStyle(s, selected)}
                      onClick={() => toggleMultiFilter(s, setSelectedStages)}
                      aria-pressed={selected}
                    >
                      {s}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="tier-filter-row" role="group" aria-labelledby="tier-filter-type-label">
              <span className="tier-filter-label" id="tier-filter-type-label">
                Type
              </span>
              <div className="stage-tabs tier-filter-chips">
                {attributeOptions.map((s) => {
                  const selected =
                    s === 'All' ? selectedAttributes.length === 0 : selectedAttributes.includes(s)
                  return (
                    <button
                      key={s}
                      type="button"
                      className="stage-tab tier-facet-tab"
                      onClick={() => toggleMultiFilter(s, setSelectedAttributes)}
                      aria-pressed={selected}
                    >
                      {s}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="tier-filter-row" role="group" aria-labelledby="tier-filter-element-label">
              <span className="tier-filter-label" id="tier-filter-element-label">
                Element
              </span>
              <div className="stage-tabs tier-filter-chips">
                {elementOptions.map((s) => {
                  const selected =
                    s === 'All' ? selectedElements.length === 0 : selectedElements.includes(s)
                  return (
                    <button
                      key={s}
                      type="button"
                      className="stage-tab tier-facet-tab"
                      onClick={() => toggleMultiFilter(s, setSelectedElements)}
                      aria-pressed={selected}
                    >
                      {s}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="tier-filter-row" role="group" aria-labelledby="tier-filter-family-label">
              <span className="tier-filter-label" id="tier-filter-family-label">
                Family
              </span>
              <div className="stage-tabs tier-filter-chips">
                {familyOptions.map((s) => {
                  const selected =
                    s === 'All' ? selectedFamilies.length === 0 : selectedFamilies.includes(s)
                  return (
                    <button
                      key={s}
                      type="button"
                      className="stage-tab tier-facet-tab"
                      onClick={() => toggleMultiFilter(s, setSelectedFamilies)}
                      aria-pressed={selected}
                    >
                      {s}
                    </button>
                  )
                })}
              </div>
            </div>
            <div
              className="tier-filter-row tier-filter-row--dps-enemy-attr"
              role="group"
              aria-labelledby="tier-dps-enemy-attr-label"
            >
              <span className="tier-filter-label" id="tier-dps-enemy-attr-label">
                ENEMY ATT
              </span>
              <div className="tier-dps-enemy-attr-stack">
                <div className="tier-dps-target-selects-row">
                  <div className="tier-dps-attribute-column">
                    <EnemyAttributeTargetField
                      value={dpsTargetEnemyAttribute}
                      onChange={setDpsTargetEnemyAttributePersist}
                      selectClassName="tier-dps-enemy-attr-select"
                      ariaLabel="Enemy wiki attribute for Vaccine–Data–Virus skill damage"
                      showLegend={false}
                    />
</div>
                </div>
              </div>
            </div>
            <div className="tier-filter-row tier-filter-row--options" role="group" aria-label="Tier list options">
              <span className="tier-filter-label">Options</span>
              <div className="stage-tabs tier-filter-chips">
                <button
                  type="button"
                  className="stage-tab tier-facet-tab tier-option-chip"
                  aria-pressed={ignoreIncomplete}
                  onClick={() => setIgnoreIncompletePersist(!ignoreIncomplete)}
                >
                  Ignore Incomplete
                </button>
              </div>
            </div>
            {tierMode === 'dps' ? (
              <div className="tier-filter-row tier-filter-row--modifiers" role="group" aria-label="DPS modifiers">
                <span className="tier-filter-label">Modifiers</span>
                <TierDpsModifiersControls
                  dpsTierCategory={dpsTierCategory}
                  tierFightDurationSec={tierFightDurationSec}
                  onFightDurationChange={setTierFightDurationSecPersist}
                  onFightDurationPointerUp={commitFightDurationFromSlider}
                  dpsForceAutoCrit={dpsForceAutoCrit}
                  onDpsForceAutoCritChange={setDpsForceAutoCritPersist}
                  dpsPerfectAtClone={dpsPerfectAtClone}
                  onDpsPerfectAtCloneChange={setDpsPerfectAtClonePersist}
                  dpsAutoAnimCancel={dpsAutoAnimCancel}
                  onDpsAutoAnimCancelChange={setDpsAutoAnimCancelPersist}
                />
              </div>
            ) : null}
            <div
              className="tier-status-legend tier-status-legend--compact tier-status-legend--filters-corner"
              role="note"
              aria-label="Status criteria"
            >
              <span className="tier-status-legend-item">
                <span className="tier-status-dot tier-status-dot-complete" aria-hidden="true" />
                <span className="lab-inline-tooltip-wrap tier-status-legend-tooltip tier-status-legend-tooltip--complete">
                  <span>Complete</span>
                  <span role="tooltip" className="lab-inline-tooltip">
                    Can change
                  </span>
                </span>
              </span>
              <span className="tier-status-legend-item">
                <span className="tier-status-dot tier-status-dot-incomplete" aria-hidden="true" />
                <span className="lab-inline-tooltip-wrap tier-status-legend-tooltip">
                  <span>Incomplete</span>
                  <span role="tooltip" className="lab-inline-tooltip">
                    Incomplete if skills &lt; 5 or any skill name contains &ldquo;placeholder&rdquo;.
                  </span>
                </span>
              </span>
            </div>
          </div>
          {roles.length === 0 ? (
            <p className="muted tier-matrix-empty">
              No Digimon match this view. Try clearing filters
              {tierMode === 'tank'
                ? ' or note that only wiki role “Tank” appears here.'
                : tierMode === 'healer'
                  ? ' or note that only wiki role “Support” appears here.'
                  : '.'}
            </p>
          ) : (
            <div
              className={`tier-matrix-wrap${
                tierMode === 'tank' || tierMode === 'healer' || (tierMode === 'dps' && dpsTierCategory === 'aoe')
                  ? ' tier-matrix-wrap--category-matrix'
                  : ''
              }`}
            >
              <table
                className={`tier-matrix${
                  tierMode === 'tank' || tierMode === 'healer' || (tierMode === 'dps' && dpsTierCategory === 'aoe')
                    ? ' tier-matrix--category-matrix'
                    : ''
                }`}
              >
                <colgroup>
                  <col className="tier-matrix-col-rank" />
                  {roles.map((r) => (
                    <col key={r} className="tier-matrix-col-role" />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th className="tier-matrix-th-rank">Tier</th>
                    {roles.map((r) => (
                      <th key={r}>{r}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(['S', 'A', 'B', 'C'] as const).map((tier) => (
                    <tr key={`row-${tier}`}>
                      <td className={`tier-row-label tier-${tier.toLowerCase()}`}>{tier}</td>
                      {roles.map((role) => {
                        const columnGroup = byRole[role]
                        const entries = columnGroup?.tiers[tier] ?? []
                        return (
                          <td key={`${tier}-${role}`} className={`tier-cell tier-${tier.toLowerCase()}`}>
                            <div className="tier-cell-content">
                              {entries.length === 0 ? (
                                <span className="muted">-</span>
                              ) : (
                                <ul className="tier-entry-list">
                                  {entries.map((e) => {
                                    const modelId = listMeta[e.id]?.model_id ?? ''
                                    const status = e.status ?? 'unknown'
                                    const icon = modelId
                                      ? digimonPortraitUrl(modelId, e.id, e.name)
                                      : undefined
                                    const scoreLabel =
                                      tierMode === 'dps' && dpsTierCategory === 'aoe' && columnGroup?.aoeSortKey
                                        ? (() => {
                                            const k = columnGroup.aoeSortKey
                                            const s = e.aoeCategoryScores
                                            const v = s?.[k]
                                            return v != null && Number.isFinite(v)
                                              ? formatAoeTierMatrixCell(k, v)
                                              : '…'
                                          })()
                                        : tierMode === 'dps' && dpsTierCategory !== 'aoe'
                                          ? (() => {
                                              const k = dpsTierCategory
                                              const s = e.dpsCategoryScores
                                              const v =
                                                k === 'sustained'
                                                  ? (s?.sustained ?? e.dps)
                                                  : k === 'burst'
                                                    ? s?.burst
                                                    : undefined
                                              if (v == null) return '…'
                                              return v.toFixed(1)
                                            })()
                                        : tierMode === 'tank' && columnGroup?.tankSortKey
                                          ? (() => {
                                              const k = columnGroup.tankSortKey
                                              if (k === 'overall') {
                                                const v =
                                                  e.tankCategoryScores?.overall ?? e.tankScore
                                                return v != null ? v.toFixed(2) : '…'
                                              }
                                              const d = e.tankEffectiveDisplay
                                              if (!d) return '…'
                                              if (k === 'hp')
                                                return Math.round(d.hp).toLocaleString()
                                              if (k === 'defense')
                                                return Math.round(d.defense).toLocaleString()
                                              if (k === 'evasion')
                                                return Math.round(d.evasion).toLocaleString()
                                              if (k === 'block')
                                                return Math.round(d.block).toLocaleString()
                                              return '…'
                                            })()
                                          : tierMode === 'healer' && columnGroup?.healerSortKey
                                            ? (() => {
                                                const k = columnGroup.healerSortKey
                                                if (k === 'general') {
                                                  const v =
                                                    e.healerCategoryScores?.general ??
                                                    e.healerScore
                                                  return v != null ? v.toFixed(2) : '…'
                                                }
                                                const m = e.healerDisplayMetrics
                                                if (!m) return '…'
                                                if (k === 'healing') return m.healHps.toFixed(1)
                                                if (k === 'shielding')
                                                  return m.shieldHps.toFixed(1)
                                                if (k === 'buffing')
                                                  return m.buffPctEquiv.toFixed(0)
                                                if (k === 'int')
                                                  return Math.round(m.intTotal).toLocaleString()
                                                return '…'
                                              })()
                                            : e.dps.toFixed(1)
                                    return (
                                      <li
                                        key={`${tier}-${role}-${e.id}`}
                                        className={`tier-entry ${
                                          status === 'incomplete'
                                            ? 'tier-entry-incomplete'
                                            : status === 'complete'
                                              ? 'tier-entry-complete'
                                              : 'tier-entry-unknown'
                                        }`}
                                        style={{ borderColor: digimonStageBorderColor(e.stage) }}
                                      >
                                        <Link
                                          to={`/digimon/${encodeURIComponent(e.id)}`}
                                          className="tier-entry-link"
                                          title={e.name}
                                        >
                                          {icon ? (
                                            <span className="tier-entry-thumb-wrap">
                                              <img src={icon} alt="" loading="lazy" />
                                            </span>
                                          ) : (
                                            <span className="tier-entry-fallback">{e.name.slice(0, 2)}</span>
                                          )}
                                          <span className="tier-entry-name">{e.name}</span>
                                          <span className="tier-entry-dps-wrap">
                                            <span className="tier-entry-dps">{scoreLabel}</span>
                                            {e.communityRotationAuthor && tierMode === 'dps' ? (
                                              <span
                                                className="tier-community-badge"
                                                title={`Community rotation by ${e.communityRotationAuthor}`}
                                                aria-label={`Community rotation by ${e.communityRotationAuthor}`}
                                              >
                                                ★
                                              </span>
                                            ) : null}
                                            <span
                                              className={`tier-status-dot ${
                                                status === 'incomplete'
                                                  ? 'tier-status-dot-incomplete'
                                                  : status === 'complete'
                                                    ? 'tier-status-dot-complete'
                                                    : 'tier-status-dot-unknown'
                                              }`}
                                              title={
                                                status === 'unknown'
                                                  ? 'Status pending (run Update tier list)'
                                                  : contentStatusLabel(status)
                                              }
                                              aria-label={
                                                status === 'unknown'
                                                  ? 'Status pending (run Update tier list)'
                                                  : contentStatusLabel(status)
                                              }
                                            />
                                          </span>
                                        </Link>
                                      </li>
                                    )
                                  })}
                                </ul>
                              )}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

