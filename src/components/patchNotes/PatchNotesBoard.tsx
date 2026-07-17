import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { LatestForumTeaserPanel } from '../LatestForumTeaserPanel'
import { PageHeader } from '../PageHeader'
import { OutlineMarkdown } from '../../lib/outlineMarkdown'
import {
  loadPatchNotesCatalog,
  patchNoteDateLabel,
  patchNoteDisplayTitle,
  patchNoteKind,
  type PatchNoteEntry,
  type PatchNotesCatalog,
} from '../../lib/patchNotesSource'

const KIND_LABEL: Record<ReturnType<typeof patchNoteKind>, string> = {
  hotfix: 'Hotfix',
  update: 'Update',
}

function formatSyncedAt(iso: string): string {
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

function formatEntryDate(label: string): string {
  if (!label) return 'Undated'
  const d = new Date(`${label}T12:00:00`)
  if (Number.isNaN(d.getTime())) return label
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function PatchNotesBoard() {
  const { slug } = useParams<{ slug?: string }>()
  const navigate = useNavigate()
  const [catalog, setCatalog] = useState<PatchNotesCatalog | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    void loadPatchNotesCatalog()
      .then((data) => {
        if (!cancelled) setCatalog(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Could not load patch notes.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const entries = catalog?.entries ?? []

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((entry) => {
      const hay = `${entry.title} ${entry.text} ${entry.slug}`.toLowerCase()
      return hay.includes(q)
    })
  }, [entries, query])

  const active =
    (slug ? entries.find((entry) => entry.slug === slug) : null) ?? filtered[0] ?? entries[0] ?? null

  useEffect(() => {
    if (!catalog || loading) return
    if (!slug && active) {
      navigate(`/patch-notes/${active.slug}`, { replace: true })
    }
  }, [active, catalog, loading, navigate, slug])

  useEffect(() => {
    if (!catalog || !slug) return
    if (!entries.some((entry) => entry.slug === slug) && active) {
      navigate(`/patch-notes/${active.slug}`, { replace: true })
    }
  }, [active, catalog, entries, navigate, slug])

  return (
    <div className="patch-notes-page patch-notes-scroll--themed">
      <PageHeader
        kicker="Digital World Transmission"
        title="Patch Notes"
        lead={
          catalog?.syncedAt ? `Synced ${formatSyncedAt(catalog.syncedAt)}` : undefined
        }
      />

      {loading ? (
        <p className="patch-notes-muted patch-notes-muted--center">Loading transmission log…</p>
      ) : loadError ? (
        <p className="patch-notes-error patch-notes-muted--center">{loadError}</p>
      ) : !entries.length ? (
        <p className="patch-notes-muted patch-notes-muted--center">No patch notes available.</p>
      ) : (
        <div className="patch-notes-layout">
          <aside className="patch-notes-aside" aria-label="Patch note archive">
            <label className="patch-notes-search">
              <span className="patch-notes-search__label">Search</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Dungeon, role, hotfix…"
                className="patch-notes-search__input"
              />
            </label>
            <ol className="patch-notes-archive">
              {filtered.map((entry) => (
                <PatchArchiveItem
                  key={entry.id}
                  entry={entry}
                  active={active?.id === entry.id}
                />
              ))}
            </ol>
            {!filtered.length ? (
              <p className="patch-notes-muted patch-notes-archive__empty">No matches for that search.</p>
            ) : null}
          </aside>

          <article className="patch-notes-main">
            {active ? (
              <PatchNoteDocument entry={active} />
            ) : (
              <p className="patch-notes-muted">Select a patch note from the archive.</p>
            )}
          </article>
        </div>
      )}

      <LatestForumTeaserPanel className="patch-notes-teaser patch-notes-teaser--below" />
    </div>
  )
}

function PatchArchiveItem({ entry, active }: { entry: PatchNoteEntry; active: boolean }) {
  const kind = patchNoteKind(entry)
  const dateLabel = patchNoteDateLabel(entry)

  return (
    <li>
      <Link
        to={`/patch-notes/${entry.slug}`}
        className={`patch-notes-archive__item${active ? ' patch-notes-archive__item--active' : ''}`}
        aria-current={active ? 'page' : undefined}
      >
        <span className="patch-notes-archive__top">
          <span className={`patch-notes-kind patch-notes-kind--${kind}`}>{KIND_LABEL[kind]}</span>
          <time className="patch-notes-archive__date" dateTime={dateLabel || undefined}>
            {formatEntryDate(dateLabel)}
          </time>
        </span>
        <span className="patch-notes-archive__title">{patchNoteDisplayTitle(entry)}</span>
      </Link>
    </li>
  )
}

function PatchNoteDocument({ entry }: { entry: PatchNoteEntry }) {
  const kind = patchNoteKind(entry)
  const dateLabel = patchNoteDateLabel(entry)

  return (
    <div className="patch-notes-doc meter-parses-meter-chrome">
      <div className="patch-notes-doc__glow" aria-hidden />
      <header className="patch-notes-doc__head">
        <div className="patch-notes-doc__badges">
          <span className={`patch-notes-kind patch-notes-kind--${kind}`}>{KIND_LABEL[kind]}</span>
          {dateLabel ? (
            <time className="patch-notes-doc__date" dateTime={dateLabel}>
              {formatEntryDate(dateLabel)}
            </time>
          ) : null}
        </div>
        <h2 className="patch-notes-doc__title">{patchNoteDisplayTitle(entry)}</h2>
        {entry.updatedAt ? (
          <p className="patch-notes-doc__updated">
            Last updated {formatSyncedAt(entry.updatedAt)}
          </p>
        ) : null}
      </header>
      <div className="patch-notes-doc__body">
        <OutlineMarkdown text={entry.text} />
      </div>
    </div>
  )
}
