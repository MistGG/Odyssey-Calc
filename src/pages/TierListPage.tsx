import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Link } from 'react-router-dom'
import { fetchDigimonDetail } from '../api/digimonService'
import { computeDpsAoeCategoryScores } from '../lib/aoeTierScore'
import { BURST_DPS_WINDOW_SEC, computeDpsSpecializedScore } from '../lib/dpsTierScore'
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
  tierEntryIsStaleForDetailFetch,
  tierEntryNeedsDpsSimRefresh,
  TIER_SUPPORT_SCORE_REVISION,
  type BuildTierGroupsOptions,
  type DpsTierCategoryKey,
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
import type { WikiDigimonListItem } from '../types/wikiApi'
import {
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
  writeTierIgnoreIncomplete,
  writeTierListMode,
  writeTierUpdatePanelMinimized,
  type TierListUpdateSummary,
  type TierListUpdateSummaryTabKey,
} from './tierList/tierListModel'

/** After this many ms on one Digimon, append a reassurance line (heavy DPS sims can block the UI). */
const TIER_UPDATE_SLOW_HINT_MS = 5_000

const WIKI_ATTR_STRINGS = WIKI_ATTRIBUTE_OPTIONS as readonly string[]
const WIKI_EL_STRINGS = WIKI_ELEMENT_OPTIONS as readonly string[]
const WIKI_FAMILY_STRINGS = WIKI_FAMILY_OPTIONS as readonly string[]

