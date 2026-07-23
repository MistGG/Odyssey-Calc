import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { CommunityGuideBody } from '../components/communityGuides/CommunityGuideBody'
import { CommunityGuideChangelog } from '../components/communityGuides/CommunityGuideChangelog'
import { CommunityGuideSocialLinks } from '../components/communityGuides/CommunityGuideSocialLinks'
import { GuidebookWikiOverlayProvider } from '../components/guidebook/GuidebookWikiOverlay'
import {
  fetchAcceptedCommunityGuideCollaborators,
  type CommunityGuideCollaborator,
} from '../lib/communityGuideCollab'
import {
  communityGuideShareUrl,
  copyCommunityGuideShareLink,
  deleteCommunityGuide,
  incrementCommunityGuideView,
  fetchCommunityGuideBySlug,
  fetchUserHeartedGuide,
  formatCommunityGuideViewCount,
  toggleCommunityGuideHeart,
  type CommunityGuide,
} from '../lib/communityGuides'

function formatGuideDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function CommunityGuideDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { supabase, user, authReady } = useAuth()
  const [guide, setGuide] = useState<CommunityGuide | null>(null)
  const [hearted, setHearted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [heartBusy, setHeartBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [shareLinkVisible, setShareLinkVisible] = useState(false)
  const [collaborators, setCollaborators] = useState<CommunityGuideCollaborator[]>([])
  const [canEdit, setCanEdit] = useState(false)

  const shareUrl = useMemo(() => (guide ? communityGuideShareUrl(guide.slug) : ''), [guide])

  useEffect(() => {
    if (!slug || !supabase) {
      setLoading(false)
      if (!supabase) setError('Supabase is not configured.')
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetchCommunityGuideBySlug(supabase, slug)
      .then((row) => {
        if (!cancelled) setGuide(row)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load guide.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [slug, supabase])

  useEffect(() => {
    if (!supabase || !user || !guide) {
      setHearted(false)
      return
    }
    let cancelled = false
    void fetchUserHeartedGuide(supabase, user.id, guide.id)
      .then((hearted) => {
        if (!cancelled) setHearted(hearted)
      })
      .catch(() => {
        if (!cancelled) setHearted(false)
      })
    return () => {
      cancelled = true
    }
  }, [supabase, user, guide])

  useEffect(() => {
    if (!supabase || !guide) {
      setCollaborators([])
      setCanEdit(false)
      return
    }
    let cancelled = false
    void fetchAcceptedCommunityGuideCollaborators(supabase, guide.id)
      .then((rows) => {
        if (cancelled) return
        setCollaborators(rows)
        const isAuthor = user?.id === guide.author_id
        const isCollab = Boolean(user && rows.some((row) => row.user_id === user.id))
        setCanEdit(Boolean(isAuthor || isCollab))
      })
      .catch(() => {
        if (!cancelled) {
          setCollaborators([])
          setCanEdit(user?.id === guide.author_id)
        }
      })
    return () => {
      cancelled = true
    }
  }, [supabase, guide, user])

  useEffect(() => {
    if (!supabase || !guide) return
    const key = `community-guide-view:${guide.id}`
    if (sessionStorage.getItem(key)) return
    void incrementCommunityGuideView(supabase, guide.id)
      .then((count) => {
        if (count != null) {
          sessionStorage.setItem(key, '1')
          setGuide((prev) => (prev ? { ...prev, view_count: count } : prev))
        }
      })
  }, [supabase, guide?.id])

  const onHeart = useCallback(async () => {
    if (!supabase || !user || !guide || heartBusy) return
    setHeartBusy(true)
    try {
      const result = await toggleCommunityGuideHeart(supabase, guide.id, user.id, hearted)
      setHearted(result.hearted)
      if (result.heartCount != null) {
        setGuide((prev) => (prev ? { ...prev, heart_count: result.heartCount! } : prev))
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not update heart.')
    } finally {
      setHeartBusy(false)
    }
  }, [supabase, user, guide, hearted, heartBusy])

  const onCopyShareLink = useCallback(async () => {
    if (!guide) return
    setShareLinkVisible(true)
    const ok = await copyCommunityGuideShareLink(guide.slug)
    if (ok) {
      setShareCopied(true)
      window.setTimeout(() => setShareCopied(false), 2000)
    }
  }, [guide])

  const onDelete = useCallback(async () => {
    if (!supabase || !user || !guide || deleteBusy) return
    const confirmed = window.confirm(
      `Delete "${guide.title}"? This cannot be undone.`,
    )
    if (!confirmed) return

    setDeleteBusy(true)
    setError(null)
    try {
      await deleteCommunityGuide(supabase, guide.id, user.id)
      navigate('/guides', { replace: true })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not delete guide.')
      setDeleteBusy(false)
    }
  }, [supabase, user, guide, deleteBusy, navigate])

  if (loading) {
    return <p className="community-guides-status">Loading guide…</p>
  }

  if (error && !guide) {
    return (
      <div className="community-guides-page">
        <p className="community-guides-error">{error}</p>
        <Link to="/guides" className="community-guides-back">
          ← All guides
        </Link>
      </div>
    )
  }

  if (!guide) {
    return (
      <div className="community-guides-page">
        <p className="community-guides-empty">Guide not found.</p>
        <Link to="/guides" className="community-guides-back">
          ← All guides
        </Link>
      </div>
    )
  }

  const isAuthor = user?.id === guide.author_id
  const viewCount = guide.view_count ?? 0
  const collaboratorNames = collaborators
    .map((row) => row.display_name.trim())
    .filter(Boolean)

  return (
    <GuidebookWikiOverlayProvider>
      <article className="community-guides-page community-guides-detail">
        <div className="community-guides-detail__shell">
          <div className="community-guides-detail__toolbar">
            <Link to="/guides" className="community-guides-detail__back">
              ← All guides
            </Link>
            <div className="community-guides-detail__toolbar-actions">
              <button
                type="button"
                className={`community-guides-heart community-guides-detail__tool${hearted ? ' is-hearted' : ''}`}
                disabled={!authReady || !user || heartBusy}
                onClick={() => void onHeart()}
                title={user ? (hearted ? 'Remove heart' : 'Heart this guide') : 'Sign in to heart'}
              >
                ♥ {guide.heart_count}
              </button>
              <button
                type="button"
                className="community-guides-btn community-guides-btn--ghost community-guides-detail__tool"
                onClick={() => void onCopyShareLink()}
              >
                {shareCopied ? 'Link copied' : 'Copy share link'}
              </button>
              {canEdit ? (
                <Link
                  to={`/guides/edit/${guide.id}`}
                  className="community-guides-btn community-guides-btn--ghost community-guides-detail__tool"
                >
                  Edit
                </Link>
              ) : null}
              {isAuthor ? (
                <button
                  type="button"
                  className="community-guides-btn community-guides-btn--danger community-guides-detail__tool"
                  disabled={deleteBusy}
                  onClick={() => void onDelete()}
                >
                  {deleteBusy ? 'Deleting…' : 'Delete'}
                </button>
              ) : null}
            </div>
          </div>

          <header className="community-guides-detail__header">
            <h1 className="community-guides-detail__title">{guide.title}</h1>
            <p className="community-guides-detail__byline">
              by{' '}
              <span className="community-guides-detail__author-name">{guide.author_name}</span>
              {collaboratorNames.length > 0 ? (
                <>
                  <span className="community-guides-detail__byline-sep" aria-hidden>
                    ·
                  </span>
                  <span>
                    with {collaboratorNames.join(', ')}
                  </span>
                </>
              ) : null}
              <span className="community-guides-detail__byline-sep" aria-hidden>
                ·
              </span>
              <time dateTime={guide.updated_at}>Updated {formatGuideDate(guide.updated_at)}</time>
              <span className="community-guides-detail__byline-sep" aria-hidden>
                ·
              </span>
              <span>{formatCommunityGuideViewCount(viewCount)} views</span>
            </p>
            <CommunityGuideSocialLinks links={guide.social_links} />
          </header>

          {shareLinkVisible ? (
            <div className="community-guides-detail__share">
              <span className="community-guides-detail__share-label">Share link</span>
              <a href={shareUrl} className="community-guides-detail__share-url">
                {shareUrl}
              </a>
            </div>
          ) : null}

          {error ? <p className="community-guides-error community-guides-detail__error">{error}</p> : null}

          <section className="community-guides-detail__content" aria-label="Guide content">
            <CommunityGuideBody body={guide.body} embedded />
          </section>

          {supabase ? <CommunityGuideChangelog supabase={supabase} guideId={guide.id} /> : null}
        </div>
      </article>
    </GuidebookWikiOverlayProvider>
  )
}
