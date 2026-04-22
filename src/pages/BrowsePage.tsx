import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchDigimonPage } from '../api/digimonService'
import { WIKI_DIGIMON_PER_PAGE } from '../config/env'
import { digimonPortraitUrl, rankSpriteStyle } from '../lib/digimonImage'
import { digimonStagePortraitGradient } from '../lib/digimonStage'
import { WIKI_RANK_LABELS, wikiRankLabelFromNumber } from '../lib/wikiRank'
import type { WikiDigimonListItem } from '../types/wikiApi'

/** Match wiki `role` values used elsewhere (tier list, filters). */
const ROLE_OPTIONS = [
  'Melee DPS',
  'Ranged DPS',
  'Caster',
  'Hybrid',
  'Tank',
  'Support',
  'None',
] as const
const STAGE_OPTIONS = [
  'Rookie',
  'Champion',
  'Ultimate',
  'Mega',
  'Burst Mode',
  'Armor',
  'Spirit',
] as const
const ELEMENT_OPTIONS = [
  'Fire',
  'Water',
  'Wind',
  'Earth',
  'Light',
  'Darkness',
  'Steel',
  'Wood',
  'Thunder',
  'Ice',
  'Neutral',
] as const
const ATTRIBUTE_OPTIONS = ['Vaccine', 'Data', 'Virus', 'Free', 'None'] as const

/** Distinct family types present in the current wiki dataset (Digimon may belong to several). */
const FAMILY_OPTIONS = [
  'Dark Area',
  'Deep Savers',
  "Dragon's Roar",
  'Jungle Troopers',
  'Metal Empire',
  'Nature Spirits',
  'Nightmare Soldiers',
  'TBD',
  'Unknown',
  'Virus Busters',
  'Wind Guardians',
] as const

type BrowseFilters = {
  role: string
  stage: string
  element: string
  attribute: string
  family: string
  rank: string
}

const EMPTY_FILTERS: BrowseFilters = {
  role: '',
  stage: '',
  element: '',
  attribute: '',
  family: '',
  rank: '',
}

function matchesFilters(item: WikiDigimonListItem, q: string, f: BrowseFilters) {
  const query = q.trim().toLowerCase()
  if (query && !item.name.toLowerCase().includes(query)) return false
  if (f.role && item.role !== f.role) return false
  if (f.stage && item.stage !== f.stage) return false
  if (f.element && item.element !== f.element) return false
  if (f.attribute && item.attribute !== f.attribute) return false
  if (f.family && !(item.family_types ?? []).includes(f.family)) return false
  if (f.rank !== '' && wikiRankLabelFromNumber(item.rank) !== f.rank) return false
  return true
}

