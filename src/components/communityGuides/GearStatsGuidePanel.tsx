import { wikiItemPageUrl } from '../../api/itemService'
import { wikiItemIconUrl } from '../../lib/digimonImage'
import {
  formatGearStatRange,
  GEAR_STATS_CATEGORIES,
  GEAR_STATS_SOURCE_URL,
  type GearStatsCategory,
  type GearStatsPiece,
} from '../../lib/gearStatsReference'
import { useAllGearStatsWikiIcons } from './useGearStatsWikiIcons'

function GearStatsPieceCard({
  piece,
  category,
  iconId,
  itemId,
}: {
  piece: GearStatsPiece
  category: GearStatsCategory
  iconId?: string
  itemId?: string
}) {
  const iconUrl = iconId ? wikiItemIconUrl(iconId) : undefined
  const wikiLabel = `${category.dataPrefix} Data: ${piece.name}`

  return (
    <article className="gear-stats-piece" aria-label={wikiLabel}>
      <header className="gear-stats-piece__head">
        <div className="gear-stats-piece__icon-wrap">
          {iconUrl ? (
            itemId ? (
              <a
                href={wikiItemPageUrl(itemId)}
                target="_blank"
                rel="noreferrer noopener"
                className="gear-stats-piece__icon-link"
              >
                <img
                  className="gear-stats-piece__icon"
                  src={iconUrl}
                  alt=""
                  width={48}
                  height={48}
                  loading="lazy"
                  decoding="async"
                />
              </a>
            ) : (
              <img
                className="gear-stats-piece__icon"
                src={iconUrl}
                alt=""
                width={48}
                height={48}
                loading="lazy"
                decoding="async"
              />
            )
          ) : (
            <span className="gear-stats-piece__icon-fallback" aria-hidden>
              ?
            </span>
          )}
        </div>
        <div className="gear-stats-piece__titles">
          <h3 className="gear-stats-piece__name">{piece.name}</h3>
          <p className="gear-stats-piece__data-label muted">{wikiLabel}</p>
        </div>
      </header>

      <div className="gear-stats-piece__table-wrap">
        <table className="gear-stats-piece__table">
          <thead>
            <tr>
              <th scope="col">Stat</th>
              <th scope="col">Range</th>
              <th scope="col">Max slots</th>
            </tr>
          </thead>
          <tbody>
            {piece.rolls.map((entry) => (
              <tr key={entry.stat}>
                <th scope="row">{entry.stat}</th>
                <td>{formatGearStatRange(entry)}</td>
                <td>{entry.maxSlots}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  )
}

export function GearStatsGuidePanel() {
  const icons = useAllGearStatsWikiIcons()

  return (
    <div className="gear-stats-guide">
      {GEAR_STATS_CATEGORIES.map((category) => (
        <section
          key={category.slug}
          className="gear-stats-category"
          aria-labelledby={`gear-stats-${category.slug}-heading`}
        >
          <h2 id={`gear-stats-${category.slug}-heading`} className="gear-stats-category__title">
            {category.label}
          </h2>
          <div className="gear-stats-category__grid">
            {category.pieces.map((piece) => {
              const resolved = icons[piece.slug]
              return (
                <GearStatsPieceCard
                  key={piece.slug}
                  piece={piece}
                  category={category}
                  iconId={resolved?.iconId ?? piece.iconId}
                  itemId={resolved?.itemId ?? piece.wikiItemId}
                />
              )
            })}
          </div>
        </section>
      ))}

      <p className="gear-stats-guide__source muted">
        Data from{' '}
        <a href={GEAR_STATS_SOURCE_URL} target="_blank" rel="noreferrer noopener">
          The Digital Odyssey Gear Stats doc
        </a>
        .
      </p>
    </div>
  )
}
