import { useEffect, useState } from 'react'
import {
  resolveCachedCommunityGuideImageSrc,
  revokeCachedCommunityGuideObjectUrl,
} from '../../lib/communityGuideImageCache'
import { isDurableCommunityGuideImageUrl } from '../../lib/communityGuideImageStorage'
import { isAllowedCommunityGuideImageUrl } from '../../lib/communityGuideImageUrl'

export function CommunityGuideImage({
  src,
  alt,
  inline = false,
}: {
  src: string
  alt: string
  inline?: boolean
}) {
  const [failed, setFailed] = useState(false)
  const [displaySrc, setDisplaySrc] = useState(src.trim())

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    const trimmed = src.trim()
    setFailed(false)
    setDisplaySrc(trimmed)

    if (!isAllowedCommunityGuideImageUrl(trimmed) || !isDurableCommunityGuideImageUrl(trimmed)) {
      return () => {
        cancelled = true
      }
    }

    void resolveCachedCommunityGuideImageSrc(trimmed).then((resolved) => {
      if (cancelled) {
        revokeCachedCommunityGuideObjectUrl(resolved)
        return
      }
      objectUrl = resolved.startsWith('blob:') ? resolved : null
      setDisplaySrc(resolved)
    })

    return () => {
      cancelled = true
      revokeCachedCommunityGuideObjectUrl(objectUrl)
    }
  }, [src])

  if (!isAllowedCommunityGuideImageUrl(src)) {
    return (
      <span className="community-guide-md__img-invalid" role="status">
        Invalid image URL
      </span>
    )
  }

  if (failed) {
    return (
      <span className="community-guide-md__img-invalid" role="status">
        Could not load image
      </span>
    )
  }

  const img = (
    <img
      className={`community-guide-md__img${inline ? ' community-guide-md__img--inline' : ''}`}
      src={displaySrc}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  )

  if (inline) return img

  return (
    <figure className="community-guide-md__figure">
      {img}
      {alt.trim() ? <figcaption className="community-guide-md__figcaption">{alt}</figcaption> : null}
    </figure>
  )
}