export function BrowsePage() {
  const [page, setPage] = useState(0)
  const [query, setQuery] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [filters, setFilters] = useState<BrowseFilters>(EMPTY_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState<BrowseFilters>(EMPTY_FILTERS)
  const [items, setItems] = useState<WikiDigimonListItem[]>([])
  const [allDigimonCache, setAllDigimonCache] = useState<WikiDigimonListItem[] | null>(
    null,
  )
  const [totalPages, setTotalPages] = useState(0)
  /** Server-reported total rows for the current API query (unused when full cache is active). */
  const [_apiTotalRows, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (allDigimonCache) {
      setLoading(false)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchDigimonPage(
      page,
      WIKI_DIGIMON_PER_PAGE,
      appliedQuery || undefined,
      {
        role: appliedFilters.role || undefined,
        stage: appliedFilters.stage || undefined,
        element: appliedFilters.element || undefined,
        attribute: appliedFilters.attribute || undefined,
        family: appliedFilters.family || undefined,
        rank: appliedFilters.rank || undefined,
      },
    )
      .then((data) => {
        if (cancelled) return
        setItems(data.data)
        setTotalPages(data.total_pages)
        setTotal(data.total)
        // If this page includes the whole dataset, use local filtering from now on.
        if (
          page === 0 &&
          !appliedQuery &&
          !appliedFilters.role &&
          !appliedFilters.stage &&
          !appliedFilters.element &&
          !appliedFilters.attribute &&
          !appliedFilters.family &&
          !appliedFilters.rank &&
          data.total <= WIKI_DIGIMON_PER_PAGE
        ) {
          setAllDigimonCache(data.data)
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load Digimon.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [allDigimonCache, page, appliedQuery, appliedFilters])

  function onSearch(e: React.FormEvent) {
    e.preventDefault()
    setPage(0)
    if (allDigimonCache) return
    setAppliedQuery(query)
    setAppliedFilters(filters)
  }

  /** Dropdowns update `filters` immediately; when not using the full local cache, sync API params too. */
  function applyFilterPatch(patch: Partial<BrowseFilters>) {
    setFilters((f) => ({ ...f, ...patch }))
    if (!allDigimonCache) {
      setAppliedFilters((f) => ({ ...f, ...patch }))
    }
    setPage(0)
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS)
    setAppliedQuery('')
    setAppliedFilters(EMPTY_FILTERS)
    setPage(0)
  }

  const filteredList = useMemo(() => {
    const source = allDigimonCache ?? items
    return source.filter((d) => matchesFilters(d, query, filters))
  }, [allDigimonCache, items, query, filters])

  const visibleItems = useMemo(() => {
    if (allDigimonCache) {
      const start = page * WIKI_DIGIMON_PER_PAGE
      return filteredList.slice(start, start + WIKI_DIGIMON_PER_PAGE)
    }
    return filteredList
  }, [allDigimonCache, filteredList, page])

  const effectiveTotal = filteredList.length
  const effectiveTotalPages = allDigimonCache
    ? Math.max(1, Math.ceil(filteredList.length / WIKI_DIGIMON_PER_PAGE))
    : Math.max(1, totalPages)

  useEffect(() => {
    if (!allDigimonCache) return
    if (page > effectiveTotalPages - 1) setPage(0)
  }, [effectiveTotalPages, allDigimonCache, page])

  return (
    <div className="browse">
      <div className="browse-head">
        <h1>Browse Digimon</h1>
        <form className="search" onSubmit={onSearch}>
          <input
            type="search"
            placeholder="Search..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              if (allDigimonCache) setPage(0)
            }}
            aria-label="Search by name"
          />
          <button type="submit">Search</button>
          <button
            type="button"
            className="button-ghost"
            onClick={clearFilters}
          >
            Clear filters
          </button>
        </form>

        <div className="filters" role="group" aria-label="Filter by role, stage, and attributes">
          <label>
            Role
            <select
              value={filters.role}
              onChange={(e) => {
                applyFilterPatch({ role: e.target.value })
              }}
            >
              <option value="">Any</option>
              {ROLE_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Stage
            <select
              value={filters.stage}
              onChange={(e) => {
                applyFilterPatch({ stage: e.target.value })
              }}
            >
              <option value="">Any</option>
              {STAGE_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Element
            <select
              value={filters.element}
              onChange={(e) => {
                applyFilterPatch({ element: e.target.value })
              }}
            >
              <option value="">Any</option>
              {ELEMENT_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type / Attribute
            <select
              value={filters.attribute}
              onChange={(e) => {
                applyFilterPatch({ attribute: e.target.value })
              }}
            >
              <option value="">Any</option>
              {ATTRIBUTE_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Family
            <select
              value={filters.family}
              onChange={(e) => {
                applyFilterPatch({ family: e.target.value })
              }}
            >
              <option value="">Any</option>
              {FAMILY_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Rank
            <select
              value={filters.rank}
              onChange={(e) => {
                applyFilterPatch({ rank: e.target.value })
              }}
            >
              <option value="">All Ranks</option>
              {WIKI_RANK_LABELS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="meta">
          {loading
            ? 'Loading…'
            : `${effectiveTotal.toLocaleString()} Digimon · page ${page + 1} of ${effectiveTotalPages} (${WIKI_DIGIMON_PER_PAGE} / page)${allDigimonCache ? ' · local filtering' : ''}`}
        </p>
      </div>

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      {!loading && !error && visibleItems.length === 0 && (
        <p className="empty">No matches. Try another search.</p>
      )}

      <ul className="grid">
        {visibleItems.map((d) => (
          <li key={d.id}>
            <Link to={`/digimon/${encodeURIComponent(d.id)}`} className="card">
              <DigimonThumb
                modelId={d.model_id}
                id={d.id}
                name={d.name}
                stage={d.stage}
                rank={d.rank}
              />
              <div className="card-body">
                <span className="card-title">{d.name}</span>
                <span className="card-sub">{d.stage}</span>
                <span className="card-stats">
                  ATK {d.attack.toLocaleString()} · HP {d.hp.toLocaleString()}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <div className="pager">
        <button
          type="button"
          disabled={page <= 0 || loading}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          Previous
        </button>
        <span className="pager-status">
          {loading ? '…' : `${page + 1} / ${effectiveTotalPages}`}
        </span>
        <button
          type="button"
          disabled={loading || page >= effectiveTotalPages - 1 || effectiveTotalPages === 0}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </div>
  )
}

function DigimonThumb({
  modelId,
  id,
  name,
  stage,
  rank,
}: {
  modelId: string
  id: string
  name: string
  stage: string
  rank: number
}) {
  const src = digimonPortraitUrl(modelId, id, name)
  const [broken, setBroken] = useState(!src)
  const frameRef = useRef<HTMLDivElement>(null)
  const [badgeMetrics, setBadgeMetrics] = useState<{ rsz: number; rszH: number } | null>(
    null,
  )

  const portraitBg = digimonStagePortraitGradient(stage)

  useLayoutEffect(() => {
    const el = frameRef.current
    if (!el) return
    const update = () => {
      const sz = el.getBoundingClientRect().width
      if (!sz) return
      const rsz = Math.round(sz * 0.42)
      const rszH = Math.round((rsz * 62) / 72)
      setBadgeMetrics({ rsz, rszH })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const rankScale = badgeMetrics ? badgeMetrics.rsz / 32 : 1
  const rankWrapStyle =
    badgeMetrics && rank > 0
      ? {
          bottom: -Math.round(badgeMetrics.rszH * 0.4),
          right: -Math.round(badgeMetrics.rsz * 0.4),
        }
      : rank > 0
        ? { bottom: -11, right: -13 }
        : undefined

  const rankBadge =
    rank > 0 ? (
      <span className="browse-rank-badge-wrap" style={rankWrapStyle} aria-hidden="true">
        <span style={rankSpriteStyle(rank, rankScale)} />
      </span>
    ) : null

  if (!src || broken) {
    return (
      <div className="thumb browse-thumb thumb-placeholder" aria-hidden="true">
        <div ref={frameRef} className="browse-thumb-frame">
          <div
            className="browse-thumb-mask browse-thumb-mask-placeholder"
            style={{ background: portraitBg }}
          >
            <span className="browse-thumb-initial">{name.slice(0, 2)}</span>
          </div>
          {rankBadge}
        </div>
      </div>
    )
  }

  return (
    <div className="thumb browse-thumb">
      <div ref={frameRef} className="browse-thumb-frame">
        <div className="browse-thumb-mask" style={{ background: portraitBg }}>
          <img
            className="browse-thumb-img"
            src={src}
            alt=""
            loading="lazy"
            onError={() => setBroken(true)}
          />
        </div>
        {rankBadge}
      </div>
    </div>
  )
}
