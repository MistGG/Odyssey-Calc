import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import {
  WikiDungeonPanel,
  WikiItemPanel,
  WikiMonsterPanel,
  type WikiBrowseNav,
} from '../components/wiki/WikiBrowserPanels'
import { wikiItemIconUrl } from '../lib/digimonImage'
import {
  getGuidebookItemSearchCached,
  loadGuidebookItemSearch,
} from '../lib/guidebookWikiCache'
import type { WikiItemListItem } from '../types/wikiApi'

const WIKI_ITEM_PER_PAGE = 50
const MIN_QUERY_LENGTH = 2

export function WikiItemRedirect() {
  const { id } = useParams()
  const itemId = id?.trim()
  if (!itemId) return <Navigate to="/wiki" replace />
  return <Navigate to={`/wiki?item=${encodeURIComponent(itemId)}`} replace />
}

export function WikiPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const appliedQuery = searchParams.get('q') ?? ''
  const selectedItemId = searchParams.get('item')
  const selectedDungeonId = searchParams.get('dungeon')
  const selectedMonsterId = searchParams.get('monster')
  const page = Math.max(0, parseInt(searchParams.get('page') || '0', 10) || 0)

  const [queryInput, setQueryInput] = useState(appliedQuery)
  const [items, setItems] = useState<WikiItemListItem[]>(
    () => getGuidebookItemSearchCached(appliedQuery, page, WIKI_ITEM_PER_PAGE)?.data ?? [],
  )
  const [total, setTotal] = useState(
    () => getGuidebookItemSearchCached(appliedQuery, page, WIKI_ITEM_PER_PAGE)?.total ?? 0,
  )
  const [totalPages, setTotalPages] = useState(
    () => getGuidebookItemSearchCached(appliedQuery, page, WIKI_ITEM_PER_PAGE)?.total_pages ?? 0,
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useLayoutEffect(() => {
    setQueryInput(appliedQuery)
  }, [appliedQuery])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = queryInput.trim()
      if (next === appliedQuery.trim()) return
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev)
          if (next) n.set('q', next)
          else n.delete('q')
          n.delete('page')
          return n
        },
        { replace: true },
      )
    }, 280)
    return () => window.clearTimeout(timer)
  }, [appliedQuery, queryInput, setSearchParams])

  const trimmedQuery = appliedQuery.trim()
  const canSearch = trimmedQuery.length >= MIN_QUERY_LENGTH

  useEffect(() => {
    if (!canSearch) {
      setItems([])
      setTotal(0)
      setTotalPages(0)
      setError(null)
      setLoading(false)
      return
    }

    const cached = getGuidebookItemSearchCached(trimmedQuery, page, WIKI_ITEM_PER_PAGE)
    if (cached) {
      setItems(cached.data)
      setTotal(cached.total)
      setTotalPages(cached.total_pages)
      setLoading(false)
    } else {
      setLoading(true)
    }
    setError(null)

    let cancelled = false
    void loadGuidebookItemSearch(trimmedQuery, page, WIKI_ITEM_PER_PAGE)
      .then((res) => {
        if (cancelled) return
        setItems(res.data)
        setTotal(res.total)
        setTotalPages(res.total_pages)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        if (!getGuidebookItemSearchCached(trimmedQuery, page, WIKI_ITEM_PER_PAGE)) {
          setError(e instanceof Error ? e.message : 'Item search failed.')
          setItems([])
          setTotal(0)
          setTotalPages(0)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [canSearch, page, trimmedQuery])

  const patchSearchParams = useCallback(
    (mutator: (next: URLSearchParams) => void) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          mutator(next)
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const nav = useMemo<WikiBrowseNav>(
    () => ({
      openItem: (id: string) => {
        patchSearchParams((n) => {
          n.set('item', id)
          n.delete('dungeon')
          n.delete('monster')
        })
      },
      openDungeon: (id: string) => {
        patchSearchParams((n) => {
          n.set('dungeon', id)
          n.delete('monster')
        })
      },
      openMonster: (id: string) => {
        patchSearchParams((n) => n.set('monster', id))
      },
      back: () => {
        patchSearchParams((n) => {
          if (n.get('monster')) n.delete('monster')
          else if (n.get('dungeon')) n.delete('dungeon')
          else n.delete('item')
        })
      },
    }),
    [patchSearchParams],
  )

  const setPage = useCallback(
    (nextPage: number) => {
      patchSearchParams((n) => {
        if (nextPage <= 0) n.delete('page')
        else n.set('page', String(nextPage))
      })
    },
    [patchSearchParams],
  )

  const status = useMemo(() => {
    if (queryInput.trim().length > 0 && queryInput.trim().length < MIN_QUERY_LENGTH) {
      return `Type at least ${MIN_QUERY_LENGTH} characters to search.`
    }
    if (!canSearch) return null
    if (loading && !items.length) return 'Searching…'
    if (error) return error
    if (!items.length) return 'No items found.'
    const pageLabel = totalPages > 1 ? ` · page ${page + 1} of ${totalPages}` : ''
    return `${total.toLocaleString()} item${total === 1 ? '' : 's'}${pageLabel}`
  }, [canSearch, error, items.length, loading, page, queryInput, total, totalPages])

  const hasDetail = Boolean(selectedItemId || selectedDungeonId || selectedMonsterId)

  return (
    <div className={`wiki-page${hasDetail ? ' wiki-page--split' : ''}`}>
      <PageHeader
        title="Wiki"
        lead="Search items from the Digital Odyssey wiki API. Open an item to review drops, dungeon rates, and loot tables."
      />

      <div className="wiki-page__layout">
        <section className="wiki-page__search" aria-label="Item search">
          <label className="wiki-page__field">
            <span className="visually-hidden">Search items</span>
            <span className="wiki-page__search-bar">
              <Search className="wiki-page__search-icon" size={18} strokeWidth={2.2} aria-hidden />
              <input
                type="search"
                className="wiki-page__input"
                placeholder="Search items…"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                autoComplete="off"
                autoFocus={!hasDetail}
              />
            </span>
          </label>

          {status ? (
            <p className={`wiki-page__status${error ? ' wiki-page__status--error' : ''}`} role="status">
              {status}
            </p>
          ) : null}

          {items.length > 0 ? (
            <ul className="wiki-page__results">
              {items.map((item) => {
                const icon = wikiItemIconUrl(item.icon_id)
                const selected = item.id === selectedItemId
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`wiki-page__row${selected ? ' wiki-page__row--active' : ''}`}
                      onClick={() => nav.openItem(item.id)}
                      aria-pressed={selected}
                    >
                      {icon ? (
                        <img
                          className="wiki-page__icon"
                          src={icon}
                          alt=""
                          width={32}
                          height={32}
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <span className="wiki-page__icon-fallback" aria-hidden>
                          ?
                        </span>
                      )}
                      <span className="wiki-page__row-text">
                        <span className="wiki-page__name">{item.name}</span>
                        <span className="wiki-page__meta">{item.type_name || 'Item'}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : null}

          {canSearch && totalPages > 1 ? (
            <div className="pager">
              <button type="button" disabled={page <= 0 || loading} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <span className="pager-status">{loading ? '…' : `${page + 1} / ${totalPages}`}</span>
              <button
                type="button"
                disabled={loading || page >= totalPages - 1}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          ) : null}
        </section>

        {hasDetail ? (
          <section className="wiki-page__detail" aria-live="polite">
            {selectedMonsterId ? (
              <WikiMonsterPanel monsterId={selectedMonsterId} nav={nav} />
            ) : selectedDungeonId ? (
              <WikiDungeonPanel
                dungeonId={selectedDungeonId}
                highlightItemId={selectedItemId}
                nav={nav}
              />
            ) : selectedItemId ? (
              <WikiItemPanel itemId={selectedItemId} nav={nav} />
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  )
}
