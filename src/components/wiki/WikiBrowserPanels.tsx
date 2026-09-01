import { useEffect, useMemo, useState } from 'react'
import { wikiItemIconUrl } from '../../lib/digimonImage'
import {
  dedupeItemDropSources,
  formatRaidQuantity,
  formatRaidRatePermil,
  raidSourceKey,
  parseWikiItemDescription,
} from '../../lib/guidebookItemPanel'
import {
  findDungeonDifficultyForRaidItem,
  guidebookDungeonDifficultySlug,
} from '../../lib/guidebookDungeonPanel'
import { dedupeMonsterLocations, groupMonsterDropsByType } from '../../lib/guidebookMonsterPanel'
import {
  getGuidebookDungeonDetailCached,
  getGuidebookItemDetailCached,
  getGuidebookMonsterDetailCached,
  loadGuidebookDungeonDetail,
  loadGuidebookItemDetail,
  loadGuidebookMonsterDetail,
} from '../../lib/guidebookWikiCache'
import {
  collectItemDungeonRows,
  collectItemRaidRowsWithoutDungeon,
  collectWikiDungeonLootRows,
  dungeonDetailDifficultyLabels,
  formatWikiRankLabel,
} from '../../lib/wikiBrowserLoot'
import type { WikiDungeonDetail, WikiItemDetail, WikiMonsterDetail } from '../../types/wikiApi'

export type WikiBrowseNav = {
  openItem: (id: string) => void
  openDungeon: (id: string) => void
  openMonster: (id: string) => void
  back: () => void
}

function WikiItemDescription({
  description,
  typeName,
}: {
  description: string
  typeName?: string
}) {
  const { text, labels } = useMemo(() => {
    const parsed = parseWikiItemDescription(description)
    const typeKey = typeName?.trim().toLowerCase()
    return {
      text: parsed.text,
      labels: typeKey ? parsed.labels.filter((label) => label.toLowerCase() !== typeKey) : parsed.labels,
    }
  }, [description, typeName])

  if (!text && !labels.length) return null

  return (
    <>
      {labels.length > 0 ? (
        <div className="wiki-browse__labels">
          {labels.map((label) => (
            <span key={label} className="wiki-browse__label">
              {label}
            </span>
          ))}
        </div>
      ) : null}
      {text ? <p className="wiki-browse__desc">{text}</p> : null}
    </>
  )
}

function WikiEntityIcon({ iconId, fallback = '?' }: { iconId?: string; fallback?: string }) {
  const icon = iconId ? wikiItemIconUrl(iconId) : undefined
  return icon ? (
    <img className="wiki-browse__icon" src={icon} alt="" width={40} height={40} />
  ) : (
    <span className="wiki-browse__icon-fallback" aria-hidden>
      {fallback}
    </span>
  )
}

