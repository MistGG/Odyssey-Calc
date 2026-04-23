import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { fetchDigimonDetail } from '../api/digimonService'
import { computeDpsAoeCategoryScores } from '../lib/aoeTierScore'
import { BURST_DPS_WINDOW_SEC, computeDpsSpecializedScore } from '../lib/dpsTierScore'
import { DEFAULT_ROTATION_SIM_DURATION_SEC, simulateRotation } from '../lib/dpsSim'
import { computeHealerTierScore } from '../lib/healerTierScore'
import { computeTankTierScore } from '../lib/tankTierScore'
import { getDigimonContentStatus, type DigimonContentStatus } from '../lib/contentStatus'
import {
  buildTierGroups,
  createEmptyTierListCache,
  DPS_TIER_MATRIX_COLUMN_LABELS,
  loadTierListCache,
  saveTierListCache,
  tierEntryDpsCategoryScoresComplete,
  tierEntryIsStaleForDetailFetch,
  TIER_SUPPORT_SCORE_REVISION,
  type BuildTierGroupsOptions,
  type DpsTierCategoryKey,
  type SustainedDpsEntry,
  type TierListCache,
  type TierListMode,
} from '../lib/tierList'
import { tierSkillsSignature } from '../lib/tierSkillsSignature'
import {
  WIKI_ATTRIBUTE_OPTIONS,
  WIKI_ELEMENT_OPTIONS,
  WIKI_FAMILY_OPTIONS,
} from '../lib/wikiListFacetOptions'
import type { WikiDigimonListItem } from '../types/wikiApi'
import {
  buildTierListUpdateSummary,
  COOLDOWN_EVERY_N_REQUESTS,
  fetchAllDigimonIndex,
  levelMapForSkills,
  loadTierUpdateSummaryFromStorage,
  RATE_LIMIT_COOLDOWN_MS,
  readDpsTierCategory,
  readTierListMode,
  readTierUpdatePanelMinimized,
  REQUEST_DELAY_MS,
  saveTierUpdateSummaryToStorage,
  sleep,
  writeDpsTierCategory,
  writeTierListMode,
  writeTierUpdatePanelMinimized,
  type TierListUpdateSummary,
  type TierListUpdateSummaryTabKey,
} from './tierList/tierListModel'
import { TierListMatrixTable } from './tierList/TierListMatrixTable'
import { TierListModeHeader } from './tierList/TierListModeHeader'
import { TierListScoringNotes } from './tierList/TierListScoringNotes'
import { TierListUpdateControls } from './tierList/TierListUpdateControls'
import { TierListUpdateSummaryPanel } from './tierList/TierListUpdateSummaryPanel'

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

  function setTierModePersist(next: TierListMode) {
    setTierMode(next)
    writeTierListMode(next)
  }

  function setDpsTierCategoryPersist(next: DpsTierCategoryKey) {
    setDpsTierCategory(next)
    writeDpsTierCategory(next)
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
            entry.supportScoreRevision !== TIER_SUPPORT_SCORE_REVISION
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

        try {
          const detail = await fetchDigimonDetail(id)
          const levels = levelMapForSkills(detail.skills)
          const sim = simulateRotation(
            detail.skills,
            levels,
            DEFAULT_ROTATION_SIM_DURATION_SEC,
            1,
            detail.attack,
            detail.stats?.atk_speed ?? 0,
            detail.stats?.crit_rate ?? 0,
            {
              role: detail.role,
              hybridStance: 'best',
            },
          )
          const simBurst = simulateRotation(
            detail.skills,
            levels,
            BURST_DPS_WINDOW_SEC,
            1,
            detail.attack,
            detail.stats?.atk_speed ?? 0,
            detail.stats?.crit_rate ?? 0,
            {
              role: detail.role,
              hybridStance: 'best',
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
        if (
          processed > 0 &&
          processed % COOLDOWN_EVERY_N_REQUESTS === 0 &&
          working.queue.length > 0
        ) {
          const cdTotal =
            initialBuildQueueTotal > 0 ? initialBuildQueueTotal : working.queue.length
          const cdDone =
            initialBuildQueueTotal > 0
              ? Math.min(initialBuildQueueTotal, initialBuildQueueTotal - working.queue.length)
              : 0
          setStatus(
            `Cooling down for ${Math.ceil(RATE_LIMIT_COOLDOWN_MS / 1000)}s to avoid rate limits… (${cdDone}/${cdTotal || 1})`,
          )
          await sleep(RATE_LIMIT_COOLDOWN_MS)
        } else {
          await sleep(REQUEST_DELAY_MS)
        }
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
  ])

  const entriesForMatrix = useMemo(() => {
    if (tierMode === 'dps') return filteredEntries
    const out: Record<string, SustainedDpsEntry> = {}
    for (const [id, e] of Object.entries(filteredEntries)) {
      const r = (e.role || '').trim()
      if (tierMode === 'tank' && r === 'Tank') out[id] = e
      if (tierMode === 'healer' && r === 'Support') out[id] = e
    }
    return out
  }, [filteredEntries, tierMode])

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
    return Object.values(entriesForMatrix).some((e) => !tierEntryDpsCategoryScoresComplete(e))
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
  const matrixHeading = useMemo(() => {
    if (tierMode === 'dps') {
      return dpsTierCategory === 'aoe'
        ? 'DPS tier list — AoE (General / Damage / Cooldown / Radius)'
        : `DPS tier list — ${DPS_TIER_MATRIX_COLUMN_LABELS[dpsTierCategory]}`
    }
    if (tierMode === 'tank') return 'Tank tier list'
    return 'Healer tier list'
  }, [tierMode, dpsTierCategory])

  return (
    <div className="lab tier-page">
      <TierListModeHeader
        tierMode={tierMode}
        setTierModePersist={setTierModePersist}
        dpsTierCategory={dpsTierCategory}
        setDpsTierCategoryPersist={setDpsTierCategoryPersist}
      />
      <TierListUpdateControls
        status={status}
        progressNumerator={progressNumerator}
        progressDenominator={progressDenominator}
        progress={progress}
        showProgressBar={showProgressBar}
        fadeProgressBar={fadeProgressBar}
        lastCheckedAt={cache?.lastCheckedAt}
        initializing={initializing}
        building={building}
        buildMode={buildMode}
        cache={cache}
        error={error}
        onUpdateIncremental={() => void updateTierList('incremental')}
        onUpdateForce={() => void updateTierList('force')}
      />
      {updateSummary ? (
        <TierListUpdateSummaryPanel
          updateSummary={updateSummary}
          updatePanelMinimized={updatePanelMinimized}
          toggleUpdatePanelMinimized={toggleUpdatePanelMinimized}
          onDismiss={() => {
            setUpdateSummary(null)
            saveTierUpdateSummaryToStorage(null)
          }}
          updateSummarySections={updateSummarySections}
          effectiveUpdateSummaryTab={effectiveUpdateSummaryTab}
          setUpdateSummaryTab={setUpdateSummaryTab}
        />
      ) : null}
      {cache && !initializing && checkedCount > 0 ? (
        <section className="lab-result tier-matrix-section">
          <h3>{matrixHeading}</h3>
          <TierListScoringNotes
            tierMode={tierMode}
            dpsScoresStale={dpsScoresStale}
            tankScoresStale={tankScoresStale}
            healerScoresStale={healerScoresStale}
          />
          <TierListMatrixTable
            tierMode={tierMode}
            dpsTierCategory={dpsTierCategory}
            roles={roles}
            byRole={byRole}
            listMeta={listMeta}
            stageOptions={stageOptions}
            attributeOptions={attributeOptions}
            elementOptions={elementOptions}
            familyOptions={familyOptions}
            selectedStages={selectedStages}
            selectedAttributes={selectedAttributes}
            selectedElements={selectedElements}
            selectedFamilies={selectedFamilies}
            toggleMultiFilter={toggleMultiFilter}
            setSelectedStages={setSelectedStages}
            setSelectedAttributes={setSelectedAttributes}
            setSelectedElements={setSelectedElements}
            setSelectedFamilies={setSelectedFamilies}
          />
        </section>
      ) : null}
    </div>
  )
}

