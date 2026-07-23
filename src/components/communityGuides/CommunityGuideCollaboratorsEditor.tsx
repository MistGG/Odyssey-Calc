import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  communityGuideInviteUrl,
  copyCommunityGuideInviteLink,
  createCommunityGuideInvite,
  fetchCommunityGuideCollaborators,
  revokeCommunityGuideCollaborator,
  type CommunityGuideCollaborator,
} from '../../lib/communityGuideCollab'

type CommunityGuideCollaboratorsEditorProps = {
  supabase: SupabaseClient
  guideId: string
  isOwner: boolean
  currentUserId: string
}

export function CommunityGuideCollaboratorsEditor({
  supabase,
  guideId,
  isOwner,
  currentUserId,
}: CommunityGuideCollaboratorsEditorProps) {
  const [rows, setRows] = useState<CommunityGuideCollaborator[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await fetchCommunityGuideCollaborators(supabase, guideId)
      setRows(next)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load collaborators.')
    } finally {
      setLoading(false)
    }
  }, [supabase, guideId])

  useEffect(() => {
    void reload()
  }, [reload])

  const onCreateInvite = useCallback(
    async (named: boolean) => {
      if (!isOwner || busy) return
      setBusy(true)
      setError(null)
      try {
        const invite = await createCommunityGuideInvite(
          supabase,
          guideId,
          named ? displayName : null,
        )
        if (invite.invite_token) {
          const url = communityGuideInviteUrl(invite.invite_token)
          setLastInviteUrl(url)
          const ok = await copyCommunityGuideInviteLink(invite.invite_token)
          if (ok) {
            setCopiedId(invite.id)
            window.setTimeout(() => setCopiedId(null), 2000)
          }
        }
        setDisplayName('')
        await reload()
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not create invite.')
      } finally {
        setBusy(false)
      }
    },
    [isOwner, busy, supabase, guideId, displayName, reload],
  )

  const onCopy = useCallback(async (row: CommunityGuideCollaborator) => {
    if (!row.invite_token) return
    const ok = await copyCommunityGuideInviteLink(row.invite_token)
    if (ok) {
      setLastInviteUrl(communityGuideInviteUrl(row.invite_token))
      setCopiedId(row.id)
      window.setTimeout(() => setCopiedId(null), 2000)
    }
  }, [])

  const onRevoke = useCallback(
    async (row: CommunityGuideCollaborator) => {
      if (busy) return
      const label =
        row.status === 'accepted'
          ? row.display_name || 'this collaborator'
          : 'this pending invite'
      if (!window.confirm(`Remove ${label}?`)) return
      setBusy(true)
      setError(null)
      try {
        await revokeCommunityGuideCollaborator(supabase, row.id)
        await reload()
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not remove collaborator.')
      } finally {
        setBusy(false)
      }
    },
    [busy, supabase, reload],
  )

  if (!isOwner) {
    const self = rows.find((row) => row.user_id === currentUserId && row.status === 'accepted')
    if (!self) return null
    return (
      <fieldset className="community-guide-collab-editor">
        <legend className="community-guides-field__label">Collaboration</legend>
        <p className="community-guides-field__hint">
          You can edit this guide as a collaborator. The owner manages invites.
        </p>
      </fieldset>
    )
  }

  return (
    <fieldset className="community-guide-collab-editor">
      <legend className="community-guides-field__label">Collaborators</legend>
      <p className="community-guides-field__hint">
        Invite people to edit this guide with you. Share an invite link, or look someone up by
        their display name.
      </p>

      <div className="community-guide-collab-editor__invite">
        <input
          type="text"
          className="community-guides-field__input"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Player display name (optional)"
          maxLength={64}
          disabled={busy}
        />
        <div className="community-guide-collab-editor__invite-actions">
          <button
            type="button"
            className="community-guides-btn community-guides-btn--ghost"
            disabled={busy || !displayName.trim()}
            onClick={() => void onCreateInvite(true)}
          >
            Invite by name
          </button>
          <button
            type="button"
            className="community-guides-btn community-guides-btn--primary"
            disabled={busy}
            onClick={() => void onCreateInvite(false)}
          >
            {busy ? 'Working…' : 'Copy invite link'}
          </button>
        </div>
      </div>

      {lastInviteUrl ? (
        <div className="community-guide-collab-editor__link">
          <span className="community-guides-field__hint">Invite link</span>
          <a href={lastInviteUrl} className="community-guide-collab-editor__link-url">
            {lastInviteUrl}
          </a>
        </div>
      ) : null}

      {loading ? <p className="community-guides-status">Loading collaborators…</p> : null}
      {error ? <p className="community-guides-error">{error}</p> : null}

      {!loading && rows.length > 0 ? (
        <ul className="community-guide-collab-editor__list">
          {rows.map((row) => (
            <li key={row.id} className="community-guide-collab-editor__row">
              <div className="community-guide-collab-editor__meta">
                <span className="community-guide-collab-editor__name">
                  {row.status === 'accepted'
                    ? row.display_name || 'Collaborator'
                    : row.display_name
                      ? `Invite for ${row.display_name}`
                      : 'Open invite link'}
                </span>
                <span
                  className={`community-guide-collab-editor__status community-guide-collab-editor__status--${row.status}`}
                >
                  {row.status === 'accepted' ? 'Editor' : 'Pending'}
                </span>
              </div>
              <div className="community-guide-collab-editor__row-actions">
                {row.status === 'pending' && row.invite_token ? (
                  <button
                    type="button"
                    className="community-guides-btn community-guides-btn--ghost"
                    disabled={busy}
                    onClick={() => void onCopy(row)}
                  >
                    {copiedId === row.id ? 'Copied' : 'Copy link'}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="community-guides-btn community-guides-btn--danger"
                  disabled={busy}
                  onClick={() => void onRevoke(row)}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </fieldset>
  )
}
