import { useEffect, useMemo, useState } from 'react'
import { wikiItemIconUrl } from '../../lib/digimonImage'
import { loadGuidebookItemSearch } from '../../lib/guidebookWikiCache'
import type { WikiItemListItem } from '../../types/wikiApi'

type WikiItemSearchPickerProps = {
  onSelect: (item: WikiItemListItem) => void
  label?: string
}

export function WikiItemSearchPicker({ onSelect, label = 'Search items' }: WikiItemSearchPickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<WikiItemListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = query.trim()

  useEffect(() => {
    if (trimmed.length < 2) {
      setResults([])
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      void loadGuidebookItemSearch(trimmed, 0, 50)
        .then((res) => {
          if (!cancelled) setResults(res.data)
        })
        .catch((e: unknown) => {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : 'Item search failed.')
            setResults([])
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 280)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [trimmed])

  const hint = useMemo(() => {
    if (trimmed.length < 2) return 'Type at least 2 characters to search wiki items.'
    if (loading) return 'Searching…'
    if (error) return error
    if (!results.length) return 'No items found.'
    return `${results.length} result${results.length === 1 ? '' : 's'}`
  }, [trimmed, loading, error, results.length])

  return (
    <div className="wiki-entity-picker">
      <label className="wiki-entity-picker__label">
        <span className="wiki-entity-picker__title">{label}</span>
        <input
          type="search"
          className="wiki-entity-picker__input"
          placeholder="Search by item name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
      </label>
      <p className="wiki-entity-picker__hint" role="status">
        {hint}
      </p>
      {results.length > 0 ? (
        <ul className="wiki-entity-picker__list">
          {results.map((item) => {
            const icon = wikiItemIconUrl(item.icon_id)
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="wiki-entity-picker__row"
                  onClick={() => onSelect(item)}
                >
                  {icon ? (
                    <img className="wiki-entity-picker__icon" src={icon} alt="" width={28} height={28} />
                  ) : (
                    <span className="wiki-entity-picker__icon-fallback" aria-hidden>
                      ?
                    </span>
                  )}
                  <span className="wiki-entity-picker__row-text">
                    <span className="wiki-entity-picker__name">{item.name}</span>
                    <span className="wiki-entity-picker__meta">{item.type_name}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
