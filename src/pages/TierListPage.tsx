import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchDigimonDetail, fetchDigimonPage } from '../api/digimonService'
import { simulateRotation } from '../lib/dpsSim'
import { digimonPortraitUrl } from '../lib/digimonImage'
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
  const [selectedStage, setSelectedStage] = useState<string>('All')

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

      const changedOrMissing = all
        .map((d) => d.id)
        .filter(
          (id) =>
            working.listSignatures[id] !== signatures[id] ||
            !working.entries[id],
        )
      const carryOverQueue = working.queue.filter((id) => latestIds.has(id))
      const plannedQueue =
        mode === 'force'
          ? all.map((d) => d.id)
          : [...new Set([...carryOverQueue, ...changedOrMissing])]

      working.queue = plannedQueue
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
        setStatus('Tier list is already up to date. No changed Digimon found.')
        return
      }

      let processed = 0
      let backoffMs = 0
      while (working.queue.length > 0) {
        const id = working.queue[0]
        const meta = listMeta[id]
        setStatus(
          `Building tier list… ${Object.keys(working.entries).length}/${working.total} (checking ${meta?.name ?? id})`,
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
          const sim = simulateRotation(detail.skills, levels, 60, 1, detail.attack)
          const entry: SustainedDpsEntry = {
            id: detail.id,
            name: detail.name,
            role: detail.role,
            stage: detail.stage,
            dps: sim.dps,
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
            ? 'Force update complete. All Digimon were recalculated.'
            : 'Tier list update complete. Changed Digimon were refreshed.',
        )
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Tier update failed.')
    } finally {
      setBuilding(false)
      setBuildMode('incremental')
    }
  }

  const checkedCount = cache ? Object.keys(cache.entries).length : 0
  const total = cache?.total ?? 0
  const progress = total > 0 ? (checkedCount / total) * 100 : 0
  const stageOptions = useMemo(() => {
    const stages = new Set<string>()
    Object.values(cache?.entries ?? {}).forEach((e) => {
      if (e.stage?.trim()) stages.add(e.stage.trim())
    })
    return ['All', ...[...stages].sort((a, b) => a.localeCompare(b))]
  }, [cache?.entries])

  const filteredEntries = useMemo(() => {
    const all = cache?.entries ?? {}
    if (selectedStage === 'All') return all
    const out: Record<string, SustainedDpsEntry> = {}
    for (const [id, e] of Object.entries(all)) {
      if (e.stage === selectedStage) out[id] = e
    }
    return out
  }, [cache?.entries, selectedStage])

  const groups = useMemo(
    () => buildTierGroups(filteredEntries),
    [filteredEntries],
  )
  const roles = useMemo(() => groups.map((g) => g.role), [groups])
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

  return (
    <div className="lab tier-page">
      <h1>Tier Lists</h1>

      <section className="lab-result">
        <h3>Update tier list</h3>
        <p className="muted">{status}</p>
        <p>
          Progress:{' '}
          <strong>
            {checkedCount}/{total || '…'} ({progress.toFixed(1)}%)
          </strong>
        </p>
        <div className="tier-progress">
          <div className="tier-progress-bar" style={{ width: `${progress}%` }} />
        </div>
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
          {building && buildMode === 'force' ? 'Force updating all…' : 'Force update'}
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
          <div className="stage-tabs" role="tablist" aria-label="Filter by stage">
            {stageOptions.map((s) => (
              <button
                key={s}
                type="button"
                className={`stage-tab ${selectedStage === s ? 'stage-tab-active' : ''}`}
                onClick={() => setSelectedStage(s)}
                aria-pressed={selectedStage === s}
              >
                {s}
              </button>
            ))}
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
                          {entries.length === 0 ? (
                            <span className="muted">—</span>
                          ) : (
                            <ul className="tier-entry-list">
                              {entries.map((e) => {
                                const modelId = listMeta[e.id]?.model_id ?? ''
                                const icon = modelId
                                  ? digimonPortraitUrl(modelId, e.id, e.name)
                                  : undefined
                                return (
                                  <li key={`${tier}-${role}-${e.id}`} className="tier-entry">
                                    <Link
                                      to={`/lab?digimonId=${encodeURIComponent(e.id)}`}
                                      className="tier-entry-link"
                                    >
                                      {icon ? (
                                        <img src={icon} alt="" loading="lazy" />
                                      ) : (
                                        <span className="tier-entry-fallback">{e.name.slice(0, 2)}</span>
                                      )}
                                      <span className="tier-entry-name">{e.name}</span>
                                      <span className="tier-entry-dps">{e.dps.toFixed(1)}</span>
                                    </Link>
                                  </li>
                                )
                              })}
                            </ul>
                          )}
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

