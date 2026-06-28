import { useEffect, useMemo, useState } from 'react'
import { digimonPortraitUrl } from '../../lib/digimonImage'
import { loadGuidebookDigimonPage } from '../../lib/guidebookWikiCache'
import type { WikiDigimonListItem } from '../../types/wikiApi'

type WikiDigimonSearchPickerProps = {
  onSelect: (digimon: WikiDigimonListItem) => void
  label?: string
}

export function WikiDigimonSearchPicker({
  onSelect,
  label = 'Search Digimon',
}: WikiDigimonSearchPickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<WikiDigimonListItem[]>([])
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
      void loadGuidebookDigimonPage(0, 30, trimmed)
        .then((res) => {
          if (!cancelled) setResults(res.data)
        })
        .catch((e: unknown) => {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : 'Digimon search failed.')
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
    if (trimmed.length < 2) return 'Type at least 2 characters to search wiki Digimon.'
    if (loading) return 'Searching…'
    if (error) return error
    if (!results.length) return 'No Digimon found.'
    return `${results.length} result${results.length === 1 ? '' : 's'}`
  }, [trimmed, loading, error, results.length])

  return (
    <div className="wiki-entity-picker">
      <label className="wiki-entity-picker__label">
        <span className="wiki-entity-picker__title">{label}</span>
        <input
          type="search"
          className="wiki-entity-picker__input"
          placeholder="Search by Digimon name…"
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
          {results.map((digimon) => {
            const portrait = digimonPortraitUrl(digimon.model_id, digimon.id, digimon.name)
            return (
              <li key={digimon.id}>
                <button
                  type="button"
                  className="wiki-entity-picker__row"
                  onClick={() => onSelect(digimon)}
                >
                  {portrait ? (
                    <img
                      className="wiki-entity-picker__icon wiki-entity-picker__icon--round"
                      src={portrait}
                      alt=""
                      width={28}
                      height={28}
                    />
                  ) : (
                    <span className="wiki-entity-picker__icon-fallback" aria-hidden>
                      ?
                    </span>
                  )}
                  <span className="wiki-entity-picker__row-text">
                    <span className="wiki-entity-picker__name">{digimon.name}</span>
                    <span className="wiki-entity-picker__meta">
                      {digimon.stage} · {digimon.role}
                    </span>
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
