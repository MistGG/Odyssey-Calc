import { useCallback, useLayoutEffect, useRef } from 'react'
import { GUIDEBOOK_NAV, guidebookChapterForSection, guidebookScrollIds } from '../../lib/guidebookContent'
import {
  GUIDEBOOK_TOC_PIN_TOP_PROGRESS,
  guidebookScrollProgress,
  observeGuidebookScrollSpy,
  scrollElementIntoContainer,
} from '../../lib/guidebookNav'
import { useGuidebook } from './GuidebookContext'

function LinkIcon() {
  return (
    <svg
      className="guidebook-toc__link-icon"
      viewBox="0 0 24 24"
      aria-hidden
      width={15}
      height={15}
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

function TocSectionRow({
  sectionId,
  label,
  depth,
  isActive = false,
  isParentActive = false,
  rowRef,
}: {
  sectionId: string
  label: string
  depth: 'chapter' | 'sub'
  /** Exact section in view — shows link icon. */
  isActive?: boolean
  /** Chapter heading while a child section is active — highlight only, no link icon. */
  isParentActive?: boolean
  rowRef: (el: HTMLDivElement | null) => void
}) {
  const { scrollToSection, copySectionLink, linkCopiedId } = useGuidebook()
  const copied = linkCopiedId === sectionId

  return (
    <div
      ref={rowRef}
      className={`guidebook-toc__row guidebook-toc__row--${depth}${isActive ? ' is-active' : ''}${isParentActive ? ' is-parent' : ''}`}
    >
      <button
        type="button"
        className="guidebook-toc__jump"
        onClick={() => scrollToSection(sectionId)}
        aria-current={isActive ? 'true' : undefined}
      >
        {label}
      </button>
      <button
        type="button"
        className={`guidebook-toc__link${copied ? ' is-copied' : ''}`}
        aria-label={copied ? 'Link copied' : `Copy link to ${label}`}
        title={copied ? 'Copied' : 'Copy link to section'}
        onClick={(e) => {
          e.stopPropagation()
          void copySectionLink(sectionId)
        }}
      >
        {copied ? (
          <span className="guidebook-toc__link-mark" aria-hidden>
            ✓
          </span>
        ) : (
          <LinkIcon />
        )}
      </button>
    </div>
  )
}

export function GuidebookToc() {
  const { activeSectionId, setActiveSectionId } = useGuidebook()
  const activeChapter = guidebookChapterForSection(activeSectionId)
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeSectionRef = useRef(activeSectionId)
  activeSectionRef.current = activeSectionId

  const scrollActiveRowIntoToc = useCallback((sectionId: string) => {
    const scroller = scrollRef.current
    if (!scroller) return

    const sectionIndex = guidebookScrollIds().indexOf(sectionId)
    if (sectionIndex >= 0 && sectionIndex <= 2 && guidebookScrollProgress() < GUIDEBOOK_TOC_PIN_TOP_PROGRESS) {
      scroller.scrollTop = 0
      return
    }

    const chapterId = guidebookChapterForSection(sectionId)
    const el =
      rowRefs.current.get(sectionId) ??
      (chapterId ? rowRefs.current.get(`heading-${chapterId}`) : null)
    if (!el) return
    scrollElementIntoContainer(scroller, el)
  }, [])

  useLayoutEffect(() => {
    return observeGuidebookScrollSpy((sectionId) => {
      if (sectionId === activeSectionRef.current) return
      setActiveSectionId(sectionId)
      scrollActiveRowIntoToc(sectionId)
    })
  }, [scrollActiveRowIntoToc, setActiveSectionId])

  useLayoutEffect(() => {
    scrollActiveRowIntoToc(activeSectionId)
  }, [activeSectionId, scrollActiveRowIntoToc])

  const setRowRef = (id: string) => (el: HTMLDivElement | null) => {
    if (el) rowRefs.current.set(id, el)
    else rowRefs.current.delete(id)
  }

  return (
    <aside className="guidebook-aside">
      <p className="guidebook-aside__label">Chapters</p>
      <nav className="guidebook-toc" aria-label="Guide sections">
        <div ref={scrollRef} className="guidebook-toc__scroll guidebook-scroll--themed">
          {GUIDEBOOK_NAV.map((ch) => (
            <div key={ch.id} className="guidebook-toc__group">
              {ch.children?.length ? (
                <>
                  <TocSectionRow
                    sectionId={ch.id}
                    label={ch.title}
                    depth="chapter"
                    isParentActive={activeChapter === ch.id}
                    rowRef={setRowRef(`heading-${ch.id}`)}
                  />
                  {ch.children.map((sub) => (
                    <TocSectionRow
                      key={sub.id}
                      sectionId={sub.id}
                      label={sub.title}
                      depth="sub"
                      isActive={activeSectionId === sub.id}
                      rowRef={setRowRef(sub.id)}
                    />
                  ))}
                </>
              ) : (
                <TocSectionRow
                  sectionId={ch.id}
                  label={ch.title}
                  depth="chapter"
                  isActive={activeSectionId === ch.id}
                  rowRef={setRowRef(ch.id)}
                />
              )}
            </div>
          ))}
        </div>
      </nav>
    </aside>
  )
}
