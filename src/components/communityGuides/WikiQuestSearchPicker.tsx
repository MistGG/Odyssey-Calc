import { useEffect, useMemo, useState } from 'react'
import {
  getGuidebookQuestsCached,
  loadGuidebookAllQuests,
  loadGuidebookQuestSearch,
} from '../../lib/guidebookWikiCache'
import type { WikiQuestListItem } from '../../types/wikiApi'

type WikiQuestSearchPickerProps = {
  onSelect: (quest: WikiQuestListItem) => void
  label?: string
}

function questMatchesQuery(quest: WikiQuestListItem, q: string): boolean {
  const needle = q.toLowerCase()
  return (
    quest.title_text.toLowerCase().includes(needle) ||
    quest.title_tab.toLowerCase().includes(needle) ||
    quest.type.toLowerCase().includes(needle)
  )
}

export function WikiQuestSearchPicker({ onSelect, label = 'Search quests' }: WikiQuestSearchPickerProps) {
  const [query, setQuery] = useState('')
  const [allQuests, setAllQuests] = useState<WikiQuestListItem[]>(() => getGuidebookQuestsCached(500) ?? [])
  const [serverResults, setServerResults] = useState<WikiQuestListItem[]>([])
  const [loadingAll, setLoadingAll] = useState(!getGuidebookQuestsCached(500))
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = query.trim()

  useEffect(() => {
    let cancelled = false
    const cached = getGuidebookQuestsCached(500)
    if (cached) {
      setAllQuests(cached)
      setLoadingAll(false)
      return
    }
    setLoadingAll(true)
    void loadGuidebookAllQuests(500)
      .then((rows) => {
        if (!cancelled) setAllQuests(rows)
      })
      .catch((e: unknown) => {
        if (!cancelled && !getGuidebookQuestsCached(500)) {
          setError(e instanceof Error ? e.message : 'Could not load quests.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingAll(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (trimmed.length < 2) {
      setServerResults([])
      setLoadingSearch(false)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      setLoadingSearch(true)
      void loadGuidebookQuestSearch(trimmed, 0, 500)
        .then((res) => {
          if (!cancelled) {
            setServerResults(res.data)
            setError(null)
          }
        })
        .catch((e: unknown) => {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : 'Quest search failed.')
            setServerResults([])
          }
        })
        .finally(() => {
          if (!cancelled) setLoadingSearch(false)
        })
    }, 280)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [trimmed])

  const results = useMemo(() => {
    if (trimmed.length >= 2) return serverResults.slice(0, 24)
    const pool = allQuests.filter((q) => questMatchesQuery(q, trimmed))
    return pool.slice(0, 24)
  }, [allQuests, serverResults, trimmed])

  const hint = useMemo(() => {
    if (loadingAll && !allQuests.length) return 'Loading quest index…'
    if (trimmed.length >= 2 && loadingSearch) return 'Searching…'
    if (error) return error
    if (!results.length) {
      return trimmed.length >= 2
        ? 'No quests found.'
        : 'Browse recent quests or type 2+ characters to search.'
    }
    return `${results.length} shown${trimmed.length >= 2 ? '' : ` · ${allQuests.length} quests indexed`}`
  }, [loadingAll, allQuests.length, trimmed, loadingSearch, error, results.length])

  return (
    <div className="wiki-entity-picker">
      <label className="wiki-entity-picker__label">
        <span className="wiki-entity-picker__title">{label}</span>
        <input
          type="search"
          className="wiki-entity-picker__input"
          placeholder="Search by quest name or area…"
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
          {results.map((quest) => (
            <li key={quest.id}>
              <button type="button" className="wiki-entity-picker__row" onClick={() => onSelect(quest)}>
                <span className="wiki-entity-picker__quest-badge">{quest.type}</span>
                <span className="wiki-entity-picker__row-text">
                  <span className="wiki-entity-picker__name">{quest.title_text}</span>
                  <span className="wiki-entity-picker__meta">{quest.title_tab}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
