import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchDigimonDetail, fetchDigimonPage } from '../api/digimonService'
import { simulateRotation } from '../lib/dpsSim'
import { digimonPortraitUrl } from '../lib/digimonImage'
import { digimonStageBorderColor, digimonStageTierFilterStyle } from '../lib/digimonStage'
import { contentStatusLabel, getDigimonContentStatus } from '../lib/contentStatus'
import {
  buildTierGroups,
  createEmptyTierListCache,
  loadTierListCache,
  saveTierListCache,
  type SustainedDpsEntry,
  type TierListCache,
} from '../lib/tierList'
import type { WikiDigimonListItem } from '../types/wikiApi'

const REQUEST_DELAY_MS = 700
const COOLDOWN_EVERY_N_REQUESTS = 50
const COOLDOWN_PAUSE_MS = 30000

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
  /** Empty = show all stages. Otherwise OR-filter by listed stages (multi-select). */
  const [selectedStages, setSelectedStages] = useState<string[]>([])
  const [showProgressBar, setShowProgressBar] = useState(true)
  const [fadeProgressBar, setFadeProgressBar] = useState(false)
  const sawIncompleteProgress = useRef(false)
  const buildRunRef = useRef<{ total: number } | null>(null)

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
        .filter(
          (id) =>
            (hadPriorSignatures &&
              working.listSignatures[id] !== signatures[id]) ||
            !working.entries[id] ||
            !working.entries[id]?.status,
        )
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
            60,
            1,
            detail.attack,
            detail.stats?.atk_speed ?? 0,
            detail.stats?.crit_rate ?? 0,
          )
          const entry: SustainedDpsEntry = {
            id: detail.id,
            name: detail.name,
            role: detail.role,
            stage: detail.stage,
            dps: sim.dps,
            status: getDigimonContentStatus(detail.skills),
            checkedAt: new Date().toISOString(),
          }
          working.entries[id] = entry
          working.queue.shift()
          processed += 1
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'unknown error'
          if (/429|rate/i.test(msg)) {
            // Backoff and retry same id later, keeping queue intact.
            backoffMs = Math.max(backoffMs, 60000)
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
            `Cooling down for ${Math.ceil(COOLDOWN_PAUSE_MS / 1000)}s to avoid rate limits… (${Object.keys(working.entries).length}/${working.total})`,
          )
          await sleep(COOLDOWN_PAUSE_MS)
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
  const progressNumerator =
    building && run && run.total > 0
      ? Math.min(run.total, run.total - (cache?.queue.length ?? 0))
      : checkedCount
  const progressDenominator = building && run && run.total > 0 ? run.total : total
  const progress = progressDenominator > 0 ? (progressNumerator / progressDenominator) * 100 : 0
  const tierBuildComplete = Boolean(cache && total > 0 && cache.queue.length === 0 && checkedCount >= total)
  const stageOptions = useMemo(() => {
    const stages = new Set<string>()
    Object.values(cache?.entries ?? {}).forEach((e) => {
      if (e.stage?.trim()) stages.add(e.stage.trim())
    })
    return ['All', ...[...stages].sort((a, b) => a.localeCompare(b))]
  }, [cache?.entries])

  const filteredEntries = useMemo(() => {
    const all = cache?.entries ?? {}
    if (selectedStages.length === 0) return all
    const allow = new Set(selectedStages)
    const out: Record<string, SustainedDpsEntry> = {}
    for (const [id, e] of Object.entries(all)) {
      if (allow.has(e.stage)) out[id] = e
    }
    return out
  }, [cache?.entries, selectedStages])

  function onStageFilterClick(label: string) {
    if (label === 'All') {
      setSelectedStages([])
      return
    }
    setSelectedStages((prev) => {
      if (prev.includes(label)) return prev.filter((x) => x !== label)
      return [...prev, label].sort((a, b) => a.localeCompare(b))
    })
  }

  const groups = useMemo(
    () => buildTierGroups(filteredEntries),
    [filteredEntries],
  )
  const roles = useMemo(
    () => buildTierGroups(cache?.entries ?? {}).map((g) => g.role),
    [cache?.entries],
  )
  const byRole = useMemo(() => {
    const map: Record<string, (typeof groups)[number]> = {}
    groups.forEach((g) => {
      map[g.role] = g
    })
    return map
  }, [groups])

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
      <h1>Tier Lists</h1>

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

      {roles.length > 0 && (
        <section className="lab-result">
          <h3>Sustained DPS</h3>
          <p className="muted">
            Ranking criteria per role (sorted by 60s sustained DPS, single target):
            S = top 10%, A = next 20%, B = next 30%, C = remaining.
          </p>
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
          <div className="stage-tabs" role="group" aria-label="Filter by stage (multi-select)">
            {stageOptions.map((s) => {
              const selected =
                s === 'All' ? selectedStages.length === 0 : selectedStages.includes(s)
              return (
                <button
                  key={s}
                  type="button"
                  className="stage-tab"
                  style={digimonStageTierFilterStyle(s, selected)}
                  onClick={() => onStageFilterClick(s)}
                  aria-pressed={selected}
                >
                  {s}
                </button>
              )
            })}
          </div>
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
                                        to={`/lab?digimonId=${encodeURIComponent(e.id)}`}
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
                                          <span className="tier-entry-dps">{e.dps.toFixed(1)}</span>
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
        </section>
      )}
    </div>
  )
}

