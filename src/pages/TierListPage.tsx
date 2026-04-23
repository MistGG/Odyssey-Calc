import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Link } from 'react-router-dom'
import { fetchDigimonDetail, fetchDigimonPage } from '../api/digimonService'
import { DEFAULT_ROTATION_SIM_DURATION_SEC, simulateRotation } from '../lib/dpsSim'
import { computeHealerTierScore } from '../lib/healerTierScore'
import { computeTankTierScore } from '../lib/tankTierScore'
import { digimonPortraitUrl } from '../lib/digimonImage'
import { digimonStageBorderColor, digimonStageTierFilterStyle } from '../lib/digimonStage'
import {
  contentStatusLabel,
  getDigimonContentStatus,
  type DigimonContentStatus,
} from '../lib/contentStatus'
import {
  buildTierGroups,
  createEmptyTierListCache,
  loadTierListCache,
  saveTierListCache,
  tierEntryIsStaleForDetailFetch,
  type SustainedDpsEntry,
  type TierListCache,
  type TierListMode,
} from '../lib/tierList'
import { tierSkillsSignature } from '../lib/tierSkillsSignature'
import { WIKI_ATTRIBUTE_OPTIONS, WIKI_ELEMENT_OPTIONS } from '../lib/wikiListFacetOptions'
import type { WikiDigimonListItem } from '../types/wikiApi'

const WIKI_ATTR_STRINGS = WIKI_ATTRIBUTE_OPTIONS as readonly string[]
const WIKI_EL_STRINGS = WIKI_ELEMENT_OPTIONS as readonly string[]

const REQUEST_DELAY_MS = 700
const COOLDOWN_EVERY_N_REQUESTS = 50
/** Proactive pause every N requests and backoff after HTTP 429 (tier list detail fetches). */
const RATE_LIMIT_COOLDOWN_MS = 10_000

const TIER_UPDATE_PANEL_MINIMIZED_KEY = 'odysseyCalc.tierUpdatePanel.minimized.v1'
const TIER_UPDATE_SUMMARY_STORAGE_KEY = 'odysseyCalc.tierUpdateSummary.v1'
const TIER_LIST_MODE_KEY = 'odysseyCalc.tierList.mode.v1'
const TIER_DPS_CHANGE_EPS = 0.05
const TIER_TANK_SCORE_CHANGE_EPS = 0.02
const TIER_HEALER_SCORE_CHANGE_EPS = 0.02

type TierListUpdateSummary = {
  finishedAt: string
  mode: 'incremental' | 'force'
  refreshedCount: number
  dpsUp: Array<{
    id: string
    name: string
    role: string
    before: number
    after: number
    delta: number
  }>
  dpsDown: Array<{
    id: string
    name: string
    role: string
    before: number
    after: number
    delta: number
  }>
  dpsNew: Array<{ id: string; name: string; role: string; after: number }>
  statusChanges: Array<{
    id: string
    name: string
    role: string
    from: DigimonContentStatus | undefined
    to: DigimonContentStatus
  }>
  tankUp: Array<{
    id: string
    name: string
    role: string
    before: number
    after: number
    delta: number
  }>
  tankDown: Array<{
    id: string
    name: string
    role: string
    before: number
    after: number
    delta: number
  }>
  tankNew: Array<{ id: string; name: string; role: string; after: number }>
  healerUp: Array<{
    id: string
    name: string
    role: string
    before: number
    after: number
    delta: number
  }>
  healerDown: Array<{
    id: string
    name: string
    role: string
    before: number
    after: number
    delta: number
  }>
  healerNew: Array<{ id: string; name: string; role: string; after: number }>
}

function readTierUpdatePanelMinimized(): boolean {
  try {
    return localStorage.getItem(TIER_UPDATE_PANEL_MINIMIZED_KEY) === '1'
  } catch {
    return false
  }
}

function writeTierUpdatePanelMinimized(minimized: boolean) {
  try {
    localStorage.setItem(TIER_UPDATE_PANEL_MINIMIZED_KEY, minimized ? '1' : '0')
  } catch {
    /* ignore quota / private mode */
  }
}

function readTierListMode(): TierListMode {
  try {
    const v = localStorage.getItem(TIER_LIST_MODE_KEY)
    if (v === 'tank') return 'tank'
    if (v === 'healer') return 'healer'
  } catch {
    /* ignore */
  }
  return 'dps'
}

