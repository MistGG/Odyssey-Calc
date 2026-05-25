import { useEffect, useRef } from 'react'
import type { GuidebookDetail } from '../../lib/guidebookContent'

export function GuidebookPopup({
  detail,
  onClose,
}: {
  detail: GuidebookDetail
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  return (
    <div className="guidebook-popup-root" role="presentation">
      <button type="button" className="guidebook-popup-backdrop" aria-label="Close" onClick={onClose} />
      <div
        ref={panelRef}
        className="guidebook-popup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guidebook-popup-title"
        tabIndex={-1}
      >
        <header className="guidebook-popup__head">
          <h2 id="guidebook-popup-title" className="guidebook-popup__title">
            {detail.title}
          </h2>
          <button type="button" className="guidebook-popup__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <ul className="guidebook-popup__lines">
          {detail.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
