import { GUIDEBOOK_NAV, guidebookLinkableSectionIds, guidebookScrollIds } from './guidebookContent'

const VALID_SECTION_IDS = new Set(guidebookLinkableSectionIds())

/** Fallback sticky header offset for scroll-spy. */
export const GUIDEBOOK_SCROLL_SPY_OFFSET = 88

/** Reading anchor at page top: fraction of viewport below the header (≈ upper-middle). */
const GUIDEBOOK_SPY_ANCHOR_START_RATIO = 0.44

/** Reading anchor at page bottom: fraction of viewport below the header (≈ lower-middle / end). */
const GUIDEBOOK_SPY_ANCHOR_END_RATIO = 0.86

export function getGuidebookScrollSpyOffset(): number {
  if (typeof document === 'undefined') return GUIDEBOOK_SCROLL_SPY_OFFSET
  const header = document.querySelector('.header')
  if (!header) return GUIDEBOOK_SCROLL_SPY_OFFSET
  return Math.round(header.getBoundingClientRect().height + 12)
}

export const GUIDEBOOK_BOOKMARK_KEY = 'odysseyCalc.guidebook.bookmark.v1'

export function guidebookSectionTitle(sectionId: string): string | null {
  for (const ch of GUIDEBOOK_NAV) {
    if (ch.id === sectionId) return ch.title
    const sub = ch.children?.find((c) => c.id === sectionId)
    if (sub) return sub.title
  }
  return null
}

export function guidebookSectionPath(sectionId: string): string {
  return `/guidebook?section=${encodeURIComponent(sectionId)}`
}

export function guidebookSectionUrl(sectionId: string): string {
  const path = guidebookSectionPath(sectionId)
  if (typeof window === 'undefined') return path
  const base = window.location.href.split('#')[0]
  return `${base}#${path}`
}

export function readGuidebookBookmark(): string | null {
  try {
    const raw = localStorage.getItem(GUIDEBOOK_BOOKMARK_KEY)?.trim()
    if (!raw || !VALID_SECTION_IDS.has(raw)) return null
    return raw
  } catch {
    return null
  }
}

export function writeGuidebookBookmark(sectionId: string) {
  try {
    localStorage.setItem(GUIDEBOOK_BOOKMARK_KEY, sectionId)
  } catch {
    /* ignore quota */
  }
}

let scrollSpyLockedId: string | null = null
let scrollSpyLockedUntil = 0

/** Ignore scroll-spy while smooth-scrolling to a clicked TOC entry. */
export function lockGuidebookScrollSpy(sectionId: string, ms = 1000) {
  scrollSpyLockedId = sectionId
  scrollSpyLockedUntil = performance.now() + ms
}

export function getGuidebookScrollSpyLock(): string | null {
  if (performance.now() >= scrollSpyLockedUntil) {
    scrollSpyLockedId = null
    return null
  }
  return scrollSpyLockedId
}

export function scrollToGuidebookSection(sectionId: string, behavior: ScrollBehavior = 'smooth') {
  const el = document.getElementById(sectionId)
  if (!el) return
  const offset = getGuidebookScrollSpyOffset()
  const top = Math.max(0, el.getBoundingClientRect().top + window.scrollY - offset)
  window.scrollTo({ top, behavior })
}

