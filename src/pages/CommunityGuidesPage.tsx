import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { CommunityGuideThumbnail } from '../components/communityGuides/CommunityGuideThumbnail'
import {
  COMMUNITY_GUIDE_SORT_OPTIONS,
  fetchAuthorCommunityGuides,
  fetchPublishedCommunityGuides,
  formatCommunityGuideViewCount,
  sortCommunityGuides,
  type CommunityGuideListItem,
  type CommunityGuideSort,
} from '../lib/communityGuides'

function formatGuideDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function GuideTile({
  guide,
  showEdit,
  isDraft,
}: {
  guide: CommunityGuideListItem
  showEdit?: boolean
  isDraft?: boolean
}) {
  const viewCount = guide.view_count ?? 0
  const tileLink = isDraft ? `/guides/edit/${guide.id}` : `/guides/${guide.slug}`

  return (
    <li className={`community-guides-tile${isDraft ? ' community-guides-tile--draft' : ''}`}>
      <Link to={tileLink} className="community-guides-tile__link">
        <div className="community-guides-tile__media">
          <CommunityGuideThumbnail url={guide.thumbnail_url} />
          {isDraft ? <span className="community-guides-tile__draft-badge">Draft</span> : null}
        </div>
        <div className="community-guides-tile__body">
          <h3 className="community-guides-tile__title">{guide.title}</h3>
          <p className="community-guides-tile__meta">
            by <span className="community-guides-tile__author">{guide.author_name}</span>
          </p>
          <div className="community-guides-tile__foot">
            <time className="community-guides-tile__date" dateTime={guide.updated_at}>
              {formatGuideDate(guide.updated_at)}
            </time>
            <div className="community-guides-tile__stats">
              <span className="community-guides-tile__views" aria-label={`${viewCount} views`}>
                {formatCommunityGuideViewCount(viewCount)} views
              </span>
              <span className="community-guides-tile__hearts" aria-label={`${guide.heart_count} hearts`}>
                ♥ {guide.heart_count}
              </span>
            </div>
          </div>
        </div>
      </Link>
      {showEdit ? (
        <Link to={`/guides/edit/${guide.id}`} className="community-guides-tile__edit">
          Edit
        </Link>
      ) : null}
    </li>
  )
}

export function CommunityGuidesPage() {
  const { supabase, user, authReady } = useAuth()
  const [guides, setGuides] = useState<CommunityGuideListItem[]>([])
  const [myGuides, setMyGuides] = useState<CommunityGuideListItem[]>([])
  const [sort, setSort] = useState<CommunityGuideSort>('favorites')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      setError('Supabase is not configured.')
      return
    }
    let cancelled = false
    setLoading(true)
    void fetchPublishedCommunityGuides(supabase)
      .then((rows) => {
        if (!cancelled) setGuides(rows)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load guides.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [supabase])

  useEffect(() => {
    if (!supabase || !user) {
      setMyGuides([])
      return
    }
    let cancelled = false
    void fetchAuthorCommunityGuides(supabase, user.id)
      .then((rows) => {
        if (!cancelled) setMyGuides(rows)
      })
      .catch(() => {
        if (!cancelled) setMyGuides([])
      })
    return () => {
      cancelled = true
    }
  }, [supabase, user])

  const myGuideIds = useMemo(() => new Set(myGuides.map((g) => g.id)), [myGuides])
  const sortedGuides = useMemo(() => sortCommunityGuides(guides, sort), [guides, sort])

  return (
    <div className="community-guides-page">
      <header className="community-guides-hero">
        <div className="community-guides-hero__head">
          <h1 className="community-guides-hero__title">Community Guides</h1>
        </div>
        {authReady && user ? (
          <Link to="/guides/new" className="community-guides-btn community-guides-btn--primary">
            Write a guide
          </Link>
        ) : (
          <Link to="/auth" className="community-guides-btn community-guides-btn--ghost">
            Sign in to write
          </Link>
        )}
      </header>

      {loading ? <p className="community-guides-status">Loading guides…</p> : null}
      {error ? <p className="community-guides-error">{error}</p> : null}

      {authReady && user && myGuides.length > 0 ? (
        <section className="community-guides-section community-guides-section--mine">
          <details className="community-guides-details">
            <summary
              className="community-guides-details__summary"
              aria-label={`Your guides, ${myGuides.length} total`}
            >
              <span className="community-guides-details__label">
                <span id="my-guides-heading" className="community-guides-details__title">
                  Your guides
                </span>
                <span className="community-guides-details__count" aria-hidden>
                  {myGuides.length}
                </span>
              </span>
            </summary>
            <div className="community-guides-details__body">
              <p className="community-guides-section__lead">
                Drafts and published guides you have written.
              </p>
              <ul className="community-guides-grid">
                {myGuides.map((guide) => (
                  <GuideTile
                    key={guide.id}
                    guide={guide}
                    showEdit
                    isDraft={guide.status === 'draft'}
                  />
                ))}
              </ul>
            </div>
          </details>
        </section>
      ) : null}

      {!loading && !error && guides.length === 0 ? (
        <p className="community-guides-empty">No guides yet. Be the first to share one.</p>
      ) : null}

      {!loading && guides.length > 0 ? (
        <section className="community-guides-section" aria-labelledby="all-guides-heading">
          <div className="community-guides-section__head">
            <h2 id="all-guides-heading" className="community-guides-section__title">
              {myGuides.length > 0 ? 'All guides' : 'Guides'}
            </h2>
            <label className="community-guides-sort">
              <span className="community-guides-sort__label">Sort by</span>
              <select
                className="community-guides-sort__select"
                value={sort}
                onChange={(e) => setSort(e.target.value as CommunityGuideSort)}
              >
                {COMMUNITY_GUIDE_SORT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ul className="community-guides-grid">
            {sortedGuides.map((guide) => (
              <GuideTile key={guide.id} guide={guide} showEdit={myGuideIds.has(guide.id)} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