function writeTierListMode(mode: TierListMode) {
  try {
    localStorage.setItem(TIER_LIST_MODE_KEY, mode)
  } catch {
    /* ignore */
  }
}

function isTierListUpdateSummary(v: unknown): v is TierListUpdateSummary {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o.finishedAt === 'string' &&
    (o.mode === 'incremental' || o.mode === 'force') &&
    typeof o.refreshedCount === 'number' &&
    Array.isArray(o.dpsUp) &&
    Array.isArray(o.dpsDown) &&
    Array.isArray(o.dpsNew) &&
    Array.isArray(o.statusChanges)
  )
}

function normalizeTierUpdateSummary(parsed: TierListUpdateSummary): TierListUpdateSummary {
  return {
    ...parsed,
    tankUp: Array.isArray(parsed.tankUp) ? parsed.tankUp : [],
    tankDown: Array.isArray(parsed.tankDown) ? parsed.tankDown : [],
    tankNew: Array.isArray(parsed.tankNew) ? parsed.tankNew : [],
    healerUp: Array.isArray(parsed.healerUp) ? parsed.healerUp : [],
    healerDown: Array.isArray(parsed.healerDown) ? parsed.healerDown : [],
    healerNew: Array.isArray(parsed.healerNew) ? parsed.healerNew : [],
  }
}

