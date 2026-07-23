import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { CommunityGuideBody } from '../components/communityGuides/CommunityGuideBody'
import { CommunityGuideCollaboratorsEditor } from '../components/communityGuides/CommunityGuideCollaboratorsEditor'
import { CommunityGuideMarkdownToolbar } from '../components/communityGuides/CommunityGuideMarkdownToolbar'
import { CommunityGuideThumbnail } from '../components/communityGuides/CommunityGuideThumbnail'
import { WikiItemSearchPicker } from '../components/communityGuides/WikiItemSearchPicker'
import { WikiQuestSearchPicker } from '../components/communityGuides/WikiQuestSearchPicker'
import { WikiDigimonSearchPicker } from '../components/communityGuides/WikiDigimonSearchPicker'
import { WikiDungeonSearchPicker } from '../components/communityGuides/WikiDungeonSearchPicker'
import {
  CommunityGuideSocialLinksEditor,
  socialDraftsFromLinks,
  type CommunityGuideSocialDraft,
} from '../components/communityGuides/CommunityGuideSocialLinksEditor'
import { CommunityGuideSocialLinks } from '../components/communityGuides/CommunityGuideSocialLinks'
import { GuidebookWikiOverlayProvider } from '../components/guidebook/GuidebookWikiOverlay'
import { appendCommunityGuideChangelog } from '../lib/communityGuideChangelog'
import { communityGuideEmbedToken } from '../lib/communityGuideEmbed'
import {
  clearCommunityGuideEditorCache,
  COMMUNITY_GUIDE_COLLAB_SYNC_MS,
  communityGuideEditorGuideKey,
  editorDraftMatchesGuide,
  migrateCommunityGuideEditorCache,
  peekCommunityGuideUpdatedAt,
  readCommunityGuideEditorCache,
  writeCommunityGuideEditorCache,
  type CommunityGuideEditorCacheSocial,
} from '../lib/communityGuideEditorCache'
import { isAllowedCommunityGuideImageUrl } from '../lib/communityGuideImageUrl'
import {
  createCommunityGuide,
  deleteCommunityGuide,
  fetchCommunityGuideForAuthor,
  updateCommunityGuide,
  type CommunityGuide,
} from '../lib/communityGuides'
import type {
  WikiDigimonListItem,
  WikiDungeonListItem,
  WikiItemListItem,
  WikiQuestListItem,
} from '../types/wikiApi'

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

function socialDraftsToCache(links: CommunityGuideSocialDraft[]): CommunityGuideEditorCacheSocial[] {
  return links.map(({ platform, url }) => ({ platform, url }))
}

function applyGuideToForm(
  guide: CommunityGuide,
  setters: {
    setTitle: (v: string) => void
    setThumbnailUrl: (v: string) => void
    setBody: (v: string) => void
    setGuideStatus: (v: 'draft' | 'published') => void
    setAuthorId: (v: string) => void
    setSocialLinks: (v: CommunityGuideSocialDraft[]) => void
  },
) {
  setters.setTitle(guide.title)
  setters.setThumbnailUrl(guide.thumbnail_url ?? '')
  setters.setBody(guide.body)
  setters.setGuideStatus(guide.status)
  setters.setAuthorId(guide.author_id)
  setters.setSocialLinks(socialDraftsFromLinks(guide.social_links))
}

