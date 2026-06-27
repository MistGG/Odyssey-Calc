import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { CommunityGuideBody } from '../components/communityGuides/CommunityGuideBody'
import { CommunityGuideMarkdownToolbar } from '../components/communityGuides/CommunityGuideMarkdownToolbar'
import { CommunityGuideThumbnail } from '../components/communityGuides/CommunityGuideThumbnail'
import { WikiItemSearchPicker } from '../components/communityGuides/WikiItemSearchPicker'
import { WikiQuestSearchPicker } from '../components/communityGuides/WikiQuestSearchPicker'
import { WikiDungeonSearchPicker } from '../components/communityGuides/WikiDungeonSearchPicker'
import { GuidebookWikiOverlayProvider } from '../components/guidebook/GuidebookWikiOverlay'
import { communityGuideEmbedToken } from '../lib/communityGuideEmbed'
import { isAllowedCommunityGuideImageUrl } from '../lib/communityGuideImageUrl'
import {
  createCommunityGuide,
  deleteCommunityGuide,
  fetchCommunityGuideForAuthor,
  updateCommunityGuide,
} from '../lib/communityGuides'
import type { WikiDungeonListItem, WikiItemListItem, WikiQuestListItem } from '../types/wikiApi'

function insertAtCursor(textarea: HTMLTextAreaElement, token: string) {
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const before = textarea.value.slice(0, start)
  const after = textarea.value.slice(end)
  const spacerBefore = before.length > 0 && !/\s$/.test(before) ? ' ' : ''
  const spacerAfter = after.length > 0 && !/^\s/.test(after) ? ' ' : ''
  const next = `${before}${spacerBefore}${token}${spacerAfter}${after}`
  textarea.value = next
  const pos = (before + spacerBefore + token + spacerAfter).length
  textarea.selectionStart = pos
  textarea.selectionEnd = pos
  textarea.focus()
  return next
}

function insertBlockAtCursor(textarea: HTMLTextAreaElement, token: string) {
  const block = `\n\n${token}\n\n`
  const start = textarea.selectionStart
  const before = textarea.value.slice(0, start)
  const after = textarea.value.slice(start)
  const next = `${before}${block}${after}`
  textarea.value = next
  const pos = before.length + block.length
  textarea.selectionStart = pos
  textarea.selectionEnd = pos
  textarea.focus()
  return next
}