function guidebookScrollProgress(): number {
  if (typeof window === 'undefined') return 0
  const viewportHeight = window.innerHeight
  const scrollY = window.scrollY || document.documentElement.scrollTop
  const docHeight = document.documentElement.scrollHeight
  const maxScroll = Math.max(0, docHeight - viewportHeight)
  if (maxScroll <= 0) return 0
  return Math.min(1, Math.max(0, scrollY / maxScroll))
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

/**
 * Y coordinate (viewport px) of the “reading line” used for TOC highlighting.
 * Starts around upper-middle, eases toward lower-middle, then the bottom as you scroll.
 */
export function getGuidebookScrollAnchorY(
  offset = getGuidebookScrollSpyOffset(),
  viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800,
): number {
  const progress = smoothstep(guidebookScrollProgress())
  const ratio =
    GUIDEBOOK_SPY_ANCHOR_START_RATIO +
    (GUIDEBOOK_SPY_ANCHOR_END_RATIO - GUIDEBOOK_SPY_ANCHOR_START_RATIO) * progress
  const readableHeight = Math.max(160, viewportHeight - offset)
  return offset + readableHeight * ratio
}

/**
 * Which section is active for the TOC highlight.
 * Uses a scroll-progressive reading line (not the top edge of the viewport).
 */
export function resolveGuidebookActiveSection(
  sectionIds: string[] = guidebookScrollIds(),
  offset = getGuidebookScrollSpyOffset(),
): string {
  const fallback = sectionIds[0] ?? ''
  if (!sectionIds.length) return fallback

  const locked = getGuidebookScrollSpyLock()
  if (locked && sectionIds.includes(locked)) return locked

  const anchor = getGuidebookScrollAnchorY(offset)

  // Section that contains the anchor (handles tall cards like Gear / By level).
  for (const id of sectionIds) {
    const el = document.getElementById(id)
    if (!el) continue
    const { top, bottom } = el.getBoundingClientRect()
    if (top <= anchor && bottom > anchor) return id
  }

  // Last section whose top passed the anchor (page bottom, short tail sections).
  let lastPassed = fallback
  for (const id of sectionIds) {
    const el = document.getElementById(id)
    if (!el) continue
    if (el.getBoundingClientRect().top <= anchor) lastPassed = id
  }
  return lastPassed
}

export function scrollElementIntoContainer(
  container: HTMLElement,
  element: HTMLElement,
  padding = 24,
) {
  const containerRect = container.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  const relativeTop = elementRect.top - containerRect.top + container.scrollTop
  const relativeBottom = relativeTop + element.offsetHeight
  const viewTop = container.scrollTop
  const viewBottom = viewTop + container.clientHeight

  if (relativeTop < viewTop + padding) {
    container.scrollTop = Math.max(0, relativeTop - padding)
  } else if (relativeBottom > viewBottom - padding) {
    container.scrollTop = relativeBottom - container.clientHeight + padding
  }
}

function collectGuidebookSectionElements(sectionIds: string[]): HTMLElement[] {
  return sectionIds
    .map((id) => document.getElementById(id))
    .filter((el): el is HTMLElement => Boolean(el))
}

/** Keep TOC highlight in sync while the main page scrolls (capture + intersection). */
export function observeGuidebookScrollSpy(
  onSectionChange: (sectionId: string) => void,
  sectionIds: string[] = guidebookScrollIds(),
): () => void {
  let raf = 0
  let observer: IntersectionObserver | null = null
  let domObserver: MutationObserver | null = null

  const emit = () => {
    const locked = getGuidebookScrollSpyLock()
    if (locked) return
    const next = resolveGuidebookActiveSection(sectionIds)
    if (next) onSectionChange(next)
  }

  const schedule = () => {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(emit)
  }

  const bindIntersectionObserver = () => {
    const elements = collectGuidebookSectionElements(sectionIds)
    if (!elements.length) return false

    observer?.disconnect()
    const offset = getGuidebookScrollSpyOffset()
    const anchorY = getGuidebookScrollAnchorY(offset)
    const bottomMargin = Math.max(0, Math.round(window.innerHeight - anchorY))
    observer = new IntersectionObserver(schedule, {
      root: null,
      rootMargin: `-${offset}px 0px -${bottomMargin}px 0px`,
      threshold: [0, 0.05, 0.1, 0.25, 0.5, 0.75, 1],
    })
    for (const el of elements) observer.observe(el)
    return true
  }

  const ensureObserver = () => {
    if (bindIntersectionObserver()) {
      domObserver?.disconnect()
      domObserver = null
      schedule()
    }
  }

  if (!bindIntersectionObserver()) {
    const root = document.querySelector('.guidebook-main') ?? document.body
    domObserver = new MutationObserver(ensureObserver)
    domObserver.observe(root, { childList: true, subtree: true })
    requestAnimationFrame(ensureObserver)
  } else {
    schedule()
  }

  // Window + document: external browsers often only fire scroll on one of them.
  const scrollOpts = { passive: true, capture: true } as const
  window.addEventListener('scroll', schedule, scrollOpts)
  document.addEventListener('scroll', schedule, scrollOpts)
  document.documentElement.addEventListener('scroll', schedule, scrollOpts)
  window.visualViewport?.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', schedule)
  window.addEventListener('wheel', schedule, { passive: true })
  window.addEventListener('touchmove', schedule, { passive: true })

  // Fallback when scroll events never reach window/document (some browser/embed setups).
  let pollRaf = 0
  let lastScrollY = -1
  const pollScroll = () => {
    const y = window.scrollY || document.documentElement.scrollTop
    if (y !== lastScrollY) {
      lastScrollY = y
      schedule()
    }
    pollRaf = requestAnimationFrame(pollScroll)
  }
  pollRaf = requestAnimationFrame(pollScroll)

  return () => {
    cancelAnimationFrame(raf)
    cancelAnimationFrame(pollRaf)
    observer?.disconnect()
    domObserver?.disconnect()
    window.removeEventListener('scroll', schedule, scrollOpts)
    document.removeEventListener('scroll', schedule, scrollOpts)
    document.documentElement.removeEventListener('scroll', schedule, scrollOpts)
    window.visualViewport?.removeEventListener('scroll', schedule)
    window.removeEventListener('resize', schedule)
    window.removeEventListener('wheel', schedule)
    window.removeEventListener('touchmove', schedule)
  }
}

export async function copyGuidebookSectionLink(sectionId: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(guidebookSectionUrl(sectionId))
    return true
  } catch {
    return false
  }
}