export function CommunityGuideEditorPage() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const { supabase, user, profileDisplayName, authReady } = useAuth()
  const userId = user?.id ?? null
  const guideKey = communityGuideEditorGuideKey(id)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [title, setTitle] = useState('')
  const [thumbnailUrl, setThumbnailUrl] = useState('')
  const [body, setBody] = useState('')
  const [socialLinks, setSocialLinks] = useState<CommunityGuideSocialDraft[]>([])
  const [loading, setLoading] = useState(Boolean(id))
  const [saving, setSaving] = useState(false)
  const [savingAction, setSavingAction] = useState<'draft' | 'publish' | null>(null)
  const [guideStatus, setGuideStatus] = useState<'draft' | 'published'>('draft')
  const [authorId, setAuthorId] = useState<string | null>(null)
  const [changelogNote, setChangelogNote] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [activePicker, setActivePicker] = useState<'item' | 'quest' | 'digimon' | 'dungeon' | null>(
    null,
  )
  const [restoredFromCache, setRestoredFromCache] = useState(false)
  const [remoteConflict, setRemoteConflict] = useState<CommunityGuide | null>(null)
  const [syncNotice, setSyncNotice] = useState<string | null>(null)

  const serverUpdatedAtRef = useRef<string | null>(null)
  const dirtyRef = useRef(false)
  const hydratedRef = useRef(false)
  const loadedKeyRef = useRef<string | null>(null)
  const formSnapshotRef = useRef({
    title: '',
    body: '',
    thumbnailUrl: '',
    socialLinks: [] as CommunityGuideEditorCacheSocial[],
    changelogNote: '',
  })
  const remoteConflictRef = useRef<CommunityGuide | null>(null)
  const syncBusyRef = useRef(false)

  useEffect(() => {
    formSnapshotRef.current = {
      title,
      body,
      thumbnailUrl,
      socialLinks: socialDraftsToCache(socialLinks),
      changelogNote,
    }
  }, [title, body, thumbnailUrl, socialLinks, changelogNote])

  useEffect(() => {
    remoteConflictRef.current = remoteConflict
  }, [remoteConflict])

  useEffect(() => {
    if (!authReady) return
    if (!user) {
      navigate('/auth', { replace: true })
    }
  }, [authReady, user, navigate])

  const markDirty = useCallback(() => {
    dirtyRef.current = true
    setRestoredFromCache(false)
    setSyncNotice(null)
  }, [])

  const persistCache = useCallback(
    (dirty: boolean) => {
      if (!userId) return
      const snap = formSnapshotRef.current
      writeCommunityGuideEditorCache({
        guideKey,
        userId,
        title: snap.title,
        body: snap.body,
        thumbnailUrl: snap.thumbnailUrl,
        socialLinks: snap.socialLinks,
        changelogNote: snap.changelogNote,
        baseUpdatedAt: serverUpdatedAtRef.current,
        dirty,
      })
    },
    [guideKey, userId],
  )

  const applyServerGuide = useCallback(
    (guide: CommunityGuide, options?: { keepChangelog?: boolean }) => {
      applyGuideToForm(guide, {
        setTitle,
        setThumbnailUrl,
        setBody,
        setGuideStatus,
        setAuthorId,
        setSocialLinks,
      })
      if (!options?.keepChangelog) setChangelogNote('')
      serverUpdatedAtRef.current = guide.updated_at
      dirtyRef.current = false
      setRemoteConflict(null)
      setRestoredFromCache(false)
      if (userId) {
        writeCommunityGuideEditorCache({
          guideKey: communityGuideEditorGuideKey(guide.id),
          userId,
          title: guide.title,
          body: guide.body,
          thumbnailUrl: guide.thumbnail_url ?? '',
          socialLinks: guide.social_links.map(({ platform, url }) => ({ platform, url })),
          changelogNote: options?.keepChangelog ? formSnapshotRef.current.changelogNote : '',
          baseUpdatedAt: guide.updated_at,
          dirty: false,
        })
      }
    },
    [userId],
  )

  // Initial load (and restore local cache). Depends on userId string, not user object identity.
  useEffect(() => {
    if (!userId || !supabase) {
      if (!id) setLoading(false)
      return
    }

    const loadKey = `${userId}:${guideKey}`
    if (loadedKeyRef.current === loadKey && hydratedRef.current) return

    let cancelled = false
    hydratedRef.current = false
    loadedKeyRef.current = loadKey
    setRemoteConflict(null)
    setSyncNotice(null)
    setRestoredFromCache(false)

    const finishNewGuide = () => {
      const cached = readCommunityGuideEditorCache(userId, 'new')
      if (cached?.dirty) {
        setTitle(cached.title)
        setThumbnailUrl(cached.thumbnailUrl)
        setBody(cached.body)
        setSocialLinks(socialDraftsFromLinks(cached.socialLinks))
        setChangelogNote(cached.changelogNote)
        dirtyRef.current = true
        serverUpdatedAtRef.current = null
        setRestoredFromCache(true)
      } else {
        dirtyRef.current = false
        serverUpdatedAtRef.current = null
      }
      setLoading(false)
      hydratedRef.current = true
    }

    if (!id) {
      finishNewGuide()
      return () => {
        cancelled = true
      }
    }

    setLoading(true)
    void fetchCommunityGuideForAuthor(supabase, id, userId)
      .then((guide) => {
        if (cancelled) return
        if (!guide) {
          setError('Guide not found or you do not have permission to edit it.')
          setLoading(false)
          return
        }

        const cached = readCommunityGuideEditorCache(userId, guideKey)
        const cacheMatchesServerBase =
          cached &&
          cached.dirty &&
          (cached.baseUpdatedAt === guide.updated_at ||
            (!cached.baseUpdatedAt && !guide.updated_at))
        const cacheHasEdits =
          cached &&
          cached.dirty &&
          !editorDraftMatchesGuide(cached, guide)

        if (cacheMatchesServerBase && cacheHasEdits) {
          setTitle(cached.title)
          setThumbnailUrl(cached.thumbnailUrl)
          setBody(cached.body)
          setGuideStatus(guide.status)
          setAuthorId(guide.author_id)
          setSocialLinks(socialDraftsFromLinks(cached.socialLinks))
          setChangelogNote(cached.changelogNote)
          serverUpdatedAtRef.current = guide.updated_at
          dirtyRef.current = true
          setRestoredFromCache(true)
        } else if (
          cached?.dirty &&
          cached.baseUpdatedAt &&
          cached.baseUpdatedAt !== guide.updated_at &&
          !editorDraftMatchesGuide(cached, guide)
        ) {
          // Local unsaved work + newer server copy — keep local, offer remote.
          setTitle(cached.title)
          setThumbnailUrl(cached.thumbnailUrl)
          setBody(cached.body)
          setGuideStatus(guide.status)
          setAuthorId(guide.author_id)
          setSocialLinks(socialDraftsFromLinks(cached.socialLinks))
          setChangelogNote(cached.changelogNote)
          serverUpdatedAtRef.current = cached.baseUpdatedAt
          dirtyRef.current = true
          setRemoteConflict(guide)
          setRestoredFromCache(true)
        } else {
          applyServerGuide(guide, { keepChangelog: false })
        }
        setLoading(false)
        hydratedRef.current = true
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load guide.')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [id, guideKey, supabase, userId, applyServerGuide])

  // Debounced local cache while editing.
  useEffect(() => {
    if (!userId || !hydratedRef.current || loading) return
    const timer = window.setTimeout(() => {
      persistCache(dirtyRef.current)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [userId, loading, title, body, thumbnailUrl, socialLinks, changelogNote, persistCache])

  // Collaborator sync: cheap updated_at peek every 10s; full body only when changed.
  useEffect(() => {
    if (!id || !supabase || !userId || loading) return

    const syncOnce = async () => {
      if (syncBusyRef.current || document.visibilityState === 'hidden') return
      if (remoteConflictRef.current) return
      syncBusyRef.current = true
      try {
        const remoteUpdatedAt = await peekCommunityGuideUpdatedAt(supabase, id)
        if (!remoteUpdatedAt || remoteUpdatedAt === serverUpdatedAtRef.current) return

        const guide = await fetchCommunityGuideForAuthor(supabase, id, userId)
        if (!guide || guide.updated_at === serverUpdatedAtRef.current) return

        if (!dirtyRef.current) {
          const snap = formSnapshotRef.current
          if (editorDraftMatchesGuide(snap, guide)) {
            // updated_at moved without content changes (e.g. legacy heart trigger).
            serverUpdatedAtRef.current = guide.updated_at
            persistCache(false)
            return
          }
          applyServerGuide(guide, { keepChangelog: true })
          setSyncNotice('Synced latest edits from a collaborator.')
          window.setTimeout(() => setSyncNotice(null), 4000)
          return
        }

        if (editorDraftMatchesGuide(formSnapshotRef.current, guide)) {
          serverUpdatedAtRef.current = guide.updated_at
          dirtyRef.current = false
          persistCache(false)
          return
        }

        setRemoteConflict(guide)
      } catch {
        // Ignore transient sync errors; next tick retries.
      } finally {
        syncBusyRef.current = false
      }
    }

    const interval = window.setInterval(() => {
      void syncOnce()
    }, COMMUNITY_GUIDE_COLLAB_SYNC_MS)

    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncOnce()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [id, supabase, userId, loading, applyServerGuide, persistCache])

  const onApplyRemote = useCallback(() => {
    if (!remoteConflict) return
    applyServerGuide(remoteConflict, { keepChangelog: true })
    setSyncNotice('Loaded collaborator changes.')
    window.setTimeout(() => setSyncNotice(null), 4000)
  }, [remoteConflict, applyServerGuide])

  const onKeepLocal = useCallback(() => {
    if (!remoteConflict) return
    // Advance base so we don't keep re-prompting; user must save to overwrite remote.
    serverUpdatedAtRef.current = remoteConflict.updated_at
    dirtyRef.current = true
    setRemoteConflict(null)
    persistCache(true)
    setSyncNotice('Keeping your local edits. Save to overwrite the remote guide.')
    window.setTimeout(() => setSyncNotice(null), 5000)
  }, [remoteConflict, persistCache])

  const insertEmbed = useCallback(
    (token: string) => {
      const el = textareaRef.current
      if (el) {
        setBody(insertAtCursor(el, token))
      } else {
        setBody((prev) => (prev ? `${prev} ${token}` : token))
      }
      markDirty()
      setActivePicker(null)
      setShowPreview(false)
    },
    [markDirty],
  )

  const insertBlockEmbed = useCallback(
    (token: string) => {
      const el = textareaRef.current
      if (el) {
        setBody(insertBlockAtCursor(el, token))
      } else {
        setBody((prev) => (prev ? `${prev}\n\n${token}\n\n` : token))
      }
      markDirty()
      setActivePicker(null)
      setShowPreview(false)
    },
    [markDirty],
  )

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

  const onDigimonSelect = useCallback(
    (digimon: WikiDigimonListItem) => {
      insertEmbed(
        communityGuideEmbedToken({ kind: 'digimon', id: digimon.id, label: digimon.name }),
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

  const saveGuide = useCallback(
    async (status: 'draft' | 'published') => {
      if (!supabase || !user || !userId) return
      setSaving(true)
      setSavingAction(status === 'published' ? 'publish' : 'draft')
      setError(null)
      try {
        const editorName = profileDisplayName?.trim() || 'Player'
        const isOwner = !id || !authorId || authorId === user.id
        const payload = {
          title,
          body,
          authorName: editorName,
          thumbnailUrl: thumbnailUrl || null,
          socialLinks: socialLinks.map(({ platform, url }) => ({ platform, url })),
          status,
        }
        if (id) {
          const updated = await updateCommunityGuide(supabase, id, user.id, payload, {
            updateAuthorName: isOwner,
          })
          setGuideStatus(updated.status)
          serverUpdatedAtRef.current = updated.updated_at
          dirtyRef.current = false
          setRemoteConflict(null)
          setRestoredFromCache(false)
          writeCommunityGuideEditorCache({
            guideKey: id,
            userId,
            title: updated.title,
            body: updated.body,
            thumbnailUrl: updated.thumbnail_url ?? '',
            socialLinks: updated.social_links.map(({ platform, url }) => ({ platform, url })),
            changelogNote: status === 'published' ? '' : changelogNote,
            baseUpdatedAt: updated.updated_at,
            dirty: false,
          })
          if (status === 'published') {
            const note =
              changelogNote.trim() ||
              (guideStatus === 'draft' ? 'Published guide' : 'Updated guide')
            await appendCommunityGuideChangelog(supabase, {
              guideId: updated.id,
              editorId: user.id,
              editorName,
              summary: note,
            })
            setChangelogNote('')
            clearCommunityGuideEditorCache(userId, id)
            navigate(`/guides/${updated.slug}`, { replace: true })
          }
        } else {
          const created = await createCommunityGuide(supabase, user.id, payload)
          setGuideStatus(created.status)
          setAuthorId(created.author_id)
          serverUpdatedAtRef.current = created.updated_at
          dirtyRef.current = false
          setRemoteConflict(null)
          migrateCommunityGuideEditorCache(userId, 'new', created.id)
          writeCommunityGuideEditorCache({
            guideKey: created.id,
            userId,
            title: created.title,
            body: created.body,
            thumbnailUrl: created.thumbnail_url ?? '',
            socialLinks: created.social_links.map(({ platform, url }) => ({ platform, url })),
            changelogNote: status === 'published' ? '' : changelogNote,
            baseUpdatedAt: created.updated_at,
            dirty: false,
          })
          loadedKeyRef.current = `${userId}:${created.id}`
          if (status === 'published') {
            await appendCommunityGuideChangelog(supabase, {
              guideId: created.id,
              editorId: user.id,
              editorName,
              summary: changelogNote.trim() || 'Published guide',
            })
            setChangelogNote('')
            clearCommunityGuideEditorCache(userId, created.id)
            navigate(`/guides/${created.slug}`, { replace: true })
          } else {
            navigate(`/guides/edit/${created.id}`, { replace: true })
          }
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not save guide.')
      } finally {
        setSaving(false)
        setSavingAction(null)
      }
    },
    [
      supabase,
      user,
      userId,
      id,
      authorId,
      title,
      body,
      thumbnailUrl,
      socialLinks,
      profileDisplayName,
      changelogNote,
      guideStatus,
      navigate,
    ],
  )

  const onSaveDraft = useCallback(() => void saveGuide('draft'), [saveGuide])
  const onPublish = useCallback(() => void saveGuide('published'), [saveGuide])

  const onDelete = useCallback(async () => {
    if (!supabase || !user || !userId || !id || deleting) return
    if (authorId && authorId !== user.id) {
      setError('Only the guide owner can delete this guide.')
      return
    }
    const confirmed = window.confirm(
      `Delete "${title.trim() || 'this guide'}"? This cannot be undone.`,
    )
    if (!confirmed) return

    setDeleting(true)
    setError(null)
    try {
      await deleteCommunityGuide(supabase, id, user.id)
      clearCommunityGuideEditorCache(userId, id)
      clearCommunityGuideEditorCache(userId, 'new')
      navigate('/guides', { replace: true })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not delete guide.')
      setDeleting(false)
    }
  }, [supabase, user, userId, id, authorId, title, deleting, navigate])

  if (!authReady || loading) {
    return <p className="community-guides-status">Loading editor…</p>
  }

  const thumbnailPreviewValid =
    thumbnailUrl.trim().length > 0 && isAllowedCommunityGuideImageUrl(thumbnailUrl)
  const isOwner = !authorId || authorId === user?.id

  return (
    <GuidebookWikiOverlayProvider>
      <div className="community-guides-page community-guides-editor">
        <Link to="/guides" className="community-guides-back">
          ← All guides
        </Link>

        <header className="community-guides-editor__head">
          <h1 className="community-guides-hero__title">{id ? 'Edit guide' : 'Write a guide'}</h1>
          {id && guideStatus === 'draft' ? (
            <span className="community-guides-editor__status-badge">Draft</span>
          ) : null}
          {id && !isOwner ? (
            <span className="community-guides-editor__status-badge community-guides-editor__status-badge--collab">
              Collaborator
            </span>
          ) : null}
        </header>

        {restoredFromCache ? (
          <p className="community-guides-editor__cache-note">
            Restored unsaved edits from this browser.
          </p>
        ) : null}

        {syncNotice ? <p className="community-guides-editor__sync-note">{syncNotice}</p> : null}

        {remoteConflict ? (
          <div className="community-guides-editor__conflict" role="status">
            <p className="community-guides-editor__conflict-text">
              A collaborator saved newer changes
              {remoteConflict.updated_at
                ? ` (${new Date(remoteConflict.updated_at).toLocaleString()})`
                : ''}
              . You also have local edits.
            </p>
            <div className="community-guides-editor__conflict-actions">
              <button
                type="button"
                className="community-guides-btn community-guides-btn--ghost"
                onClick={onKeepLocal}
              >
                Keep my edits
              </button>
              <button
                type="button"
                className="community-guides-btn community-guides-btn--primary"
                onClick={onApplyRemote}
              >
                Load theirs
              </button>
            </div>
          </div>
        ) : null}

        <div className="community-guides-editor__layout">
          <div className="community-guides-editor__main">
            <label className="community-guides-field">
              <span className="community-guides-field__label">Title</span>
              <input
                type="text"
                className="community-guides-field__input"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  markDirty()
                }}
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
                onChange={(e) => {
                  setThumbnailUrl(e.target.value)
                  markDirty()
                }}
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

            <CommunityGuideSocialLinksEditor
              links={socialLinks}
              onChange={(next) => {
                setSocialLinks(next)
                markDirty()
              }}
            />

            {id && supabase && user ? (
              <CommunityGuideCollaboratorsEditor
                supabase={supabase}
                guideId={id}
                isOwner={isOwner}
                currentUserId={user.id}
              />
            ) : null}

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
                className={`community-guides-btn community-guides-btn--ghost${activePicker === 'digimon' ? ' is-active' : ''}`}
                onClick={() => setActivePicker((p) => (p === 'digimon' ? null : 'digimon'))}
              >
                + Digimon
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
            {activePicker === 'digimon' ? (
              <WikiDigimonSearchPicker onSelect={onDigimonSelect} />
            ) : null}
            {activePicker === 'dungeon' ? (
              <WikiDungeonSearchPicker onSelect={onDungeonSelect} />
            ) : null}

            {!showPreview ? (
              <>
                <CommunityGuideMarkdownToolbar
                  textareaRef={textareaRef}
                  onChange={(next) => {
                    setBody(next)
                    markDirty()
                  }}
                />
                <label className="community-guides-field">
                  <span className="community-guides-field__label">Body</span>
                  <textarea
                    ref={textareaRef}
                    className="community-guides-field__textarea"
                    value={body}
                    onChange={(e) => {
                      setBody(e.target.value)
                      markDirty()
                    }}
                    rows={16}
                    placeholder="Write your guide… Use the toolbar for formatting, or **bold**, *italic*, lists, and wiki links."
                  />
                </label>
              </>
            ) : null}

            {showPreview ? (
              <section className="community-guides-editor__preview" aria-label="Preview">
                <h2 className="community-guides-editor__preview-title">Preview</h2>
                <CommunityGuideSocialLinks
                  links={socialLinks
                    .filter((link) => link.url.trim())
                    .map(({ platform, url }) => ({ platform, url: url.trim() }))}
                />
                <CommunityGuideBody body={body} />
              </section>
            ) : null}

            <label className="community-guides-field">
              <span className="community-guides-field__label">Changelog note (on publish)</span>
              <input
                type="text"
                className="community-guides-field__input"
                value={changelogNote}
                onChange={(e) => {
                  setChangelogNote(e.target.value)
                  markDirty()
                }}
                maxLength={280}
                placeholder="What changed? e.g. Added early-game farming route"
              />
              <span className="community-guides-field__hint">
                Shown on the guide page when you publish or update a published guide.
              </span>
            </label>

            {error ? <p className="community-guides-error">{error}</p> : null}

            <div className="community-guides-editor__actions">
              <button
                type="button"
                className="community-guides-btn community-guides-btn--ghost"
                disabled={saving || deleting}
                onClick={onSaveDraft}
              >
                {savingAction === 'draft' ? 'Saving…' : 'Save draft'}
              </button>
              <button
                type="button"
                className="community-guides-btn community-guides-btn--primary"
                disabled={saving || deleting}
                onClick={onPublish}
              >
                {savingAction === 'publish'
                  ? 'Saving…'
                  : guideStatus === 'published'
                    ? 'Save & view'
                    : 'Publish guide'}
              </button>
              {id && isOwner ? (
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