export function CommunityGuideEditorPage() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const { supabase, user, profileDisplayName, authReady } = useAuth()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [title, setTitle] = useState('')
  const [thumbnailUrl, setThumbnailUrl] = useState('')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(Boolean(id))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [activePicker, setActivePicker] = useState<'item' | 'quest' | 'dungeon' | null>(null)

  useEffect(() => {
    if (!authReady) return
    if (!user) {
      navigate('/auth', { replace: true })
    }
  }, [authReady, user, navigate])

  useEffect(() => {
    if (!id || !supabase || !user) {
      setLoading(false)
      return
    }
    let cancelled = false
    void fetchCommunityGuideForAuthor(supabase, id, user.id)
      .then((guide) => {
        if (cancelled) return
        if (!guide) {
          setError('Guide not found or you are not the author.')
          return
        }
        setTitle(guide.title)
        setThumbnailUrl(guide.thumbnail_url ?? '')
        setBody(guide.body)
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
  }, [id, supabase, user])

  const insertEmbed = useCallback((token: string) => {
    const el = textareaRef.current
    if (el) {
      setBody(insertAtCursor(el, token))
    } else {
      setBody((prev) => (prev ? `${prev} ${token}` : token))
    }
    setActivePicker(null)
    setShowPreview(false)
  }, [])

  const insertBlockEmbed = useCallback((token: string) => {
    const el = textareaRef.current
    if (el) {
      setBody(insertBlockAtCursor(el, token))
    } else {
      setBody((prev) => (prev ? `${prev}\n\n${token}\n\n` : token))
    }
    setActivePicker(null)
    setShowPreview(false)
  }, [])

  const onItemSelect = useCallback(
    (item: WikiItemListItem) => {
      insertEmbed(communityGuideEmbedToken({ kind: 'item', id: item.id, label: item.name }))
    },
    [insertEmbed],
  )

  const onQuestSelect = useCallback(
    (quest: WikiQuestListItem) => {
      insertEmbed(
        communityGuideEmbedToken({
          kind: 'quest',
          id: quest.id,
          label: quest.title_text,
        }),
      )
    },
    [insertEmbed],
  )

  const onDungeonSelect = useCallback(
    (dungeon: WikiDungeonListItem, difficulty: string) => {
      insertBlockEmbed(
        communityGuideEmbedToken({
          kind: 'dungeon',
          id: dungeon.id,
          label: dungeon.name,
          difficulty,
        }),
      )
    },
    [insertBlockEmbed],
  )

  const onSave = useCallback(async () => {
    if (!supabase || !user) return
    setSaving(true)
    setError(null)
    try {
      const authorName = profileDisplayName?.trim() || 'Player'
      const payload = { title, body, authorName, thumbnailUrl: thumbnailUrl || null }
      if (id) {
        const updated = await updateCommunityGuide(supabase, id, user.id, payload)
        navigate(`/guides/${updated.slug}`, { replace: true })
      } else {
        const created = await createCommunityGuide(supabase, user.id, payload)
        navigate(`/guides/${created.slug}`, { replace: true })
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save guide.')
    } finally {
      setSaving(false)
    }
  }, [supabase, user, id, title, body, thumbnailUrl, profileDisplayName, navigate])

  const onDelete = useCallback(async () => {
    if (!supabase || !user || !id || deleting) return
    const confirmed = window.confirm(
      `Delete "${title.trim() || 'this guide'}"? This cannot be undone.`,
    )
    if (!confirmed) return

    setDeleting(true)
    setError(null)
    try {
      await deleteCommunityGuide(supabase, id, user.id)
      navigate('/guides', { replace: true })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not delete guide.')
      setDeleting(false)
    }
  }, [supabase, user, id, title, deleting, navigate])

  if (!authReady || loading) {
    return <p className="community-guides-status">Loading editor…</p>
  }

  const thumbnailPreviewValid =
    thumbnailUrl.trim().length > 0 && isAllowedCommunityGuideImageUrl(thumbnailUrl)

  return (
    <GuidebookWikiOverlayProvider>
      <div className="community-guides-page community-guides-editor">
        <Link to="/guides" className="community-guides-back">
          ← All guides
        </Link>

        <header className="community-guides-editor__head">
          <h1 className="community-guides-hero__title">{id ? 'Edit guide' : 'Write a guide'}</h1>
        </header>

        <div className="community-guides-editor__layout">
          <div className="community-guides-editor__main">
            <label className="community-guides-field">
              <span className="community-guides-field__label">Title</span>
              <input
                type="text"
                className="community-guides-field__input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                placeholder="Early game farming route"
              />
            </label>

            <label className="community-guides-field">
              <span className="community-guides-field__label">Thumbnail (optional)</span>
              <input
                type="url"
                className="community-guides-field__input"
                value={thumbnailUrl}
                onChange={(e) => setThumbnailUrl(e.target.value)}
                placeholder="https://example.com/cover.png"
              />
              <span className="community-guides-field__hint">
                Direct image URL for your guide card. Leave blank to use the site logo.
              </span>
            </label>

            <div className="community-guides-editor__thumbnail-preview">
              <span className="community-guides-editor__thumbnail-preview-label">Card preview</span>
              <CommunityGuideThumbnail
                url={thumbnailPreviewValid ? thumbnailUrl : null}
                className="community-guides-editor__thumbnail-preview-img"
              />
            </div>

            <div className="community-guides-editor__toolbar community-guides-editor__toolbar--wiki">
              <span className="community-guides-editor__toolbar-label">Wiki links</span>
              <button
                type="button"
                className={`community-guides-btn community-guides-btn--ghost${activePicker === 'item' ? ' is-active' : ''}`}
                onClick={() => setActivePicker((p) => (p === 'item' ? null : 'item'))}
              >
                + Item
              </button>
              <button
                type="button"
                className={`community-guides-btn community-guides-btn--ghost${activePicker === 'quest' ? ' is-active' : ''}`}
                onClick={() => setActivePicker((p) => (p === 'quest' ? null : 'quest'))}
              >
                + Quest
              </button>
              <button
                type="button"
                className={`community-guides-btn community-guides-btn--ghost${activePicker === 'dungeon' ? ' is-active' : ''}`}
                onClick={() => setActivePicker((p) => (p === 'dungeon' ? null : 'dungeon'))}
              >
                + Dungeon
              </button>
              <button
                type="button"
                className={`community-guides-btn community-guides-btn--ghost${showPreview ? ' is-active' : ''}`}
                onClick={() => setShowPreview((v) => !v)}
              >
                Preview
              </button>
            </div>

            {activePicker === 'item' ? <WikiItemSearchPicker onSelect={onItemSelect} /> : null}
            {activePicker === 'quest' ? <WikiQuestSearchPicker onSelect={onQuestSelect} /> : null}
            {activePicker === 'dungeon' ? <WikiDungeonSearchPicker onSelect={onDungeonSelect} /> : null}

            {!showPreview ? (
              <>
                <CommunityGuideMarkdownToolbar textareaRef={textareaRef} onChange={setBody} />
                <label className="community-guides-field">
                  <span className="community-guides-field__label">Body</span>
                  <textarea
                    ref={textareaRef}
                    className="community-guides-field__textarea"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={16}
                    placeholder="Write your guide… Use the toolbar for formatting, or **bold**, *italic*, lists, and wiki links."
                  />
                </label>
              </>
            ) : null}

            {showPreview ? (
              <section className="community-guides-editor__preview" aria-label="Preview">
                <h2 className="community-guides-editor__preview-title">Preview</h2>
                <CommunityGuideBody body={body} />
              </section>
            ) : null}

            {error ? <p className="community-guides-error">{error}</p> : null}

            <div className="community-guides-editor__actions">
              <button
                type="button"
                className="community-guides-btn community-guides-btn--primary"
                disabled={saving || deleting}
                onClick={() => void onSave()}
              >
                {saving ? 'Saving…' : 'Publish guide'}
              </button>
              {id ? (
                <button
                  type="button"
                  className="community-guides-btn community-guides-btn--danger"
                  disabled={saving || deleting}
                  onClick={() => void onDelete()}
                >
                  {deleting ? 'Deleting…' : 'Delete guide'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </GuidebookWikiOverlayProvider>
  )
}