function loadTierUpdateSummaryFromStorage(): TierListUpdateSummary | null {
  try {
    const raw = localStorage.getItem(TIER_UPDATE_SUMMARY_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isTierListUpdateSummary(parsed) ? normalizeTierUpdateSummary(parsed) : null
  } catch {
    return null
  }
}

function saveTierUpdateSummaryToStorage(summary: TierListUpdateSummary | null) {
  try {
    if (!summary) {
      localStorage.removeItem(TIER_UPDATE_SUMMARY_STORAGE_KEY)
      return
    }
    localStorage.setItem(TIER_UPDATE_SUMMARY_STORAGE_KEY, JSON.stringify(summary))
  } catch {
    /* ignore */
  }
}

function formatTierStatus(s: DigimonContentStatus | undefined) {
  if (!s) return 'Pending'
  return contentStatusLabel(s)
}

function labHrefForTierEntry(id: string) {
  return `/lab?digimonId=${encodeURIComponent(id)}&duration=${DEFAULT_ROTATION_SIM_DURATION_SEC}`
}

function buildTierListUpdateSummary(
  mode: 'incremental' | 'force',
  snapshotBefore: Record<
    string,
    { dps: number; tankScore?: number; healerScore?: number; status?: DigimonContentStatus }
  >,
  entriesAfter: Record<string, SustainedDpsEntry>,
  refreshedIds: Set<string>,
): TierListUpdateSummary {
  const dpsUp: TierListUpdateSummary['dpsUp'] = []
  const dpsDown: TierListUpdateSummary['dpsDown'] = []
  const dpsNew: TierListUpdateSummary['dpsNew'] = []
  const tankUp: TierListUpdateSummary['tankUp'] = []
  const tankDown: TierListUpdateSummary['tankDown'] = []
  const tankNew: TierListUpdateSummary['tankNew'] = []
  const healerUp: TierListUpdateSummary['healerUp'] = []
  const healerDown: TierListUpdateSummary['healerDown'] = []
  const healerNew: TierListUpdateSummary['healerNew'] = []
  const statusChanges: TierListUpdateSummary['statusChanges'] = []

  for (const id of refreshedIds) {
    const after = entriesAfter[id]
    if (!after) continue
    const before = snapshotBefore[id]
    const roleTrim = (after.role || '').trim()
    if (before === undefined) {
      dpsNew.push({ id, name: after.name, role: after.role, after: after.dps })
      if (roleTrim === 'Tank') {
        tankNew.push({
          id,
          name: after.name,
          role: after.role,
          after: after.tankScore ?? 0,
        })
      }
      if (roleTrim === 'Support') {
        healerNew.push({
          id,
          name: after.name,
          role: after.role,
          after: after.healerScore ?? 0,
        })
      }
    } else {
      const delta = after.dps - before.dps
      if (delta > TIER_DPS_CHANGE_EPS) {
        dpsUp.push({
          id,
          name: after.name,
          role: after.role,
          before: before.dps,
          after: after.dps,
          delta,
        })
      } else if (delta < -TIER_DPS_CHANGE_EPS) {
        dpsDown.push({
          id,
          name: after.name,
          role: after.role,
          before: before.dps,
          after: after.dps,
          delta,
        })
      }

      if (roleTrim === 'Tank') {
        const ta = after.tankScore ?? 0
        const tb = before.tankScore ?? 0
        const tDelta = ta - tb
        if (tDelta > TIER_TANK_SCORE_CHANGE_EPS) {
          tankUp.push({
            id,
            name: after.name,
            role: after.role,
            before: tb,
            after: ta,
            delta: tDelta,
          })
        } else if (tDelta < -TIER_TANK_SCORE_CHANGE_EPS) {
          tankDown.push({
            id,
            name: after.name,
            role: after.role,
            before: tb,
            after: ta,
            delta: tDelta,
          })
        }
      }

      if (roleTrim === 'Support') {
        const ha = after.healerScore ?? 0
        const hb = before.healerScore ?? 0
        const hDelta = ha - hb
        if (hDelta > TIER_HEALER_SCORE_CHANGE_EPS) {
          healerUp.push({
            id,
            name: after.name,
            role: after.role,
            before: hb,
            after: ha,
            delta: hDelta,
          })
        } else if (hDelta < -TIER_HEALER_SCORE_CHANGE_EPS) {
          healerDown.push({
            id,
            name: after.name,
            role: after.role,
            before: hb,
            after: ha,
            delta: hDelta,
          })
        }
      }
    }
    const prevStatus = before?.status
    const nextStatus = after.status
    if (nextStatus !== undefined && prevStatus !== nextStatus) {
      statusChanges.push({
        id,
        name: after.name,
        role: after.role,
        from: prevStatus,
        to: nextStatus,
      })
    }
  }

  dpsUp.sort((a, b) => b.delta - a.delta)
  dpsDown.sort((a, b) => a.delta - b.delta)
  tankUp.sort((a, b) => b.delta - a.delta)
  tankDown.sort((a, b) => a.delta - b.delta)
  healerUp.sort((a, b) => b.delta - a.delta)
  healerDown.sort((a, b) => a.delta - b.delta)
  statusChanges.sort((a, b) => a.name.localeCompare(b.name))

  return {
    finishedAt: new Date().toISOString(),
    mode,
    refreshedCount: refreshedIds.size,
    dpsUp,
    dpsDown,
    dpsNew,
    tankUp,
    tankDown,
    tankNew,
    healerUp,
    healerDown,
    healerNew,
    statusChanges,
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function listSignature(d: WikiDigimonListItem) {
  return [
    d.id,
    d.name,
    d.model_id,
    d.stage,
    d.attribute,
    d.element,
    d.role,
    d.rank,
    d.hp,
    d.attack,
    (d.family_types ?? []).join(','),
  ].join('|')
}

async function fetchAllDigimonIndex() {
  const first = await fetchDigimonPage(0, 500)
  const all = [...first.data]
  for (let p = 2; p <= Math.max(1, first.total_pages || 1); p += 1) {
    const next = await fetchDigimonPage(p - 1, 500)
    all.push(...next.data)
  }
  const meta: Record<string, WikiDigimonListItem> = {}
  const signatures: Record<string, string> = {}
  all.forEach((d) => {
    meta[d.id] = d
    signatures[d.id] = listSignature(d)
  })
  return { all, meta, signatures }
}

function levelMapForSkills(skills: { id: string; max_level: number }[]) {
  const map: Record<string, number> = {}
  for (const s of skills) map[s.id] = Math.max(1, Math.min(25, s.max_level || 25))
  return map
}

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
  const [showProgressBar, setShowProgressBar] = useState(true)
  const [fadeProgressBar, setFadeProgressBar] = useState(false)
  const sawIncompleteProgress = useRef(false)
  const buildRunRef = useRef<{ total: number } | null>(null)
  const [updateSummary, setUpdateSummary] = useState<TierListUpdateSummary | null>(
    loadTierUpdateSummaryFromStorage,
  )
  const [updatePanelMinimized, setUpdatePanelMinimized] = useState(readTierUpdatePanelMinimized)
  const [tierMode, setTierMode] = useState<TierListMode>(readTierListMode)

  function setTierModePersist(next: TierListMode) {
    setTierMode(next)
    writeTierListMode(next)
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
    let working: TierListCache = {
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
            tierEntryIsStaleForDetailFetch(entry)
          )
        })
      const carryOverQueue = working.queue.filter((id) => latestIds.has(id))
      const plannedQueue =
        mode === 'force'
          ? all.map((d) => d.id)
          : [...new Set([...carryOverQueue, ...changedOrMissing])]

      working.queue = plannedQueue
      buildRunRef.current = {
        total: plannedQueue.length,
      }
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
        buildRunRef.current = null
        return
      }

      let processed = 0
      let backoffMs = 0
      while (working.queue.length > 0) {
        const id = working.queue[0]
        const meta = listMeta[id]
        const run = buildRunRef.current
        const runDone =
          run && run.total > 0 ? Math.min(run.total, run.total - working.queue.length) : 0
        setStatus(
          mode === 'force'
            ? `Force checking all… ${runDone}/${run?.total ?? working.queue.length} (checking ${meta?.name ?? id})`
            : `Updating tier list… ${runDone}/${run?.total ?? working.queue.length} (checking ${meta?.name ?? id})`,
        )

        if (backoffMs > 0) {
          setStatus(
            `Rate limit cooldown (${Math.ceil(backoffMs / 1000)}s)… then resuming at ${Object.keys(working.entries).length}/${working.total}.`,
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
          const tank = computeTankTierScore(detail)
          const healer = computeHealerTierScore(detail)
          const entry: SustainedDpsEntry = {
            id: detail.id,
            name: detail.name,
            role: detail.role,
            stage: detail.stage,
            dps: sim.dps,
            tankScore: tank.score,
            healerScore: healer.score,
            status: getDigimonContentStatus(detail.skills),
            checkedAt: new Date().toISOString(),
            skillsSignature: tierSkillsSignature(detail.skills),
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
          setStatus(
            `Cooling down for ${Math.ceil(RATE_LIMIT_COOLDOWN_MS / 1000)}s to avoid rate limits… (${Object.keys(working.entries).length}/${working.total})`,
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
      buildRunRef.current = null
    }
  }

  const checkedCount = cache ? Object.keys(cache.entries).length : 0
  const total = cache?.total ?? 0
  const run = buildRunRef.current
  /** Ref is set only after the index fetch, before the detail queue runs; avoid checkedCount/total then. */
  const hasActiveBuildRun = Boolean(building && run && run.total > 0)
  const progressNumerator = hasActiveBuildRun
    ? Math.min(run!.total, run!.total - (cache?.queue.length ?? run!.total))
    : building
      ? 0
      : checkedCount
  const progressDenominator = hasActiveBuildRun
    ? run!.total
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
      out[id] = e
    }
    return out
  }, [cache?.entries, listMeta, selectedStages, selectedAttributes, selectedElements])

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

  const groups = useMemo(
    () => buildTierGroups(entriesForMatrix, tierMode),
    [entriesForMatrix, tierMode],
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
    return Object.values(entriesForMatrix).some((e) => e.tankScore == null)
  }, [tierMode, entriesForMatrix])

  const healerScoresStale = useMemo(() => {
    if (tierMode !== 'healer') return false
    return Object.values(entriesForMatrix).some((e) => e.healerScore == null)
  }, [tierMode, entriesForMatrix])

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
            <p className="tier-update-summary-collapsed-line muted">
              {new Date(updateSummary.finishedAt).toLocaleString()}
              {' — '}
              DPS: {updateSummary.dpsUp.length}↑ {updateSummary.dpsDown.length}↓, {updateSummary.dpsNew.length}{' '}
              new
              {' · '}
              Tank: {updateSummary.tankUp.length}↑ {updateSummary.tankDown.length}↓, {updateSummary.tankNew.length}{' '}
              new
              {' · '}
              Healer: {updateSummary.healerUp.length}↑ {updateSummary.healerDown.length}↓,{' '}
              {updateSummary.healerNew.length} new
              {' · '}
              Status: {updateSummary.statusChanges.length} change
              {updateSummary.statusChanges.length === 1 ? '' : 's'}
            </p>
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
              ) : null}

              {(updateSummary.dpsUp.length > 0 ||
                updateSummary.dpsDown.length > 0 ||
                updateSummary.dpsNew.length > 0) && (
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

              {(updateSummary.tankUp.length > 0 ||
                updateSummary.tankDown.length > 0 ||
                updateSummary.tankNew.length > 0) && (
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

              {(updateSummary.healerUp.length > 0 ||
                updateSummary.healerDown.length > 0 ||
                updateSummary.healerNew.length > 0) && (
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

              {updateSummary.statusChanges.length > 0 && (
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
          )}
        </section>
      )}

      {cache && !initializing && checkedCount > 0 && (
        <section className="lab-result tier-matrix-section">
          <h3>
            {tierMode === 'dps'
              ? 'Sustained DPS'
              : tierMode === 'tank'
                ? 'Tank tier list'
                : 'Healer tier list'}
          </h3>
          {tierMode === 'dps' ? (
            <p className="muted">
              Ranking criteria per role (sorted by {DEFAULT_ROTATION_SIM_DURATION_SEC}s sustained DPS,
              single target): S = top 10%, A = next 20%, B = next 30%, C = remaining.
            </p>
          ) : null}
          {tierMode === 'tank' ? (
            <>
              <p className="muted">
                Tank wiki role only. Score is a heuristic for sorting this list, not in-game EHP.
              </p>
              <details className="tier-score-explainer">
                <summary>Tank score (how it&apos;s calculated)</summary>
                <div className="tier-score-explainer-body">
                  <ul className="tier-score-explainer-list">
                    <li>
                      Parses skill/buff text and numbers, mixes in base stats; used only to order rows.
                    </li>
                    <li>
                      Mitigation (~55%): damage reduction, shields, heals, Max HP% — each scaled by
                      estimated uptime (buff duration ÷ cooldown+cast, max 100%; fallback if duration
                      missing).
                    </li>
                    <li>Core (~30%): HP plus weighted Defense.</li>
                    <li>Avoidance (~15%): block + evasion (down-weighted).</li>
                    <li>
                      Combined with <code>log1p</code> so one huge value does not decide everything:{' '}
                      <code>
                        0.55·log1p(mit) + 0.30·log1p(core/1000) + 0.15·log1p(avoid)
                      </code>
                      .
                    </li>
                    <li>
                      S/A/B/C: same cutoffs as DPS (~10% / ~20% / ~30% / rest), but only among Tanks
                      after your filters.
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
              <p className="muted">
                Support wiki role only. Score favors healing, then shields/DR, then damage buffs, then
                INT — for sorting only, not real HPS.
              </p>
              <details className="tier-score-explainer">
                <summary>Healer score (how it&apos;s calculated)</summary>
                <div className="tier-score-explainer-body">
                  <ul className="tier-score-explainer-list">
                    <li>
                      Healing (~50%): HP recover/heal lines (% or flat; flat normalized vs this
                      Digimon&apos;s HP) × uptime (same duration/cooldown idea as tank).
                    </li>
                    <li>
                      Shields and damage reduction (~28%): barriers and DR only (healing not counted
                      again here).
                    </li>
                    <li>
                      Damage buffs (~12%): skill damage, ATK%, crit, attack speed, flat ATK × uptime
                      (same idea as Lab offensive support).
                    </li>
                    <li>INT (~10%): small tie-breaker from wiki combat stats.</li>
                    <li>
                      Blend with <code>log1p</code>:{' '}
                      <code>
                        0.50·log1p(heal) + 0.28·log1p(mit) + 0.12·log1p(buff) + 0.10·log1p(INT)
                      </code>
                      .
                    </li>
                    <li>S/A/B/C: same cutoffs as DPS, only among Support rows after filters.</li>
                    <li>
                      Limits: no HoT vs burst, target count, DS heals, or passives; odd skill text may
                      parse wrong.
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
            <div className="tier-matrix-wrap">
              <table className="tier-matrix">
                <thead>
                  <tr>
                    <th>Tier</th>
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
                        const entries = byRole[role]?.tiers[tier] ?? []
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
                                      tierMode === 'tank'
                                        ? e.tankScore != null
                                          ? e.tankScore.toFixed(2)
                                          : '…'
                                        : tierMode === 'healer'
                                          ? e.healerScore != null
                                            ? e.healerScore.toFixed(2)
                                            : '…'
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
                                          to={`/lab?digimonId=${encodeURIComponent(e.id)}&duration=${DEFAULT_ROTATION_SIM_DURATION_SEC}`}
                                          className="tier-entry-link"
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

