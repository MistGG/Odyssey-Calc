import { FORUM_TEASER_THREAD_URL } from '../lib/forumTeaserImage'
import { useLiveForumTeaserMeta } from '../hooks/useLiveForumTeaserMeta'
import { ForumTeaserEmbed } from './ForumTeaserEmbed'

function formatTeaserUpdatedAt(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Latest forum announcement teaser (manifest + UK-safe bundled image under /teasers/).
 */
export function LatestForumTeaserPanel({ className = '' }: { className?: string }) {
  const meta = useLiveForumTeaserMeta()
  const readMoreUrl = meta?.readMoreUrl ?? FORUM_TEASER_THREAD_URL
  const updatedLabel = formatTeaserUpdatedAt(meta?.updatedAt ?? null)

  return (
    <section
      className={`latest-forum-teaser meter-parses-meter-chrome${className ? ` ${className}` : ''}`}
      aria-labelledby="latest-forum-teaser-heading"
    >
      <div className="latest-forum-teaser__glow" aria-hidden />
      <header className="latest-forum-teaser__head">
        <div>
          <p className="latest-forum-teaser__kicker">Incoming transmission</p>
          <h2 id="latest-forum-teaser-heading" className="latest-forum-teaser__title">
            Latest teaser
          </h2>
          {updatedLabel ? (
            <p className="latest-forum-teaser__updated">Synced {updatedLabel}</p>
          ) : null}
        </div>
        <a
          className="latest-forum-teaser__more"
          href={readMoreUrl}
          target="_blank"
          rel="noreferrer noopener"
        >
          Read on forums ↗
        </a>
      </header>
      <div className="latest-forum-teaser__stage">
        <ForumTeaserEmbed linkHref={readMoreUrl} imgurId={meta?.imgurId} />
      </div>
    </section>
  )
}
