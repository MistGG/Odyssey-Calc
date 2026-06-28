import { useEffect, useState, type ReactNode } from 'react'
import { wikiItemIconUrl } from '../../lib/digimonImage'
import { resolveWikiItemByNameOrId } from '../../lib/wikiItemResolve'
import type { ParsedCommunityGuideTableBlock } from '../../lib/communityGuideMarkdownTable'
import { useGuidebookWikiOverlay } from '../guidebook/GuidebookWikiOverlay'

function CommunityGuideTableItemHeader({
  itemName,
  title,
}: {
  itemName: string
  title?: string
}) {
  const { openItemRoot } = useGuidebookWikiOverlay()
  const [resolvedId, setResolvedId] = useState<string | null>(null)
  const [iconId, setIconId] = useState('')
  const [name, setName] = useState(itemName)

  useEffect(() => {
    let cancelled = false
    void resolveWikiItemByNameOrId(itemName)
      .then((item) => {
        if (cancelled || !item) return
        setResolvedId(item.id)
        setIconId(item.icon_id)
        setName(item.name)
      })
      .catch(() => {
        /* keep fallback name */
      })
    return () => {
      cancelled = true
    }
  }, [itemName])

  const icon = wikiItemIconUrl(iconId)

  return (
    <header className="community-guide-table-card__head">
      <button
        type="button"
        className="community-guide-table-card__item"
        disabled={!resolvedId}
        onClick={() => {
          if (resolvedId) openItemRoot(resolvedId)
        }}
      >
        {icon ? (
          <img className="community-guide-table-card__icon" src={icon} alt="" width={48} height={48} />
        ) : (
          <span className="community-guide-table-card__icon-fallback" aria-hidden>
            ?
          </span>
        )}
        <span className="community-guide-table-card__item-copy">
          {title ? <span className="community-guide-table-card__title">{title}</span> : null}
          <span className="community-guide-table-card__item-name">{name}</span>
        </span>
      </button>
    </header>
  )
}

type CommunityGuideTableCardProps = {
  table: ParsedCommunityGuideTableBlock
  renderCell: (content: string, key: string) => ReactNode
}

export function CommunityGuideTableCard({ table, renderCell }: CommunityGuideTableCardProps) {
  const showHeader = Boolean(table.title || table.item)

  return (
    <article className="community-guide-table-card">
      {showHeader ? (
        table.item ? (
          <CommunityGuideTableItemHeader itemName={table.item.itemName} title={table.title} />
        ) : (
          <header className="community-guide-table-card__head community-guide-table-card__head--title-only">
            <h3 className="community-guide-table-card__title">{table.title}</h3>
          </header>
        )
      ) : null}

      <div className="community-guide-table-card__table-wrap">
        <table className="community-guide-table-card__table">
          <thead>
            <tr>
              {table.headers.map((header) => (
                <th key={header} scope="col">
                  {renderCell(header, `th-${header}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {table.headers.map((_, colIndex) => {
                  const content = row[colIndex] ?? ''
                  const cellKey = `r${rowIndex}c${colIndex}`
                  if (colIndex === 0) {
                    return (
                      <th key={colIndex} scope="row">
                        {renderCell(content, cellKey)}
                      </th>
                    )
                  }
                  return <td key={colIndex}>{renderCell(content, cellKey)}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  )
}
