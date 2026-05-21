import { useMemo } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { ForumTeaserEmbed } from '../components/ForumTeaserEmbed'
import { getTeaserArchive, getTeaserArchiveEntry } from '../lib/teaserArchive'

export function TeasersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const archive = useMemo(() => getTeaserArchive(), [])
  const selectedId = searchParams.get('id')
  const selected = useMemo(() => getTeaserArchiveEntry(selectedId), [selectedId])

  if (!selectedId) {
    const fallback = getTeaserArchiveEntry(null)
    if (fallback) {
      return <Navigate to={`/teasers?id=${encodeURIComponent(fallback.id)}`} replace />
    }
  }

  if (!selected) {
    return (
      <div className="teasers-page">
        <Link to="/teasers">Teasers</Link>
      </div>
    )
  }

  return (
    <div className="teasers-page">
      <h1 className="teasers-hero__title">Teasers</h1>

      <div className="teasers-layout">
        <aside className="teasers-archive" aria-label="Teaser dates">
          <ul className="teasers-archive__list">
            {archive.map((entry) => {
              const isSelected = entry.id === selected.id
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={`teasers-archive__item${isSelected ? ' teasers-archive__item--active' : ''}${
                      entry.isCurrent ? ' teasers-archive__item--live' : ''
                    }`}
                    onClick={() => setSearchParams({ id: entry.id }, { replace: true })}
                  >
                    <span className="teasers-archive__thumb-wrap">
                      <img
                        className="teasers-archive__thumb"
                        src={entry.imageUrl}
                        alt=""
                        width={120}
                        height={68}
                        loading="lazy"
                        decoding="async"
                      />
                    </span>
                    <span className="teasers-archive__date">{entry.dateLabel}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </aside>

        <section className="teasers-stage" aria-label="Teaser preview">
          <p className="teasers-stage__date">{selected.dateLabel}</p>
          <div className="teasers-stage__embed">
            <ForumTeaserEmbed
              key={selected.id}
              imageUrl={selected.imageUrl}
              imgurId={selected.imgurId}
              fullEffects={selected.fullEffects}
            />
          </div>
        </section>
      </div>
    </div>
  )
}
