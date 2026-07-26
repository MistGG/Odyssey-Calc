import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { copyCommunityGuideSectionShareLink } from '../../lib/communityGuides'
import {
  communityGuideHeadingDepth,
  extractCommunityGuideToc,
  type CommunityGuideTocEntry,
} from '../../lib/communityGuideToc'

const SCROLL_OFFSET = 96

function scrollToGuideHeading(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const top = Math.max(0, el.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET)
  window.scrollTo({ top, behavior: 'smooth' })
}

function LinkIcon() {
  return (
    <svg
      className="community-guide-toc__link-icon"
      viewBox="0 0 24 24"
      aria-hidden
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07l-1.42 1.42" />
      <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.42-1.42" />
    </svg>
  )
}

function resolveActiveHeadingId(entries: CommunityGuideTocEntry[]): string {
  if (!entries.length) return ''
  const anchor = SCROLL_OFFSET + 12
  let current = entries[0]!.id
  for (const entry of entries) {
    const el = document.getElementById(entry.id)
    if (!el) continue
    if (el.getBoundingClientRect().top <= anchor) current = entry.id
    else break
  }
  return current
}

function parentChapterId(entries: CommunityGuideTocEntry[], activeId: string): string | null {
  let chapter: string | null = null
  for (const entry of entries) {
    if (entry.level === 2) chapter = entry.id
    if (entry.id === activeId) {
      return entry.level === 2 ? entry.id : chapter
    }
  }
  return null
}

type CommunityGuideTocProps = {
  body: string
  /** Published guide slug — required for copyable section deep links. */
  slug?: string
}

export function CommunityGuideToc({ body, slug }: CommunityGuideTocProps) {
  const entries = useMemo(() => extractCommunityGuideToc(body), [body])
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeId, setActiveId] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  /** While set, scroll-spy must not steal highlight during smooth jump. */
  const spyLockRef = useRef<{ id: string; until: number } | null>(null)
  const unlockTimerRef = useRef<number | null>(null)
  const canCopySectionLinks = Boolean(slug?.trim())

  const lockScrollSpy = useCallback((id: string, ms = 1200) => {
    spyLockRef.current = { id, until: performance.now() + ms }
    if (unlockTimerRef.current != null) window.clearTimeout(unlockTimerRef.current)
    unlockTimerRef.current = window.setTimeout(() => {
      const lock = spyLockRef.current
      if (lock?.id === id) spyLockRef.current = null
      unlockTimerRef.current = null
    }, ms)
  }, [])

  useEffect(() => {
    if (!entries.length) {
      setActiveId('')
      return
    }
    const update = () => {
      const lock = spyLockRef.current
      if (lock && performance.now() < lock.until && entries.some((e) => e.id === lock.id)) {
        setActiveId((prev) => (prev === lock.id ? prev : lock.id))
        return
      }
      if (lock && performance.now() >= lock.until) spyLockRef.current = null
      const next = resolveActiveHeadingId(entries)
      setActiveId((prev) => (prev === next ? prev : next))
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [entries])

  const sectionFromUrl = searchParams.get('section')?.trim() || ''

  useEffect(() => {
    if (!sectionFromUrl || !entries.some((e) => e.id === sectionFromUrl)) return
    const t = window.setTimeout(() => {
      lockScrollSpy(sectionFromUrl)
      setActiveId(sectionFromUrl)
      scrollToGuideHeading(sectionFromUrl)
    }, 0)
    return () => window.clearTimeout(t)
  }, [entries, sectionFromUrl, lockScrollSpy])

  useEffect(() => {
    if (!activeId) return
    const scroller = scrollRef.current
    const row = rowRefs.current.get(activeId)
    if (!scroller || !row) return
    const rowTop = row.offsetTop
    const rowBottom = rowTop + row.offsetHeight
    const viewTop = scroller.scrollTop
    const viewBottom = viewTop + scroller.clientHeight
    if (rowTop < viewTop + 8) scroller.scrollTop = Math.max(0, rowTop - 8)
    else if (rowBottom > viewBottom - 8) scroller.scrollTop = rowBottom - scroller.clientHeight + 8
  }, [activeId])

  useEffect(
    () => () => {
      if (unlockTimerRef.current != null) window.clearTimeout(unlockTimerRef.current)
    },
    [],
  )

  const activeChapter = useMemo(
    () => (activeId ? parentChapterId(entries, activeId) : null),
    [entries, activeId],
  )

  const onJump = useCallback(
    (id: string) => {
      lockScrollSpy(id)
      setActiveId(id)
      const next = new URLSearchParams(searchParams)
      next.set('section', id)
      setSearchParams(next, { replace: true })
      scrollToGuideHeading(id)
    },
    [lockScrollSpy, searchParams, setSearchParams],
  )

  const onCopyLink = useCallback(
    async (id: string) => {
      if (!slug?.trim()) return
      const ok = await copyCommunityGuideSectionShareLink(slug, id)
      if (!ok) return
      setCopiedId(id)
      window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1600)
    },
    [slug],
  )

  if (entries.length < 2) return null

  return (
    <aside className="community-guide-toc" aria-label="Chapters">
      <p className="community-guide-toc__label">Chapters</p>
      <nav className="community-guide-toc__nav">
        <div ref={scrollRef} className="community-guide-toc__scroll">
          {entries.map((entry) => {
            const depth = communityGuideHeadingDepth(entry.level)
            const isActive = activeId === entry.id
            const isParent =
              !isActive && entry.level === 2 && activeChapter === entry.id && activeId !== entry.id
            return (
              <div
                key={entry.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(entry.id, el)
                  else rowRefs.current.delete(entry.id)
                }}
                className={`community-guide-toc__row community-guide-toc__row--${depth}${isActive ? ' is-active' : ''}${isParent ? ' is-parent' : ''}`}
              >
                <button
                  type="button"
                  className="community-guide-toc__jump"
                  onClick={() => onJump(entry.id)}
                  aria-current={isActive ? 'true' : undefined}
                >
                  {entry.title}
                </button>
                {canCopySectionLinks ? (
                  <button
                    type="button"
                    className={`community-guide-toc__link${copiedId === entry.id ? ' is-copied' : ''}`}
                    aria-label={copiedId === entry.id ? 'Link copied' : `Copy link to ${entry.title}`}
                    title={copiedId === entry.id ? 'Copied' : 'Copy section link'}
                    onClick={() => void onCopyLink(entry.id)}
                  >
                    {copiedId === entry.id ? (
                      <span className="community-guide-toc__link-mark" aria-hidden>
                        ✓
                      </span>
                    ) : (
                      <LinkIcon />
                    )}
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
      </nav>
    </aside>
  )
}
