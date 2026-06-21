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
  guidebookNextStepId,
  guidebookProgressionStepIds,
  guidebookResolveStepId,
  guidebookStepIsInformative,
} from '../../lib/guidebookProgression'
import { readGuidebookProgressStep, writeGuidebookProgressStep } from '../../lib/guidebookProgress'
import { copyGuidebookStepLink } from '../../lib/guidebookNav'
import { GuidebookPopup } from './GuidebookPopup'
import { GuidebookWikiOverlayProvider } from './GuidebookWikiOverlay'

type GuidebookContextValue = {
  progressStepId: string
  viewStepId: string
  setProgressStep: (stepId: string) => void
  selectStep: (stepId: string) => void
  advanceProgress: (fromStepId: string) => void
  openDetail: (detail: GuidebookDetail) => void
  copyStepLink: (stepId: string) => Promise<boolean>
  linkCopiedId: string | null
}

const GuidebookContext = createContext<GuidebookContextValue | null>(null)

const VALID_STEP_IDS = new Set(guidebookProgressionStepIds())

function normalizeStepId(raw: string | null | undefined): string {
  const id = raw?.trim()
  if (id) return guidebookResolveStepId(id)
  return readGuidebookProgressStep()
}

export function useGuidebook() {
  const ctx = useContext(GuidebookContext)
  if (!ctx) throw new Error('useGuidebook must be used within GuidebookProvider')
  return ctx
}

export function GuidebookProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [progressStepId, setProgressStepIdState] = useState(() => readGuidebookProgressStep())
  const [viewStepId, setViewStepId] = useState(() =>
    normalizeStepId(searchParams.get('step') ?? searchParams.get('section')),
  )
  const [popup, setPopup] = useState<GuidebookDetail | null>(null)
  const [linkCopiedId, setLinkCopiedId] = useState<string | null>(null)

  useEffect(() => {
    const fromUrl = searchParams.get('step') ?? searchParams.get('section')
    if (fromUrl?.trim()) {
      const resolved = guidebookResolveStepId(fromUrl.trim())
      setViewStepId(resolved)
      if (resolved !== fromUrl.trim()) {
        setSearchParams({ step: resolved }, { replace: true })
      }
    }
  }, [searchParams, setSearchParams])

  const setProgressStep = useCallback((stepId: string) => {
    if (!VALID_STEP_IDS.has(stepId) || guidebookStepIsInformative(stepId)) return
    writeGuidebookProgressStep(stepId)
    setProgressStepIdState(stepId)
    setViewStepId(stepId)
    setSearchParams({ step: stepId }, { replace: true })
  }, [setSearchParams])

  const selectStep = useCallback(
    (stepId: string) => {
      if (!VALID_STEP_IDS.has(stepId)) return
      setViewStepId(stepId)
      setSearchParams({ step: stepId }, { replace: true })
    },
    [setSearchParams],
  )

  const advanceProgress = useCallback(
    (fromStepId: string) => {
      const next = guidebookNextStepId(fromStepId) ?? fromStepId
      setProgressStep(next)
    },
    [setProgressStep],
  )

  const copyStepLink = useCallback(async (stepId: string) => {
    const ok = await copyGuidebookStepLink(stepId)
    if (ok) {
      setLinkCopiedId(stepId)
      window.setTimeout(() => setLinkCopiedId(null), 1600)
    }
    return ok
  }, [])

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

  const value = useMemo<GuidebookContextValue>(
    () => ({
      progressStepId,
      viewStepId,
      setProgressStep,
      selectStep,
      advanceProgress,
      openDetail: (detail) => setPopup(detail),
      copyStepLink,
      linkCopiedId,
    }),
    [advanceProgress, copyStepLink, linkCopiedId, progressStepId, selectStep, setProgressStep, viewStepId],
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
