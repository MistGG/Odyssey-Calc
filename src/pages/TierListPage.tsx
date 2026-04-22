import { useEffect, useMemo, useState } from 'react'
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
  const [status, setStatus] = useState<string>('Preparing tier list cache…')
  const [error, setError] = useState<string | null>(null)
  const [autoStarted, setAutoStarted] = useState(false)

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
        const first = await fetchDigimonPage(0, 500)
        const all = [...first.data]
        let totalPages = Math.max(1, first.total_pages || 1)
        for (let p = 2; p <= totalPages; p += 1) {
          const next = await fetchDigimonPage(p - 1, 500)
          all.push(...next.data)
        }
        const ids = all.map((d) => d.id)
        const meta: Record<string, WikiDigimonListItem> = {}
        all.forEach((d) => {
          meta[d.id] = d
        })
        const created = createEmptyTierListCache(ids)
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
        const first = await fetchDigimonPage(0, 500)
        const all = [...first.data]
        for (let p = 2; p <= Math.max(1, first.total_pages || 1); p += 1) {
          const next = await fetchDigimonPage(p - 1, 500)
          all.push(...next.data)
        }
        if (cancelled) return
        const meta: Record<string, WikiDigimonListItem> = {}
        all.forEach((d) => {
          meta[d.id] = d
        })
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

  async function updateTierList() {
    if (!cache || building || initializing) return
    setBuilding(true)
    setError(null)
    let working: TierListCache = {
      ...cache,
      queue: [...cache.queue],
      entries: { ...cache.entries },
    }

    try {
      let processed = 0
      while (working.queue.length > 0) {
        const id = working.queue[0]
        const meta = listMeta[id]
        setStatus(
          `Building tier list… ${Object.keys(working.entries).length}/${working.total} (checking ${meta?.name ?? id})`,
        )

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
            throw new Error('Rate limited by API. Wait a bit, then click Update again.')
          }
          // Move failed id to back of queue so build can continue later.
          working.queue.shift()
          working.queue.push(id)
          processed += 1
        }

        working.lastCheckedAt = new Date().toISOString()
        saveTierListCache(working)
        setCache({ ...working, queue: [...working.queue], entries: { ...working.entries } })
        await sleep(REQUEST_DELAY_MS)
      }

      if (working.queue.length === 0) {
        setStatus('Tier list complete. Use Update to refresh with new checks.')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Tier update failed.')
    } finally {
      setBuilding(false)
    }
  }

  const checkedCount = cache ? Object.keys(cache.entries).length : 0
  const total = cache?.total ?? 0
  const progress = total > 0 ? (checkedCount / total) * 100 : 0
  const groups = useMemo(
    () => buildTierGroups(cache?.entries ?? {}),
    [cache?.entries],
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
          onClick={() => void updateTierList()}
        >
          {building ? 'Building tier list…' : 'Update tier list'}
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
                                    {icon ? (
                                      <img src={icon} alt="" loading="lazy" />
                                    ) : (
                                      <span className="tier-entry-fallback">{e.name.slice(0, 2)}</span>
                                    )}
                                    <span className="tier-entry-name">{e.name}</span>
                                    <span className="tier-entry-dps">{e.dps.toFixed(1)}</span>
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

