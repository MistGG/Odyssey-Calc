import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchDigimonPage } from '../api/digimonService'
import { WIKI_DIGIMON_PER_PAGE } from '../config/env'
import { digimonPortraitUrl } from '../lib/digimonImage'
import type { WikiDigimonListItem } from '../types/wikiApi'

export function BrowsePage() {
  const [page, setPage] = useState(0)
  const [query, setQuery] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [items, setItems] = useState<WikiDigimonListItem[]>([])
  const [totalPages, setTotalPages] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchDigimonPage(page, WIKI_DIGIMON_PER_PAGE, appliedQuery || undefined)
      .then((data) => {
        if (cancelled) return
        setItems(data.data)
        setTotalPages(data.total_pages)
        setTotal(data.total)
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
  }, [page, appliedQuery])

  function onSearch(e: React.FormEvent) {
    e.preventDefault()
    setPage(0)
    setAppliedQuery(query)
  }

  return (
    <div className="browse">
      <div className="browse-head">
        <h1>Browse Digimon</h1>
        <form className="search" onSubmit={onSearch}>
          <input
            type="search"
            placeholder="Search (API: q=…)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search by name"
          />
          <button type="submit">Search</button>
        </form>
        <p className="meta">
          {loading
            ? 'Loading…'
            : `${total.toLocaleString()} Digimon · page ${page + 1} of ${Math.max(1, totalPages)} (${WIKI_DIGIMON_PER_PAGE} / page)`}
        </p>
      </div>

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <p className="empty">No matches. Try another search.</p>
      )}

      <ul className="grid">
        {items.map((d) => (
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
          {loading ? '…' : `${page + 1} / ${Math.max(1, totalPages)}`}
        </span>
        <button
          type="button"
          disabled={loading || page >= totalPages - 1 || totalPages === 0}
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
