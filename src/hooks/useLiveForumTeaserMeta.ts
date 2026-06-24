import { useEffect, useState } from 'react'
import { fetchLiveForumTeaserUrls } from '../lib/forumTeaserImage'
import { fetchTeaserManifest } from '../lib/teaserManifest'
import { imgurIdFromUrl } from '../lib/teaserImageStorage'

export type LiveForumTeaserMeta = {
  readMoreUrl: string
  imgurId: string | undefined
  updatedAt: string | null
}

export function useLiveForumTeaserMeta(): LiveForumTeaserMeta | null {
  const [meta, setMeta] = useState<LiveForumTeaserMeta | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [urls, { manifest }] = await Promise.all([
        fetchLiveForumTeaserUrls(),
        fetchTeaserManifest(),
      ])
      if (cancelled) return
      const imgurId =
        manifest?.teaser.imgurId.trim() || imgurIdFromUrl(urls.imageUrl) || undefined
      setMeta({
        readMoreUrl: urls.readMoreUrl,
        imgurId,
        updatedAt: manifest?.updated_at ?? null,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return meta
}
