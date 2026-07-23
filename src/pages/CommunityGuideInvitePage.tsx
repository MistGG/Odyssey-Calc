import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import {
  acceptCommunityGuideInvite,
  fetchCommunityGuideInvitePreview,
  type CommunityGuideInvitePreview,
} from '../lib/communityGuideCollab'

export function CommunityGuideInvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { supabase, user, authReady } = useAuth()
  const [preview, setPreview] = useState<CommunityGuideInvitePreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token || !supabase) {
      setLoading(false)
      if (!supabase) setError('Supabase is not configured.')
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetchCommunityGuideInvitePreview(supabase, token)
      .then((row) => {
        if (!cancelled) setPreview(row)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load invite.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token, supabase])

  const onAccept = useCallback(async () => {
    if (!supabase || !user || !token || busy) return
    setBusy(true)
    setError(null)
    try {
      const accepted = await acceptCommunityGuideInvite(supabase, token)
      navigate(`/guides/edit/${accepted.guide_id}`, { replace: true })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not accept invite.')
      setBusy(false)
    }
  }, [supabase, user, token, busy, navigate])

  if (!authReady || loading) {
    return <p className="community-guides-status">Loading invite…</p>
  }

  if (error && !preview) {
    return (
      <div className="community-guides-page community-guide-invite">
        <p className="community-guides-error">{error}</p>
        <Link to="/guides" className="community-guides-back">
          ← All guides
        </Link>
      </div>
    )
  }

  if (!preview) {
    return (
      <div className="community-guides-page community-guide-invite">
        <p className="community-guides-empty">This invite is invalid or has already been used.</p>
        <Link to="/guides" className="community-guides-back">
          ← All guides
        </Link>
      </div>
    )
  }

  return (
    <div className="community-guides-page community-guide-invite">
      <Link to="/guides" className="community-guides-back">
        ← All guides
      </Link>
      <header className="community-guide-invite__head">
        <h1 className="community-guides-hero__title">Guide collaboration invite</h1>
        <p className="community-guide-invite__lead">
          <strong>{preview.author_name}</strong> invited you to edit{' '}
          <strong>{preview.guide_title}</strong>.
        </p>
      </header>

      {error ? <p className="community-guides-error">{error}</p> : null}

      {!user ? (
        <div className="community-guide-invite__actions">
          <Link to="/auth" className="community-guides-btn community-guides-btn--primary">
            Sign in to accept
          </Link>
        </div>
      ) : (
        <div className="community-guide-invite__actions">
          <button
            type="button"
            className="community-guides-btn community-guides-btn--primary"
            disabled={busy}
            onClick={() => void onAccept()}
          >
            {busy ? 'Accepting…' : 'Accept invite'}
          </button>
          {preview.guide_slug ? (
            <Link
              to={`/guides/${preview.guide_slug}`}
              className="community-guides-btn community-guides-btn--ghost"
            >
              View guide
            </Link>
          ) : null}
        </div>
      )}
    </div>
  )
}