export function TierListPage() {
  const [cache, setCache] = useState<TierListCache | null>(null)
  const [listMeta, setListMeta] = useState<Record<string, WikiDigimonListItem>>({})
  const [initializing, setInitializing] = useState(true)
  const [building, setBuilding] = useState(false)
  const [buildMode, setBuildMode] = useState<'incremental' | 'force'>('incremental')
  const [status, setStatus] = useState<string>('Preparing tier list cache…')
  const [error, setError] = useState<string | null>(null)
  const [autoStarted, setAutoStarted] = useState(false)
  /** Empty = show all. Otherwise OR-filter by listed values (multi-select). */
  const [selectedStages, setSelectedStages] = useState<string[]>([])
  const [selectedAttributes, setSelectedAttributes] = useState<string[]>([])
  const [selectedElements, setSelectedElements] = useState<string[]>([])
  const [selectedFamilies, setSelectedFamilies] = useState<string[]>([])
  const [showProgressBar, setShowProgressBar] = useState(true)
  const [fadeProgressBar, setFadeProgressBar] = useState(false)
  const sawIncompleteProgress = useRef(false)
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
          setStatus('Tier cache initialized. Press Update to build slowly.')
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
  }, [])

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

  async function updateTierList(mode: 'incremental' | 'force' = 'incremental') {
    if (!cache || building || initializing) return
    setBuilding(true)
    setBuildMode(mode)
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

      setStatus('Checking index for updates…')
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
      // Migration safety: if signatures were not present in an older cache,
      // baseline them now so incremental mode does not force a full rebuild.
      if (!hadPriorSignatures && mode === 'incremental') {
        working.listSignatures = { ...signatures }
      }

      const changedOrMissing = all
        .map((d) => d.id)
        .filter((id) => {
          const entry = working.entries[id]
          return (
            (hadPriorSignatures && working.listSignatures[id] !== signatures[id]) ||
            !entry ||
            !entry.status ||
            tierEntryIsStaleForDetailFetch(entry) ||
            entry.supportScoreRevision !== TIER_SUPPORT_SCORE_REVISION ||
            tierEntryNeedsDpsSimRefresh(entry) ||
            tierEntryNeedsAutoCritScores(entry) ||
            tierEntryNeedsPerfectAtCloneScores(entry) ||
            tierEntryNeedsAnimationCancelScores(entry)
          )
        })
      const carryOverQueue = working.queue.filter((id) => latestIds.has(id))
      const plannedQueue =
        mode === 'force'
          ? all.map((d) => d.id)
          : [...new Set([...carryOverQueue, ...changedOrMissing])]

      working.queue = plannedQueue
      const initialBuildQueueTotal = plannedQueue.length
      setTierBuildQueueTotal(initialBuildQueueTotal > 0 ? initialBuildQueueTotal : null)
      if (mode === 'force' || hadPriorSignatures) {
        working.listSignatures = signatures
      }
      working.lastCheckedAt = new Date().toISOString()
      saveTierListCache(working)
      setCache({
        ...working,
        queue: [...working.queue],
        entries: { ...working.entries },
        listSignatures: { ...working.listSignatures },
      })

      if (working.queue.length === 0) {
        setStatus('Tier list is already up to date. No changed Digimon found.')
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
        setStatus(
          mode === 'force'
            ? `Force checking all… ${runDone}/${runTotalForMsg} (checking ${meta?.name ?? id})`
            : `Updating tier list… ${runDone}/${runTotalForMsg} (checking ${meta?.name ?? id})`,
        )

        if (backoffMs > 0) {
          const runTotal = runTotalForMsg
          setStatus(
            `Rate limit cooldown (${Math.ceil(backoffMs / 1000)}s)… then resuming at ${runDone}/${runTotal || 1}.`,
          )
          await sleep(backoffMs)
          backoffMs = 0
        }

        const checkingLabel = meta?.name ?? id
        const slowHintSuffix = ' (Taking longer than expected — please wait.)'
        const slowStatusLine =
          mode === 'force'
            ? `Force checking all… ${runDone}/${runTotalForMsg} (checking ${checkingLabel})${slowHintSuffix}`
            : `Updating tier list… ${runDone}/${runTotalForMsg} (checking ${checkingLabel})${slowHintSuffix}`
        const slowHintTimer = window.setTimeout(() => {
          setStatus(slowStatusLine)
        }, TIER_UPDATE_SLOW_HINT_MS)

        try {
          try {
            const detail = await fetchDigimonDetail(id)
          const levels = levelMapForSkills(detail.skills)
          const runComparableSim = (
            durationSec: number,
            options?: {
              forceAutoCrit?: boolean
              perfectAtClone?: boolean
              autoAttackAnimationCancel?: boolean
            },
          ) => {
            const cfg = buildComparableRotationConfig(detail, durationSec, 1, options)
            return simulateRotation(
              detail.skills,
              levels,
              cfg.durationSec,
              cfg.targets,
              cfg.baseAttack,
              cfg.attackSpeed,
              cfg.baseCritRateStat,
              cfg.options,
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
          const specializedScore = computeDpsSpecializedScore(detail)
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
              specialized: specializedScore,
            },
            dpsCategoryScoresAutoCrit: {
              sustained: simAutoCrit.dps,
              burst: simBurstAutoCrit.dps,
              specialized: specializedScore,
            },
            dpsCategoryScoresPerfectAtClone: {
              sustained: simPerfectAtClone.dps,
              burst: simBurstPerfectAtClone.dps,
              specialized: specializedScore,
            },
            dpsCategoryScoresPerfectAtCloneAutoCrit: {
              sustained: simPerfectAtCloneAutoCrit.dps,
              burst: simBurstPerfectAtCloneAutoCrit.dps,
              specialized: specializedScore,
            },
            dpsCategoryScoresAnimationCancel: {
              sustained: simAnimationCancel.dps,
              burst: simBurstAnimationCancel.dps,
              specialized: specializedScore,
            },
            dpsCategoryScoresAnimationCancelAutoCrit: {
              sustained: simAnimationCancelAutoCrit.dps,
              burst: simBurstAnimationCancelAutoCrit.dps,
              specialized: specializedScore,
            },
            dpsCategoryScoresPerfectAtCloneAnimationCancel: {
              sustained: simPerfectAtCloneAnimationCancel.dps,
              burst: simBurstPerfectAtCloneAnimationCancel.dps,
              specialized: specializedScore,
            },
            dpsCategoryScoresPerfectAtCloneAnimationCancelAutoCrit: {
              sustained: simPerfectAtCloneAnimationCancelAutoCrit.dps,
              burst: simBurstPerfectAtCloneAnimationCancelAutoCrit.dps,
              specialized: specializedScore,
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
        setStatus(
          mode === 'force'
            ? 'Force check complete. All Digimon were recalculated.'
            : 'Tier list update complete. Changed Digimon were refreshed.',
        )
        if (refreshedIds.size > 0) {
          const nextSummary = buildTierListUpdateSummary(
            mode,
            snapshotBefore,
            working.entries,
            refreshedIds,
          )
          setUpdateSummary(nextSummary)
          saveTierUpdateSummaryToStorage(nextSummary)
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Tier update failed.')
    } finally {
      setBuilding(false)
      setBuildMode('incremental')
      setTierBuildQueueTotal(null)
    }
  }

  const checkedCount = cache ? Object.keys(cache.entries).length : 0
  const total = cache?.total ?? 0
  const runTotal = tierBuildQueueTotal
  /** Set when a build has a non-empty planned queue; pairs with `cache.queue` for the bar. */
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
  const tierBuildComplete = Boolean(cache && total > 0 && cache.queue.length === 0 && checkedCount >= total)
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

  const entriesForMatrix = useMemo(() => {
    if (tierMode === 'dps') {
      if (dpsTierCategory === 'aoe') return filteredEntries
      if (!dpsForceAutoCrit && !dpsPerfectAtClone && !dpsAutoAnimCancel) return filteredEntries
      const out: Record<string, SustainedDpsEntry> = {}
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

  useEffect(() => {
    if (autoStarted || initializing || building || !cache) return
    if (Object.keys(cache.entries).length === 0 && cache.queue.length > 0) {
      setAutoStarted(true)
      void updateTierList()
    }
  }, [autoStarted, building, cache, initializing])

  useEffect(() => {
    if (!cache || total <= 0) {
      setShowProgressBar(true)
      setFadeProgressBar(false)
      sawIncompleteProgress.current = false
      return
    }

    if (!tierBuildComplete) {
      sawIncompleteProgress.current = true
      setShowProgressBar(true)
      setFadeProgressBar(false)
      return
    }

    // On refresh when cache is already complete, hide immediately.
    if (!sawIncompleteProgress.current) {
      setShowProgressBar(false)
      setFadeProgressBar(false)
      return
    }

    setShowProgressBar(true)
    setFadeProgressBar(true)
    const t = window.setTimeout(() => {
      setShowProgressBar(false)
    }, 900)
    return () => {
      window.clearTimeout(t)
    }
  }, [cache, tierBuildComplete, total])

  return (
    <div className="lab tier-page">
      <div className="tier-page-head">
        <h1>Tier lists</h1>
        <div className="tier-page-head-controls">
          <div className="tier-mode-tabs" role="tablist" aria-label="Tier list type">
            <button
              type="button"
              role="tab"
              className="tier-mode-tab"
              aria-selected={tierMode === 'dps'}
              onClick={() => setTierModePersist('dps')}
            >
              DPS (all roles)
            </button>
            <button
              type="button"
              role="tab"
              className="tier-mode-tab"
              aria-selected={tierMode === 'tank'}
              onClick={() => setTierModePersist('tank')}
            >
              Tank
            </button>
            <button
              type="button"
              role="tab"
              className="tier-mode-tab"
              aria-selected={tierMode === 'healer'}
              onClick={() => setTierModePersist('healer')}
            >
              Healer
            </button>
          </div>
          {tierMode === 'dps' ? (
            <div
              className="tier-mode-tabs tier-submode-tabs"
              role="tablist"
              aria-label="DPS ranking metric"
            >
              {DPS_TIER_CATEGORY_ORDER.map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  className="tier-mode-tab"
                  aria-selected={dpsTierCategory === key}
                  onClick={() => setDpsTierCategoryPersist(key)}
                >
                  {DPS_TIER_MATRIX_COLUMN_LABELS[key]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="tier-wip-note tier-wip-note-wide" role="note">
        <p>
          <strong>Disclaimer:</strong> The tier list is now in a stable state as DPS formulas should be more accurate and automatic
          rotations have been further optimized with feedback.
        </p>
        <p>
          ASB, Attributes, Variance damage and latency are not considered at this time. If you feel something
          is out of place, please contact Mist on the Digital Odyssey Discord.
        </p>
      </div>

      <section className="lab-result">
        <h3>Update tier list</h3>
        <p className="muted">{status}</p>
        <p>
          Progress:{' '}
          <strong>
            {progressNumerator}/{progressDenominator || '…'} ({progress.toFixed(1)}%)
          </strong>
        </p>
        {showProgressBar && (
          <div className={`tier-progress ${fadeProgressBar ? 'tier-progress-fade' : ''}`}>
            <div className="tier-progress-bar" style={{ width: `${progress}%` }} />
          </div>
        )}
        <p className="muted">
          Last checked:{' '}
          {cache?.lastCheckedAt
            ? new Date(cache.lastCheckedAt).toLocaleString()
            : 'Never'}
        </p>
        <button
          type="button"
          className="tier-update-btn"
          disabled={initializing || building || !cache}
          onClick={() => void updateTierList('incremental')}
        >
          {building && buildMode === 'incremental'
            ? 'Updating changed Digimon…'
            : 'Update tier list'}
        </button>
        <button
          type="button"
          className="tier-update-btn tier-update-btn-secondary"
          disabled={initializing || building || !cache}
          onClick={() => void updateTierList('force')}
        >
          {building && buildMode === 'force' ? 'Force checking all…' : 'Force check all'}
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>

      <section
        className="lab-result tier-special-modifiers"
        aria-labelledby="tier-special-modifiers-heading"
      >
        <h3 id="tier-special-modifiers-heading">Special modifiers</h3>
        {tierMode === 'dps' ? (
          <>
            <p className="muted">Optional tweaks for DPS tier simulations.</p>
            <div className="tier-special-modifiers-list">
              <label
                className={`tier-auto-crit-toggle tier-special-modifier-toggle${
                  dpsTierCategory === 'aoe' ? ' tier-auto-crit-toggle-disabled' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={dpsForceAutoCrit}
                  onChange={(e) => setDpsForceAutoCritPersist(e.target.checked)}
                  disabled={dpsTierCategory === 'aoe'}
                />
                Guaranteed Crit
              </label>
              <label
                className={`tier-auto-crit-toggle tier-special-modifier-toggle${
                  dpsTierCategory === 'aoe' ? ' tier-auto-crit-toggle-disabled' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={dpsPerfectAtClone}
                  onChange={(e) => setDpsPerfectAtClonePersist(e.target.checked)}
                  disabled={dpsTierCategory === 'aoe'}
                />
                Perfect AT clone
              </label>
              <label
                className={`tier-auto-crit-toggle tier-special-modifier-toggle${
                  dpsTierCategory === 'aoe' ? ' tier-auto-crit-toggle-disabled' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={dpsAutoAnimCancel}
                  onChange={(e) => setDpsAutoAnimCancelPersist(e.target.checked)}
                  disabled={dpsTierCategory === 'aoe'}
                />
                Auto attack animation cancelling (Special thanks to Yvelchrome for bringing this to my attention and testing it!)
              </label>
            </div>
          </>
        ) : (
          <p className="muted">These options apply when the DPS tier list is selected.</p>
        )}
      </section>

      {updateSummary && (
        <section
          className="lab-result tier-update-summary"
          aria-label="Last tier list update summary"
        >
          <div className="tier-update-summary-head">
            <div className="tier-update-summary-head-text">
              <h3>Last update</h3>
              {!updatePanelMinimized && (
                <p className="muted tier-update-summary-meta">
                  {new Date(updateSummary.finishedAt).toLocaleString()}
                  {' · '}
                  {updateSummary.mode === 'force' ? 'Force check' : 'Incremental update'}
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

      {cache && !initializing && checkedCount > 0 && (
        <section className="lab-result tier-matrix-section">
          <h3>
            {tierMode === 'dps'
              ? dpsTierCategory === 'aoe'
                ? 'DPS tier list — AoE (General / Damage / Cooldown / Farming)'
                : `DPS tier list — ${DPS_TIER_MATRIX_COLUMN_LABELS[dpsTierCategory]}`
              : tierMode === 'tank'
                ? 'Tank tier list'
                : 'Healer tier list'}
          </h3>
          {tierMode === 'dps' ? (
            <>
              <details className="tier-score-explainer">
                <summary>DPS Scoring</summary>
                <div className="tier-score-explainer-body">
                  <ul className="tier-score-explainer-list">
                    <li>
                      <strong>Sustained:</strong> same simulation as Lab default — greedy rotation over{' '}
                      {DEFAULT_ROTATION_SIM_DURATION_SEC}s, Hybrid defaults to melee stance.
                    </li>
                    <li>
                      <strong>Burst ({BURST_DPS_WINDOW_SEC}s):</strong> same rotation rules with a shorter
                      horizon (openers / short burst bias).
                    </li>
                    <li>
                      <strong>AoE:</strong> choose the <strong>AoE</strong> sub-tab to open a four-column Tier List
                      (General, Damage, Cooldown, Farming). Only skills with wiki <code>radius</code> &gt; 0 (same as
                      the AOE tag on the detail page). <strong>Damage</strong> column: <code>log1p</code> of summed
                      per-cast damage; <strong>Cooldown</strong>: <code>log1p</code> of summed{' '}
                      <code>1 / (cast + cooldown)</code>. <strong>Farming</strong> assumes packs respawn about every
                      8s: each AoE line contributes damage (plus a small cast-density bonus) times a{' '}
                      <strong>respawn fit</strong> weight <code>exp(-max(0, period - 8) / 8)</code> for{' '}
                      <code>period = cast + cooldown</code>, times a light <code>log1p(radius)</code> coverage factor.
                      Support-only AoE uses a smaller area+cadence term instead of damage. <strong>General</strong> is
                      the average of Damage, Cooldown, and Farming (equal weight).
                    </li>
                    <li>
                      <strong>Specialized:</strong> <code>log1p(DEX/120 + 6×groupBuffSignals)</code>. A &quot;group
                      buff&quot; signal is any support-only skill (no damage scaling) with wiki radius &gt; 0
                      and/or party/allies/group-style wording in skill or buff text.
                    </li>
                  </ul>
                </div>
              </details>
              {dpsScoresStale && (
                <p className="tier-stale-note" role="status">
                  Some rows need a DPS refresh (missing category scores or an older rotation sim).
                  Run <strong>Update tier list</strong> (or <strong>Force check all</strong>) to recalculate.
                </p>
              )}
            </>
          ) : null}
          {tierMode === 'tank' ? (
            <>
              <details className="tier-score-explainer">
                <summary>Tank Scoring</summary>
                <div className="tier-score-explainer-body">
                  <ul className="tier-score-explainer-list">
                    <li>
                      Parses skill/buff text and numbers, mixes in base stats; used only to order rows.
                    </li>
                    <li>
                      Base HP (~65%): wiki combat max HP — main tankiness signal.
                    </li>
                    <li>
                      Mitigation (~22%): damage reduction, shields, heals, Max HP% from skills — each
                      scaled by estimated uptime (buff duration ÷ cooldown+cast, max 100%; fallback if
                      duration missing).
                    </li>
                    <li>Defense (~9%): defense × 6, then scaled like HP (log1p(defenseRaw/1000)).</li>
                    <li>Avoidance (~4%): block + evasion (down-weighted).</li>
                    <li>
                      Combined with <code>log1p</code> so one huge value does not decide everything:{' '}
                      <code>
                        0.65·log1p(HP/1000) + 0.22·log1p(mit) + 0.09·log1p(def×6/1000) +
                        0.04·log1p(avoid)
                      </code>
                      .
                    </li>
                    <li>
                      S/A/B/C: same cutoffs as DPS (~10% / ~20% / ~30% / rest) within each column among
                      filtered Tanks (order differs per column).
                    </li>
                    <li>
                      <strong>Overall</strong> is a calculation of all parameters.{' '}
                      <strong>Effective HP / Defense / Evasion / Block</strong> columns show wiki base plus
                      uptime-weighted parsed buffs to that stat (same linear sum the column sort is derived
                      from, before <code>log1p</code>). <strong>Effective HP</strong> also adds self-shields:
                      parsed barrier size per cast (with tick counts for multi-tick shields) times the same
                      estimated buff uptime.
                    </li>
                    <li>
                      Limits: imperfect text parsing; no party vs self, overheal, or enemy modeling.
                      Refresh scores after wiki changes via Update tier list.
                    </li>
                  </ul>
                </div>
              </details>
              {tankScoresStale && (
                <p className="tier-stale-note" role="status">
                  Some rows are missing tank scores. Run <strong>Update tier list</strong> (or{' '}
                  <strong>Force check all</strong>) to recalculate.
                </p>
              )}
            </>
          ) : null}
          {tierMode === 'healer' ? (
            <>
              <details className="tier-score-explainer">
                <summary>Healer Scoring</summary>
                <div className="tier-score-explainer-body">
                  <ul className="tier-score-explainer-list">
                    <li>
                      Healing (~74%): Each skill with heal text contributes HP per cast ÷ (cooldown +
                      cast, min 0.75s). Per cast: % lines use this Digimon&apos;s max HP as the scale;
                      flat lines use the number as-is. Those rates are summed across heal skills
                      (simple sustain, not a full rotation solver).
                    </li>
                    <li>
                      Shields and damage reduction (~16%): barriers and DR only (healing not counted
                      again here), still using buff uptime vs cooldown.
                    </li>
                    <li>
                      Damage buffs (~7%): skill damage, ATK%, crit, attack speed, flat ATK × uptime.
                    </li>
                    <li>INT (~3%): small tie-breaker from wiki combat stats.</li>
                    <li>
                      Blend with <code>log1p</code>:{' '}
                      <code>
                        0.74·log1p(heal/s) + 0.16·log1p(mit) + 0.07·log1p(buff) + 0.03·log1p(INT)
                      </code>
                      .
                    </li>
                    <li>
                      S/A/B/C: same cutoffs as DPS within each column among filtered Support rows (order
                      differs per column).
                    </li>
                    <li>
                      <strong>Overall</strong> is a calculation of all parameters. <strong>Healing</strong>{' '}
                      shows modeled HPS; <strong>Shielding</strong> shows modeled SPS (barrier HP per cast ÷
                      cooldown+cast, summed across shield skills — same value used to sort that column).{' '}
                      <strong>Buffing</strong> shows summed %-uptime (plus scaled flat ATK) from
                      offensive buff lines — a rough &quot;how much damage buff&quot; footprint, not in-game
                      DPS. <strong>INT</strong> is wiki combat INT.
                    </li>
                    <li>
                      Limits: adding all heal skills can overstate if they share one GCD; HoTs, targets,
                      DS heals, passives not modeled; odd skill text may parse wrong.
                    </li>
                  </ul>
                </div>
              </details>
              {healerScoresStale && (
                <p className="tier-stale-note" role="status">
                  Some rows are missing healer scores. Run <strong>Update tier list</strong> (or{' '}
                  <strong>Force check all</strong>) to recalculate.
                </p>
              )}
            </>
          ) : null}
          <div className="tier-status-legend" role="note" aria-label="Status criteria">
            <span className="tier-status-legend-item">
              <span className="tier-status-dot tier-status-dot-complete" aria-hidden="true" />
              <span>{contentStatusLabel('complete')}</span>
            </span>
            <span className="tier-status-legend-item">
              <span className="tier-status-dot tier-status-dot-incomplete" aria-hidden="true" />
              <span>{contentStatusLabel('incomplete')}</span>
            </span>
            <span className="muted">
              Incomplete if skills &lt; 5 or any skill name contains “placeholder”.
            </span>
          </div>
          <div className="tier-filter-panel">
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
                                <span className="muted">—</span>
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
                                            return v != null ? v.toFixed(2) : '…'
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
                                                    : k === 'specialized'
                                                      ? s?.specialized
                                                      : undefined
                                              if (v == null) return '…'
                                              return k === 'specialized' ? v.toFixed(2) : v.toFixed(1)
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