export function WikiItemPanel({ itemId, nav }: { itemId: string; nav: WikiBrowseNav }) {
  const [item, setItem] = useState<WikiItemDetail | null>(() => getGuidebookItemDetailCached(itemId))
  const [loading, setLoading] = useState(!item)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const cached = getGuidebookItemDetailCached(itemId)
    setItem(cached)
    setLoading(!cached)
    setError(null)
    let cancelled = false
    void loadGuidebookItemDetail(itemId)
      .then((detail) => {
        if (!cancelled) setItem(detail)
      })
      .catch((e: unknown) => {
        if (!cancelled && !getGuidebookItemDetailCached(itemId)) {
          setError(e instanceof Error ? e.message : 'Could not load item.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [itemId])

  if (loading && !item) return <p className="wiki-browse__status">Loading item…</p>
  if (error) return <p className="wiki-browse__status wiki-browse__status--error">{error}</p>
  if (!item) return null

  return <WikiItemBody item={item} nav={nav} />
}

function WikiItemBody({ item, nav }: { item: WikiItemDetail; nav: WikiBrowseNav }) {
  const dropSources = useMemo(
    () => dedupeItemDropSources(item.drop_sources ?? []),
    [item.drop_sources],
  )
  const dungeonRows = useMemo(
    () => collectItemDungeonRows(item.raid_sources ?? []),
    [item.raid_sources],
  )
  const raidWithoutDungeon = useMemo(
    () => collectItemRaidRowsWithoutDungeon(item.raid_sources ?? []),
    [item.raid_sources],
  )

  return (
    <article className="wiki-browse" aria-label={`${item.name} details`}>
      <header className="wiki-browse__header">
        <div className="wiki-browse__icon-wrap">
          <WikiEntityIcon iconId={item.icon_id} />
        </div>
        <div className="wiki-browse__head-text">
          <h2 className="wiki-browse__title">{item.name}</h2>
          <p className="wiki-browse__type">{item.type_name || 'Item'}</p>
          {item.description ? (
            <WikiItemDescription description={item.description} typeName={item.type_name} />
          ) : null}
        </div>
      </header>

      {dungeonRows.length > 0 ? (
        <section className="wiki-browse__section">
          <h3 className="wiki-browse__sh">Dungeon rewards</h3>
          <p className="wiki-browse__hint">Click a dungeon to review its full loot table and rates.</p>
          <ul className="wiki-browse__dungeon-list">
            {dungeonRows.map((row) => (
              <li key={row.key}>
                <WikiItemDungeonCard row={row} itemId={item.id} onOpen={nav.openDungeon} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {raidWithoutDungeon.length > 0 ? (
        <section className="wiki-browse__section">
          <h3 className="wiki-browse__sh">Raid rewards</h3>
          <div className="wiki-browse__table-wrap">
            <table className="wiki-browse__table">
              <thead>
                <tr>
                  <th scope="col">Boss</th>
                  <th scope="col">Rank</th>
                  <th scope="col">Qty</th>
                  <th scope="col">Rate</th>
                </tr>
              </thead>
              <tbody>
                {raidWithoutDungeon.map((raid, index) => (
                  <tr key={raidSourceKey(raid, index)}>
                    <td>
                      <button
                        type="button"
                        className="wiki-browse__link-btn"
                        onClick={() => nav.openMonster(raid.boss_id)}
                      >
                        {raid.boss_name}{' '}
                        <span className="wiki-browse__muted">[Lv.{raid.boss_level}]</span>
                      </button>
                    </td>
                    <td>{formatWikiRankLabel(raid.rank_start, raid.rank_end)}</td>
                    <td>{formatRaidQuantity(raid.min, raid.max)}</td>
                    <td className="wiki-browse__rate">{formatRaidRatePermil(raid.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {dropSources.length > 0 ? (
        <section className="wiki-browse__section">
          <h3 className="wiki-browse__sh">Dropped by</h3>
          <div className="wiki-browse__table-wrap">
            <table className="wiki-browse__table">
              <thead>
                <tr>
                  <th scope="col">Monster</th>
                  <th scope="col">Type</th>
                  <th scope="col">Locations</th>
                </tr>
              </thead>
              <tbody>
                {dropSources.map((drop) => (
                  <tr key={drop.monster_id}>
                    <td>
                      <button
                        type="button"
                        className="wiki-browse__link-btn"
                        onClick={() => nav.openMonster(drop.monster_id)}
                      >
                        {drop.monster_name}{' '}
                        <span className="wiki-browse__muted">[Lv.{drop.monster_level}]</span>
                      </button>
                    </td>
                    <td>
                      <span
                        className={`wiki-browse__badge wiki-browse__badge--${drop.drop_type?.toLowerCase() || 'other'}`}
                      >
                        {drop.drop_type || '—'}
                      </span>
                    </td>
                    <td className="wiki-browse__maps">
                      {drop.locations?.length
                        ? drop.locations.map((loc) => loc.map_name).filter(Boolean).join(', ')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {!dungeonRows.length && !raidWithoutDungeon.length && !dropSources.length ? (
        <p className="wiki-browse__status">No drop or dungeon sources listed for this item.</p>
      ) : null}
    </article>
  )
}

function WikiItemDungeonCard({
  row,
  itemId,
  onOpen,
}: {
  row: ReturnType<typeof collectItemDungeonRows>[number]
  itemId: string
  onOpen: (id: string) => void
}) {
  const [difficulty, setDifficulty] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void loadGuidebookDungeonDetail(row.dungeonId)
      .then((detail) => {
        if (cancelled) return
        setDifficulty(findDungeonDifficultyForRaidItem(detail, itemId, row.bossId))
      })
      .catch(() => {
        if (!cancelled) setDifficulty(null)
      })
    return () => {
      cancelled = true
    }
  }, [itemId, row.bossId, row.dungeonId])

  const diffSlug = difficulty ? guidebookDungeonDifficultySlug(difficulty) : 'default'

  return (
    <button type="button" className="wiki-browse__dungeon-card" onClick={() => onOpen(row.dungeonId)}>
      <div className="wiki-browse__dungeon-card-copy">
        <div className="wiki-browse__dungeon-card-title">
          <span className="wiki-browse__dungeon-name">{row.dungeonName}</span>
          {difficulty ? (
            <span className={`guidebook-dungeon-diff guidebook-dungeon-diff--${diffSlug}`}>{difficulty}</span>
          ) : null}
        </div>
        <p className="wiki-browse__dungeon-meta">
          {row.bossName} [Lv.{row.bossLevel}] · {formatWikiRankLabel(row.rankStart, row.rankEnd)} · {row.qty}
        </p>
      </div>
      <div className="wiki-browse__rate-block" aria-label={`${row.rate} drop rate`}>
        <span className="wiki-browse__rate-value">{row.rate}</span>
        <span className="wiki-browse__rate-label">drop rate</span>
      </div>
    </button>
  )
}

export function WikiDungeonPanel({
  dungeonId,
  highlightItemId,
  nav,
}: {
  dungeonId: string
  highlightItemId?: string | null
  nav: WikiBrowseNav
}) {
  const [detail, setDetail] = useState<WikiDungeonDetail | null>(
    () => getGuidebookDungeonDetailCached(dungeonId),
  )
  const [loading, setLoading] = useState(!detail)
  const [error, setError] = useState<string | null>(null)
  const [difficulty, setDifficulty] = useState<string | null>(null)

  useEffect(() => {
    const cached = getGuidebookDungeonDetailCached(dungeonId)
    setDetail(cached)
    setLoading(!cached)
    setError(null)
    setDifficulty(null)
    let cancelled = false
    void loadGuidebookDungeonDetail(dungeonId)
      .then((next) => {
        if (!cancelled) setDetail(next)
      })
      .catch((e: unknown) => {
        if (!cancelled && !getGuidebookDungeonDetailCached(dungeonId)) {
          setError(e instanceof Error ? e.message : 'Could not load dungeon.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [dungeonId])

  const difficulties = useMemo(() => (detail ? dungeonDetailDifficultyLabels(detail) : []), [detail])
  const lootRows = useMemo(() => (detail ? collectWikiDungeonLootRows(detail) : []), [detail])

  useEffect(() => {
    if (!detail || difficulty) return
    const highlighted = highlightItemId
      ? findDungeonDifficultyForRaidItem(detail, highlightItemId)
      : null
    setDifficulty(highlighted ?? difficulties[0] ?? null)
  }, [detail, difficulties, difficulty, highlightItemId])

  const visibleRows = useMemo(() => {
    if (!difficulty) return lootRows
    return lootRows.filter((row) => row.difficulty === difficulty)
  }, [difficulty, lootRows])

  const clearRows = visibleRows.filter((row) => row.context === 'clear')
  const raidRows = visibleRows.filter((row) => row.context === 'raid')
  const highlightInRaid = Boolean(
    highlightItemId && raidRows.some((row) => row.itemId === highlightItemId),
  )
  const sections = highlightInRaid
    ? [
        { title: 'Raid rewards', rows: raidRows, showBoss: true },
        { title: 'Clear rewards', rows: clearRows, showBoss: false },
      ]
    : [
        { title: 'Clear rewards', rows: clearRows, showBoss: false },
        { title: 'Raid rewards', rows: raidRows, showBoss: true },
      ]

  useEffect(() => {
    const target = document.querySelector('.wiki-browse__loot-row--target')
    if (target instanceof HTMLElement) {
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [difficulty, dungeonId, highlightItemId])

  if (loading && !detail) return <p className="wiki-browse__status">Loading dungeon…</p>
  if (error) return <p className="wiki-browse__status wiki-browse__status--error">{error}</p>
  if (!detail) return null

  return (
    <article className="wiki-browse" aria-label={`${detail.name} dungeon rates`}>
      <header className="wiki-browse__header wiki-browse__header--stack">
        <button type="button" className="wiki-browse__back" onClick={nav.back}>
          ← Back
        </button>
        <div className="wiki-browse__head-text">
          <h2 className="wiki-browse__title">{detail.name}</h2>
          {detail.map_name ? <p className="wiki-browse__type">{detail.map_name}</p> : null}
        </div>
      </header>

      {difficulties.length > 0 ? (
        <div className="wiki-browse__diffs" role="tablist" aria-label="Dungeon difficulty">
          {difficulties.map((diff) => {
            const slug = guidebookDungeonDifficultySlug(diff)
            const active = diff === difficulty
            return (
              <button
                key={diff}
                type="button"
                role="tab"
                aria-selected={active}
                className={`guidebook-dungeon-diff guidebook-dungeon-diff--${slug} wiki-browse__diff${
                  active ? ' wiki-browse__diff--active' : ''
                }`}
                onClick={() => setDifficulty(diff)}
              >
                {diff}
              </button>
            )
          })}
        </div>
      ) : null}

      {sections.map((section) =>
        section.rows.length ? (
          <section key={section.title} className="wiki-browse__section">
            <h3 className="wiki-browse__sh">{section.title}</h3>
            <WikiLootTable
              rows={section.rows}
              highlightItemId={highlightItemId}
              onOpenItem={nav.openItem}
              showBoss={section.showBoss}
              onOpenMonster={section.showBoss ? nav.openMonster : undefined}
            />
          </section>
        ) : null,
      )}

      {!clearRows.length && !raidRows.length ? (
        <p className="wiki-browse__status">No loot listed for this difficulty.</p>
      ) : null}
    </article>
  )
}

function WikiLootTable({
  rows,
  highlightItemId,
  onOpenItem,
  showBoss,
  onOpenMonster,
}: {
  rows: ReturnType<typeof collectWikiDungeonLootRows>
  highlightItemId?: string | null
  onOpenItem: (id: string) => void
  showBoss?: boolean
  onOpenMonster?: (id: string) => void
}) {
  const showRate = rows.some((row) => Boolean(row.rate))

  return (
    <div className="wiki-browse__table-wrap">
      <table className="wiki-browse__table">
        <thead>
          <tr>
            <th scope="col">Item</th>
            {showBoss ? <th scope="col">Boss / rank</th> : null}
            <th scope="col">Qty</th>
            {showRate ? <th scope="col">Rate</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const highlight = Boolean(highlightItemId && row.itemId === highlightItemId)
            return (
              <tr
                key={row.key}
                className={highlight ? 'wiki-browse__loot-row wiki-browse__loot-row--target' : undefined}
              >
                <td>
                  <button type="button" className="wiki-browse__item-btn" onClick={() => onOpenItem(row.itemId)}>
                    <WikiEntityIcon iconId={row.iconId} />
                    <span>{row.itemName}</span>
                  </button>
                </td>
                {showBoss ? (
                  <td>
                    {row.bossId && onOpenMonster ? (
                      <button
                        type="button"
                        className="wiki-browse__link-btn"
                        onClick={() => onOpenMonster(row.bossId!)}
                      >
                        {row.bossName}
                      </button>
                    ) : (
                      (row.bossName ?? '—')
                    )}
                    {row.rankStart != null && row.rankEnd != null ? (
                      <span className="wiki-browse__muted">
                        {' '}
                        · {formatWikiRankLabel(row.rankStart, row.rankEnd)}
                      </span>
                    ) : null}
                  </td>
                ) : null}
                <td>{row.qty ?? '—'}</td>
                {showRate ? <td className="wiki-browse__rate">{row.rate ?? '—'}</td> : null}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function WikiMonsterPanel({ monsterId, nav }: { monsterId: string; nav: WikiBrowseNav }) {
  const [monster, setMonster] = useState<WikiMonsterDetail | null>(
    () => getGuidebookMonsterDetailCached(monsterId),
  )
  const [loading, setLoading] = useState(!monster)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const cached = getGuidebookMonsterDetailCached(monsterId)
    setMonster(cached)
    setLoading(!cached)
    setError(null)
    let cancelled = false
    void loadGuidebookMonsterDetail(monsterId)
      .then((detail) => {
        if (!cancelled) setMonster(detail)
      })
      .catch((e: unknown) => {
        if (!cancelled && !getGuidebookMonsterDetailCached(monsterId)) {
          setError(e instanceof Error ? e.message : 'Could not load monster.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [monsterId])

  const locations = useMemo(
    () => dedupeMonsterLocations(monster?.locations ?? []),
    [monster?.locations],
  )
  const dropGroups = useMemo(
    () => groupMonsterDropsByType(monster?.drops ?? []),
    [monster?.drops],
  )

  if (loading && !monster) return <p className="wiki-browse__status">Loading monster…</p>
  if (error) return <p className="wiki-browse__status wiki-browse__status--error">{error}</p>
  if (!monster) return null

  return (
    <article className="wiki-browse" aria-label={`${monster.name} details`}>
      <header className="wiki-browse__header wiki-browse__header--stack">
        <button type="button" className="wiki-browse__back" onClick={nav.back}>
          ← Back
        </button>
        <div className="wiki-browse__head-text">
          <h2 className="wiki-browse__title">
            {monster.name} <span className="wiki-browse__muted">[Lv.{monster.level}]</span>
          </h2>
          {monster.pen_name ? <p className="wiki-browse__type">{monster.pen_name}</p> : null}
        </div>
      </header>

      {locations.length > 0 ? (
        <section className="wiki-browse__section">
          <h3 className="wiki-browse__sh">Spawn locations</h3>
          <p className="wiki-browse__maps">{locations.map((loc) => loc.map_name).join(', ')}</p>
        </section>
      ) : null}

      {dropGroups.map((group) => (
        <section key={group.type} className="wiki-browse__section">
          <h3 className="wiki-browse__sh">{group.label}</h3>
          <ul className="wiki-browse__item-list">
            {group.items.map((drop) => (
              <li key={`${drop.item_id}-${drop.item_name}`}>
                <button
                  type="button"
                  className="wiki-browse__item-btn"
                  onClick={() => nav.openItem(drop.item_id)}
                >
                  <WikiEntityIcon iconId={drop.item_icon_id} />
                  <span>{drop.item_name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  )
}
