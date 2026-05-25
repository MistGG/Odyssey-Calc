import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useSearchParams } from 'react-router-dom'
import type { GuidebookDetail } from '../../lib/guidebookContent'
import {
  copyGuidebookSectionLink,
  lockGuidebookScrollSpy,
  scrollToGuidebookSection,
  writeGuidebookBookmark,
} from '../../lib/guidebookNav'
import { guidebookScrollIds } from '../../lib/guidebookContent'
import { GuidebookPopup } from './GuidebookPopup'
import { GuidebookWikiOverlayProvider } from './GuidebookWikiOverlay'

type GuidebookContextValue = {
  activeSectionId: string
  setActiveSectionId: (id: string) => void
  scrollToSection: (id: string) => void
  openDetail: (detail: GuidebookDetail) => void
  copySectionLink: (sectionId: string) => Promise<boolean>
  linkCopiedId: string | null
}

const GuidebookContext = createContext<GuidebookContextValue | null>(null)

export function useGuidebook() {
  const ctx = useContext(GuidebookContext)
  if (!ctx) throw new Error('useGuidebook must be used within GuidebookProvider')
  return ctx
}

export function GuidebookProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const defaultId = guidebookScrollIds()[0] ?? 'beginners-preface'
  const [activeSectionId, setActiveSectionId] = useState(() => {
    const fromUrl = searchParams.get('section')?.trim()
    if (fromUrl) return fromUrl
    return defaultId
  })
  const [popup, setPopup] = useState<GuidebookDetail | null>(null)
  const [linkCopiedId, setLinkCopiedId] = useState<string | null>(null)

  const scrollToSection = useCallback(
    (id: string) => {
      lockGuidebookScrollSpy(id, 1100)
      setActiveSectionId(id)
      setSearchParams({ section: id }, { replace: true })
      scrollToGuidebookSection(id)
    },
    [setSearchParams],
  )

  useEffect(() => {
    const fromUrl = searchParams.get('section')?.trim()
    if (fromUrl && document.getElementById(fromUrl)) {
      lockGuidebookScrollSpy(fromUrl, 500)
      setActiveSectionId(fromUrl)
      requestAnimationFrame(() => scrollToGuidebookSection(fromUrl, 'auto'))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    writeGuidebookBookmark(activeSectionId)
  }, [activeSectionId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchParams({ section: activeSectionId }, { replace: true })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [activeSectionId, setSearchParams])

  useEffect(() => {
    if (!popup) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPopup(null)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [popup])

  const copySectionLink = useCallback(async (sectionId: string) => {
    const ok = await copyGuidebookSectionLink(sectionId)
    if (ok) {
      setLinkCopiedId(sectionId)
      window.setTimeout(() => setLinkCopiedId(null), 1600)
    }
    return ok
  }, [])

  const value = useMemo<GuidebookContextValue>(
    () => ({
      activeSectionId,
      setActiveSectionId,
      scrollToSection,
      openDetail: (detail) => setPopup(detail),
      copySectionLink,
      linkCopiedId,
    }),
    [activeSectionId, copySectionLink, linkCopiedId, scrollToSection],
  )

  return (
    <GuidebookContext.Provider value={value}>
      <GuidebookWikiOverlayProvider>
        {children}
        {popup ? <GuidebookPopup detail={popup} onClose={() => setPopup(null)} /> : null}
      </GuidebookWikiOverlayProvider>
    </GuidebookContext.Provider>
  )
}
