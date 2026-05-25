import { useEffect } from 'react'
import { getGuidebookShareMeta } from '../lib/guidebookShare'

/** Update tab title / description when viewing a section with share metadata. */
export function useGuidebookShareMeta(activeSectionId: string) {
  useEffect(() => {
    const meta = getGuidebookShareMeta(activeSectionId)
    if (!meta) return

    const prevTitle = document.title
    document.title = `${meta.title} — Odyssey Calc`

    let descTag = document.querySelector('meta[name="description"]')
    const prevDesc = descTag?.getAttribute('content') ?? null
    if (!descTag) {
      descTag = document.createElement('meta')
      descTag.setAttribute('name', 'description')
      document.head.appendChild(descTag)
    }
    descTag.setAttribute('content', meta.description)

    return () => {
      document.title = prevTitle
      if (prevDesc != null) descTag?.setAttribute('content', prevDesc)
    }
  }, [activeSectionId])
}
