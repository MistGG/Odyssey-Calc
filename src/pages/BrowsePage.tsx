import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchDigimonPage } from '../api/digimonService'
import { WIKI_DIGIMON_PER_PAGE } from '../config/env'
import { digimonPortraitUrl } from '../lib/digimonImage'
import type { WikiDigimonListItem } from '../types/wikiApi'

const ROLE_OPTIONS = [
  'Tank',
  'Melee DPS',
  'Ranged DPS',
  'Support',
  'Hybrid',
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

type BrowseFilters = {
  role: string
  stage: string
  element: string
  attribute: string
}

const EMPTY_FILTERS: BrowseFilters = {
  role: '',
  stage: '',
  element: '',
  attribute: '',
}

function matchesFilters(item: WikiDigimonListItem, q: string, f: BrowseFilters) {
  const query = q.trim().toLowerCase()
  if (query && !item.name.toLowerCase().includes(query)) return false
  if (f.role && item.role !== f.role) return false
  if (f.stage && item.stage !== f.stage) return false
  if (f.element && item.element !== f.element) return false
  if (f.attribute && item.attribute !== f.attribute) return false
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
  const [total, setTotal] = useState(0)
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

  function clearFilters() {
    setFilters(EMPTY_FILTERS)
    setAppliedQuery('')
    setAppliedFilters(EMPTY_FILTERS)
    setPage(0)
  }

  const localFiltered = allDigimonCache
    ? allDigimonCache.filter((d) => matchesFilters(d, query, filters))
    : null

  const visibleItems = (() => {
    if (!localFiltered) return items
    const start = page * WIKI_DIGIMON_PER_PAGE
    return localFiltered.slice(start, start + WIKI_DIGIMON_PER_PAGE)
  })()

  const effectiveTotal = localFiltered ? localFiltered.length : total
  const effectiveTotalPages = localFiltered
    ? Math.max(1, Math.ceil(localFiltered.length / WIKI_DIGIMON_PER_PAGE))
    : Math.max(1, totalPages)

  useEffect(() => {
    if (!localFiltered) return
    if (page > effectiveTotalPages - 1) setPage(0)
  }, [effectiveTotalPages, localFiltered, page])

  return (
    <div className="browse">
      <div className="browse-head">
        <h1>Browse Digimon</h1>
        <form className="search" onSubmit={onSearch}>
          <input
            type="search"
            placeholder="Search (API: q=…)"
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

        <form className="filters" onSubmit={onSearch}>
          <label>
            Role
            <select
              value={filters.role}
              onChange={(e) => {
                setFilters((f) => ({ ...f, role: e.target.value }))
                if (allDigimonCache) setPage(0)
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
                setFilters((f) => ({ ...f, stage: e.target.value }))
                if (allDigimonCache) setPage(0)
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
                setFilters((f) => ({ ...f, element: e.target.value }))
                if (allDigimonCache) setPage(0)
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
                setFilters((f) => ({ ...f, attribute: e.target.value }))
                if (allDigimonCache) setPage(0)
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
          <button type="submit">Apply</button>
        </form>
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
}: {
  modelId: string
  id: string
  name: string
}) {
  const src = digimonPortraitUrl(modelId, id, name)
  const [broken, setBroken] = useState(!src)

  if (!src || broken) {
    return (
      <div className="thumb thumb-placeholder" aria-hidden="true">
        <span className="thumb-initial">{name.slice(0, 2)}</span>
      </div>
    )
  }

  return (
    <div className="thumb">
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
      />
    </div>
  )
}
