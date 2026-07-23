import { useLayoutEffect, useState, type RefObject } from 'react'
import { getTextareaCaretCoordinates } from '../../lib/textareaCaretPosition'
import type { CommunityGuideRemoteCursor } from '../../hooks/useCommunityGuideEditorCursors'

type PlacedCursor = CommunityGuideRemoteCursor & {
  top: number
  left: number
  height: number
  visible: boolean
}

function placeCursor(
  textarea: HTMLTextAreaElement,
  cursor: CommunityGuideRemoteCursor,
): PlacedCursor {
  const pos = Math.max(
    0,
    Math.min(cursor.selectionStart, textarea.value.length),
  )
  const coords = getTextareaCaretCoordinates(textarea, pos)
  const top = coords.top - textarea.scrollTop
  const left = coords.left - textarea.scrollLeft
  const visible =
    cursor.focused &&
    top >= -coords.height &&
    top <= textarea.clientHeight &&
    left >= -4 &&
    left <= textarea.clientWidth

  return {
    ...cursor,
    top,
    left,
    height: coords.height,
    visible,
  }
}

export function CommunityGuideEditorCursorOverlay({
  textareaRef,
  body,
  remoteCursors,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  body: string
  remoteCursors: CommunityGuideRemoteCursor[]
}) {
  const [placed, setPlaced] = useState<PlacedCursor[]>([])

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea || remoteCursors.length === 0) {
      setPlaced([])
      return
    }

    const relayout = () => {
      setPlaced(remoteCursors.map((cursor) => placeCursor(textarea, cursor)))
    }

    relayout()
    textarea.addEventListener('scroll', relayout)
    window.addEventListener('resize', relayout)
    return () => {
      textarea.removeEventListener('scroll', relayout)
      window.removeEventListener('resize', relayout)
    }
  }, [textareaRef, body, remoteCursors])

  if (placed.length === 0) return null

  return (
    <div className="community-guides-editor__cursor-layer" aria-hidden="true">
      {placed.map((cursor) =>
        cursor.visible ? (
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
        ) : null,
      )}
    </div>
  )
}
