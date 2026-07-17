import { Fragment, useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { wikiItemPageUrl } from '../api/itemService'
import { wikiDungeonPageUrl } from '../api/dungeonService'
import {
  wikiDungeonDetailMatchesSearch,
  wikiDungeonMatchingLootItems,
  type DungeonLootSearchMatch,
} from '../lib/dungeonBrowserSearch'
import { compareDungeonsByDrpDesc, formatDungeonDrpCell } from '../lib/dungeonDrpValues'
import { wikiItemIconUrl } from '../lib/digimonImage'
import {
  getGuidebookDungeonDetailCached,
  loadGuidebookAllDungeons,
  loadGuidebookDungeonDetail,
} from '../lib/guidebookWikiCache'
import { nonStoryDifficulties } from '../lib/wikiDungeons'
import type { WikiDungeonDetail, WikiDungeonListItem } from '../types/wikiApi'

function DungeonLootMatches({ matches }: { matches: DungeonLootSearchMatch[] }) {
  if (!matches.length) return null
  return (
    <ul className="dungeons-loot-matches">
      {matches.map((match) => {
        const icon = wikiItemIconUrl(match.iconId)
        const label = [match.itemName, match.meta, `${match.difficulty} · ${match.context}`]
          .filter(Boolean)
          .join(' — ')
        return (
          <li key={match.key} className="dungeons-loot-match">
            {icon ? (
              <img
                className="dungeons-loot-match__icon"
                src={icon}
                alt=""
                width={28}
                height={28}
                loading="lazy"
                decoding="async"
              />
            ) : (
              <span className="dungeons-loot-match__icon-fallback" aria-hidden>
                ?
              </span>
            )}
            <div className="dungeons-loot-match__body">
              <a
                className="dungeons-loot-match__name"
                href={wikiItemPageUrl(match.itemId)}
                target="_blank"
                rel="noreferrer noopener"
              >
                {match.itemName}
              </a>
              {match.meta ? <span className="dungeons-loot-match__meta">{match.meta}</span> : null}
              <span className="dungeons-loot-match__context">
                {match.difficulty} · {match.context}
              </span>
            </div>
            <span className="visually-hidden">{label}</span>
          </li>
        )
      })}
    </ul>
  )
}

export function DungeonsPage() {
  const [dungeons, setDungeons] = useState<WikiDungeonListItem[]>([])
  const [detailById, setDetailById] = useState<Record<string, WikiDungeonDetail>>({})
  const [loading, setLoading] = useState(true)
  const [indexingDetails, setIndexingDetails] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await loadGuidebookAllDungeons()
        if (!cancelled) setDungeons(data)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load dungeons.')
          setDungeons([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!dungeons.length) return
    const cached: Record<string, WikiDungeonDetail> = {}
    for (const dungeon of dungeons) {
      const detail = getGuidebookDungeonDetailCached(dungeon.id)
      if (detail) cached[dungeon.id] = detail
    }
    if (Object.keys(cached).length) {
      setDetailById((prev) => ({ ...cached, ...prev }))
    }
  }, [dungeons])

  useEffect(() => {
    if (loading || error || !dungeons.length) return
    let cancelled = false
    const ids = dungeons.map((d) => d.id)
    setIndexingDetails(true)
    const concurrency = 3
    const worker = async () => {
      while (!cancelled) {
        const id = ids.shift()
        if (!id) break
        try {
          const detail = await loadGuidebookDungeonDetail(id)
          if (cancelled) return
          setDetailById((prev) => (prev[id] ? prev : { ...prev, [id]: detail }))
        } catch {
          /* ignore per-dungeon failures */
        }
      }
    }

    void Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, () => worker())).finally(
      () => {
        if (!cancelled) setIndexingDetails(false)
      },
    )

    return () => {
      cancelled = true
    }
  }, [dungeons, loading, error])

  const filteredDungeons = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = [...dungeons].sort(compareDungeonsByDrpDesc)
    if (!q) return list
    return list.filter((dungeon) => {
      if (dungeon.name.toLowerCase().includes(q)) return true
      const detail = detailById[dungeon.id]
      return detail ? wikiDungeonDetailMatchesSearch(detail, q) : false
    })
  }, [dungeons, query, detailById])

  const lootMatchesByDungeonId = useMemo(() => {
    const q = query.trim()
    if (!q) return {} as Record<string, DungeonLootSearchMatch[]>
    const map: Record<string, DungeonLootSearchMatch[]> = {}
    for (const dungeon of filteredDungeons) {
      const detail = detailById[dungeon.id]
      if (!detail) continue
      const matches = wikiDungeonMatchingLootItems(detail, q)
      if (matches.length) map[dungeon.id] = matches
    }
    return map
  }, [filteredDungeons, query, detailById])

  return (
    <div className="dungeons-page">
      <PageHeader
        title="Dungeons"
        lead="Browse instanced dungeons from the wiki with Dungeon Reward Points (DRP), bosses, and loot search."
      />

      <section className="dungeons-section" aria-labelledby="dungeons-list-heading">
        <div className="dungeons-section__head">
          <h2 id="dungeons-list-heading" className="dungeons-section__title">
            All dungeons
          </h2>
          <label className="dungeons-search">
            <span className="visually-hidden">Search dungeons</span>
            <input
              type="search"
              className="dungeons-search__input"
              placeholder="Search by name, Digimon, or loot…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>

        <p className="dungeons-section__note">
          {loading
            ? 'Loading dungeons…'
            : indexingDetails && query.trim()
              ? 'Still loading dungeon details for monster and loot search…'
              : `${filteredDungeons.length} / ${dungeons.length} shown · Sorted by DRP (highest first)`}
        </p>
        <p className="dungeons-section__note dungeons-section__note--muted">
          Story Mode only gives 1 DRP.
        </p>

        {loading ? (
          <p className="dungeons-status">Loading dungeons…</p>
        ) : error ? (
          <p className="dungeons-status dungeons-status--error" role="alert">
            {error}
          </p>
        ) : filteredDungeons.length === 0 ? (
          <p className="dungeons-status">No dungeons match your search.</p>
        ) : (
          <div className="dungeons-table-wrap">
            <table className="dungeons-table">
              <thead>
                <tr>
                  <th scope="col">Dungeon</th>
                  <th scope="col" title="Dungeon Reward Points">
                    DRP
                  </th>
                  <th scope="col">Difficulties</th>
                  <th scope="col">Wiki</th>
                </tr>
              </thead>
              <tbody>
                {filteredDungeons.map((dungeon) => {
                  const difficulties = nonStoryDifficulties(dungeon)
                  const lootMatches = lootMatchesByDungeonId[dungeon.id] ?? []
                  return (
                    <Fragment key={dungeon.id}>
                      <tr>
                        <td className="dungeons-table__name">{dungeon.name}</td>
                        <td className="dungeons-table__drp">
                          {formatDungeonDrpCell(dungeon.name, difficulties)}
                        </td>
                        <td>
                          {difficulties.length ? (
                            <span className="dungeons-difficulty-list">
                              {difficulties.map((d) => (
                                <span
                                  key={d}
                                  className={`dungeons-difficulty dungeons-difficulty--${d.trim().toLowerCase()}`}
                                >
                                  {d}
                                </span>
                              ))}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <a
                            className="dungeons-wiki-link"
                            href={wikiDungeonPageUrl(dungeon.id)}
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            Open
                          </a>
                        </td>
                      </tr>
                      {lootMatches.length > 0 ? (
                        <tr className="dungeons-table__loot-row">
                          <td colSpan={4}>
                            <DungeonLootMatches matches={lootMatches} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
