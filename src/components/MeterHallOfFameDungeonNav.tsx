import { difficultySelectOptions } from '../lib/wikiDungeons'
import type { WikiDungeonListItem } from '../types/wikiApi'

export type HallOfFameDungeonOption = {
  dungeonId: string
  dungeonName: string
}

function diffToneClass(label: string): string {
  const n = label.trim().toLowerCase()
  if (n.includes('hard')) return 'meter-hof-nav__diff--hard'
  if (n.includes('normal')) return 'meter-hof-nav__diff--normal'
  return ''
}

export function MeterHallOfFameDungeonNav({
  dungeons,
  dungeonOptions,
  dungeonId,
  difficultyId,
  expandedDungeonId,
  onToggleDungeon,
  onSelectScope,
  loading,
}: {
  dungeons: WikiDungeonListItem[]
  dungeonOptions: HallOfFameDungeonOption[]
  dungeonId: string
  difficultyId: number | null
  expandedDungeonId: string
  onToggleDungeon: (id: string) => void
  onSelectScope: (dungeonId: string, difficultyId: number) => void
  loading?: boolean
}) {
  return (
    <nav className="meter-hof-nav" aria-label="Dungeons and difficulty">
      <div className="meter-hof-nav__head">
        <h2 className="meter-hof-nav__title">Dungeons</h2>
        {loading ? (
          <span className="meter-hof-nav__status muted" role="status">
            Loading…
          </span>
        ) : null}
      </div>
      <ul className="meter-hof-nav__list">
        {dungeonOptions.map((d) => {
          const expanded = expandedDungeonId === d.dungeonId
          const scopeActive = dungeonId === d.dungeonId && difficultyId != null
          const difficultyOptions = difficultySelectOptions(dungeons, d.dungeonId)

          return (
            <li
              key={d.dungeonId}
              className={`meter-hof-nav__item${expanded ? ' meter-hof-nav__item--expanded' : ''}${scopeActive ? ' meter-hof-nav__item--scoped' : ''}`}
            >
              <button
                type="button"
                className={`meter-hof-nav__dungeon${expanded ? ' meter-hof-nav__dungeon--expanded' : ''}${scopeActive ? ' meter-hof-nav__dungeon--scoped' : ''}`}
                aria-expanded={expanded}
                onClick={() => onToggleDungeon(d.dungeonId)}
              >
                <span className="meter-hof-nav__dungeon-name">{d.dungeonName}</span>
                <span className="meter-hof-nav__chevron" aria-hidden>
                  {expanded ? '▾' : '▸'}
                </span>
              </button>
              {expanded && difficultyOptions.length > 0 ? (
                <ul className="meter-hof-nav__diffs" aria-label={`${d.dungeonName} difficulty`}>
                  {difficultyOptions.map((diff) => {
                    const diffActive = dungeonId === d.dungeonId && difficultyId === diff.difficultyId
                    const tone = diffToneClass(diff.label)
                    return (
                      <li key={diff.difficultyId}>
                        <button
                          type="button"
                          className={`meter-hof-nav__diff ${tone}${diffActive ? ' meter-hof-nav__diff--active' : ''}`}
                          aria-current={diffActive ? 'true' : undefined}
                          onClick={() => onSelectScope(d.dungeonId, diff.difficultyId)}
                        >
                          {diff.label}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
