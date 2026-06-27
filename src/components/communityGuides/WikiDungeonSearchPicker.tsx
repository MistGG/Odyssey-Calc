import { useEffect, useMemo, useState } from 'react'
import { getGuidebookDungeonsCached, loadGuidebookAllDungeons } from '../../lib/guidebookWikiCache'
import { guidebookDungeonDifficultySlug } from '../../lib/guidebookDungeonPanel'
import { dungeonWikiDifficultyLabels } from '../../lib/wikiDungeons'
import type { WikiDungeonListItem } from '../../types/wikiApi'

type WikiDungeonSearchPickerProps = {
  onSelect: (dungeon: WikiDungeonListItem, difficulty: string) => void
  label?: string
}

export function WikiDungeonSearchPicker({
  onSelect,
  label = 'Search dungeons',
}: WikiDungeonSearchPickerProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dungeons, setDungeons] = useState<WikiDungeonListItem[]>(() => getGuidebookDungeonsCached(500) ?? [])
  const [filter, setFilter] = useState('')
  const [picked, setPicked] = useState<WikiDungeonListItem | null>(null)

  useEffect(() => {
    let cancelled = false
    const cached = getGuidebookDungeonsCached(500)
    if (cached) {
      setDungeons(cached)
      setLoading(false)
    } else {
      setLoading(true)
    }
    setError(null)
    void loadGuidebookAllDungeons(500)
      .then((all) => {
        if (!cancelled) setDungeons(all)
      })
      .catch((e) => {
        if (!cancelled && !getGuidebookDungeonsCached(500)) {
          setError(e instanceof Error ? e.message : 'Could not load dungeons.')
          setDungeons([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const pool = q
      ? dungeons.filter(
          (d) =>
            d.name.toLowerCase().includes(q) ||
            (d.map_name?.toLowerCase().includes(q) ?? false),
        )
      : dungeons
    return pool.slice(0, q ? 24 : 18)
  }, [dungeons, filter])

  const difficulties = useMemo(
    () => (picked ? dungeonWikiDifficultyLabels(picked) : []),
    [picked],
  )

  if (picked) {
    return (
      <div className="wiki-entity-picker wiki-entity-picker--difficulty">
        <button type="button" className="wiki-entity-picker__back" onClick={() => setPicked(null)}>
          ← Back
        </button>
        <p className="wiki-entity-picker__picked-name">{picked.name}</p>
        <p className="wiki-entity-picker__diff-prompt">Select a difficulty</p>
        <div className="wiki-entity-picker__diff-bubbles">
          {difficulties.map((diff) => (
            <button
              key={diff}
              type="button"
              className={`guidebook-dungeon-diff guidebook-dungeon-diff--${guidebookDungeonDifficultySlug(diff)} wiki-entity-picker__diff-bubble`}
              onClick={() => onSelect(picked, diff)}
            >
              {diff}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="wiki-entity-picker">
      <label className="wiki-entity-picker__label">
        <span className="wiki-entity-picker__title">{label}</span>
        <input
          type="search"
          className="wiki-entity-picker__input"
          placeholder="Search dungeons…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          autoComplete="off"
        />
      </label>
      {loading && !dungeons.length ? (
        <p className="wiki-entity-picker__hint">Loading…</p>
      ) : null}
      {error ? <p className="wiki-entity-picker__hint">{error}</p> : null}
      {filtered.length > 0 ? (
        <ul className="wiki-entity-picker__list">
          {filtered.map((dungeon) => (
            <li key={dungeon.id}>
              <button
                type="button"
                className="wiki-entity-picker__row"
                onClick={() => setPicked(dungeon)}
              >
                <span className="wiki-entity-picker__name">{dungeon.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : !loading && !error ? (
        <p className="wiki-entity-picker__hint">No dungeons found.</p>
      ) : null}
    </div>
  )
}
