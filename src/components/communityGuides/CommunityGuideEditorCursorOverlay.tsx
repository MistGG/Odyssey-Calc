import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { getTextareaCaretCoordinates } from '../../lib/textareaCaretPosition'
import type { CommunityGuideRemoteCursor } from '../../hooks/useCommunityGuideEditorCursors'

type PlacedCursor = {
  userId: string
  displayName: string
  color: string
  top: number
  left: number
  height: number
}

function placedEqual(a: PlacedCursor[], b: PlacedCursor[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const left = a[i]!
    const right = b[i]!
    if (
      left.userId !== right.userId ||
      left.displayName !== right.displayName ||
      left.color !== right.color ||
      left.top !== right.top ||
      left.left !== right.left ||
      left.height !== right.height
    ) {
      return false
    }
  }
  return true
}

function placeVisibleCursors(
  textarea: HTMLTextAreaElement,
  remoteCursors: CommunityGuideRemoteCursor[],
): PlacedCursor[] {
  const out: PlacedCursor[] = []
  for (const cursor of remoteCursors) {
    if (!cursor.focused) continue
    const pos = Math.max(0, Math.min(cursor.selectionStart, textarea.value.length))
    const coords = getTextareaCaretCoordinates(textarea, pos)
    const top = coords.top - textarea.scrollTop
    const left = coords.left - textarea.scrollLeft
    if (
      top < -coords.height ||
      top > textarea.clientHeight ||
      left < -4 ||
      left > textarea.clientWidth
    ) {
      continue
    }
    out.push({
      userId: cursor.userId,
      displayName: cursor.displayName,
      color: cursor.color,
      top,
      left,
      height: coords.height,
    })
  }
  return out
}

export function CommunityGuideEditorCursorOverlay({
  textareaRef,
  remoteCursors,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  remoteCursors: CommunityGuideRemoteCursor[]
}) {
  const [placed, setPlaced] = useState<PlacedCursor[]>([])
  const cursorsRef = useRef(remoteCursors)
  const rafRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    cursorsRef.current = remoteCursors
  }, [remoteCursors])

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) {
      setPlaced((prev) => (prev.length === 0 ? prev : []))
      return
    }

    const scheduleRelayout = () => {
      if (rafRef.current != null) return
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null
        const next = placeVisibleCursors(textarea, cursorsRef.current)
        setPlaced((prev) => (placedEqual(prev, next) ? prev : next))
      })
    }

    scheduleRelayout()
    textarea.addEventListener('scroll', scheduleRelayout, { passive: true })
    window.addEventListener('resize', scheduleRelayout)
    return () => {
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      textarea.removeEventListener('scroll', scheduleRelayout)
      window.removeEventListener('resize', scheduleRelayout)
    }
  }, [textareaRef, remoteCursors])

  if (placed.length === 0) return null

  return (
    <div className="community-guides-editor__cursor-layer" aria-hidden="true">
      {placed.map((cursor) => (
        <div
          key={cursor.userId}
          className="community-guides-editor__remote-cursor"
          style={{
            top: cursor.top,
            left: cursor.left,
            height: cursor.height,
            color: cursor.color,
            ['--cursor-color' as string]: cursor.color,
          }}
        >
          <span className="community-guides-editor__remote-cursor-caret" />
          <span className="community-guides-editor__remote-cursor-label">
            {cursor.displayName}
          </span>
        </div>
      ))}
    </div>
  )
}
