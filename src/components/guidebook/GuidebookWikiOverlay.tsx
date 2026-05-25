import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import {
  getGuidebookItemDetailCached,
  getGuidebookMonsterDetailCached,
  loadGuidebookItemDetail,
  loadGuidebookMonsterDetail,
} from '../../lib/guidebookWikiCache'
import type { WikiItemDetail, WikiMonsterDetail } from '../../types/wikiApi'
import {
  GuidebookItemProfilePanel,
  GuidebookMonsterProfilePanel,
} from './GuidebookWikiOverlayPanels'

export type GuidebookWikiOverlayFrame =
  | { type: 'item'; id: string }
  | { type: 'monster'; id: string }

type GuidebookWikiOverlayContextValue = {
  stackDepth: number
  openItemRoot: (id: string) => void
  openMonsterRoot: (id: string) => void
  pushItem: (id: string) => void
  pushMonster: (id: string) => void
  pop: () => void
  close: () => void
}

const GuidebookWikiOverlayContext = createContext<GuidebookWikiOverlayContextValue | null>(null)

export function useGuidebookWikiOverlay() {
  const ctx = useContext(GuidebookWikiOverlayContext)
  if (!ctx) throw new Error('useGuidebookWikiOverlay must be used within GuidebookWikiOverlayProvider')
  return ctx
}

export function useGuidebookWikiOverlayOptional() {
  return useContext(GuidebookWikiOverlayContext)
}

function GuidebookWikiStackOverlay({
  stack,
  pop,
  close,
}: {
  stack: GuidebookWikiOverlayFrame[]
  pop: () => void
  close: () => void
}) {
  const frame = stack[stack.length - 1]
  const canGoBack = stack.length > 1
  const [item, setItem] = useState<WikiItemDetail | null>(null)
  const [monster, setMonster] = useState<WikiMonsterDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    if (!frame) return
    setLoadError(false)

    if (frame.type === 'item') {
      const cached = getGuidebookItemDetailCached(frame.id)
      if (cached) {
        setItem(cached)
        setMonster(null)
        setLoading(false)
      } else {
        setItem(null)
        setMonster(null)
        setLoading(true)
      }
      void loadGuidebookItemDetail(frame.id)
        .then((detail) => {
          setItem(detail)
          setMonster(null)
        })
        .catch(() => {
          if (!getGuidebookItemDetailCached(frame.id)) setLoadError(true)
        })
        .finally(() => setLoading(false))
      return
    }

    const cached = getGuidebookMonsterDetailCached(frame.id)
    if (cached) {
      setMonster(cached)
      setItem(null)
      setLoading(false)
    } else {
      setItem(null)
      setMonster(null)
      setLoading(true)
    }
    void loadGuidebookMonsterDetail(frame.id)
      .then((detail) => {
        setMonster(detail)
        setItem(null)
      })
      .catch(() => {
        if (!getGuidebookMonsterDetailCached(frame.id)) setLoadError(true)
      })
      .finally(() => setLoading(false))
  }, [frame])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (canGoBack) pop()
      else close()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [canGoBack, pop, close])

  const dismissBackdrop = () => {
    if (canGoBack) pop()
    else close()
  }

  const label =
    frame.type === 'item'
      ? item?.name ?? 'Item details'
      : monster?.name ?? 'Monster details'

  return createPortal(
    <div
      className="guidebook-wiki-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) dismissBackdrop()
      }}
    >
      <div
        className="guidebook-wiki-overlay__dialog guidebook-scroll--themed"
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {loading ? (
          <p className="guidebook-wiki-overlay__loading" role="status">
            Loading…
          </p>
        ) : null}
        {loadError ? (
          <p className="guidebook-error guidebook-wiki-overlay__error">Could not load wiki details.</p>
        ) : null}
        {!loading && !loadError && frame.type === 'item' && item ? (
          <GuidebookItemProfilePanel
            item={item}
            canGoBack={canGoBack}
            onBack={pop}
            onClose={close}
          />
        ) : null}
        {!loading && !loadError && frame.type === 'monster' && monster ? (
          <GuidebookMonsterProfilePanel
            monster={monster}
            canGoBack={canGoBack}
            onBack={pop}
            onClose={close}
          />
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

export function GuidebookWikiOverlayProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<GuidebookWikiOverlayFrame[]>([])

  const openItemRoot = useCallback((id: string) => {
    setStack([{ type: 'item', id }])
  }, [])

  const openMonsterRoot = useCallback((id: string) => {
    setStack([{ type: 'monster', id }])
  }, [])

  const pushItem = useCallback((id: string) => {
    setStack((s) => [...s, { type: 'item', id }])
  }, [])

  const pushMonster = useCallback((id: string) => {
    setStack((s) => [...s, { type: 'monster', id }])
  }, [])

  const pop = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : []))
  }, [])

  const close = useCallback(() => {
    setStack([])
  }, [])

  const value = useMemo<GuidebookWikiOverlayContextValue>(
    () => ({
      stackDepth: stack.length,
      openItemRoot,
      openMonsterRoot,
      pushItem,
      pushMonster,
      pop,
      close,
    }),
    [stack.length, openItemRoot, openMonsterRoot, pushItem, pushMonster, pop, close],
  )

  return (
    <GuidebookWikiOverlayContext.Provider value={value}>
      {children}
      {stack.length > 0 ? <GuidebookWikiStackOverlay stack={stack} pop={pop} close={close} /> : null}
    </GuidebookWikiOverlayContext.Provider>
  )
}
