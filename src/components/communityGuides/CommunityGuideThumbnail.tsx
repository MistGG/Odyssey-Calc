import { useEffect, useState } from 'react'
import {
  resolveCachedCommunityGuideImageSrc,
  revokeCachedCommunityGuideObjectUrl,
} from '../../lib/communityGuideImageCache'
import { isDurableCommunityGuideImageUrl } from '../../lib/communityGuideImageStorage'
import { isAllowedCommunityGuideImageUrl } from '../../lib/communityGuideImageUrl'

const SITE_LOGO_URL = `${import.meta.env.BASE_URL}logo.png`

type CommunityGuideThumbnailProps = {
  url: string | null | undefined
  className?: string
}

export function CommunityGuideThumbnail({ url, className }: CommunityGuideThumbnailProps) {
  const [failed, setFailed] = useState(false)
  const safeUrl = url?.trim() ?? ''
  const [displaySrc, setDisplaySrc] = useState(safeUrl)
  const showCustom =
    Boolean(safeUrl) && isAllowedCommunityGuideImageUrl(safeUrl) && !failed
  const classes = ['community-guides-thumbnail', className].filter(Boolean).join(' ')

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    setFailed(false)
    setDisplaySrc(safeUrl)

    if (!safeUrl || !isAllowedCommunityGuideImageUrl(safeUrl) || !isDurableCommunityGuideImageUrl(safeUrl)) {
      return () => {
        cancelled = true
      }
    }

    void resolveCachedCommunityGuideImageSrc(safeUrl).then((resolved) => {
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
  }, [safeUrl])

  if (showCustom) {
    return (
      <img
        className={classes}
        src={displaySrc || safeUrl}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <div className={`${classes} community-guides-thumbnail--placeholder`} aria-hidden>
      <img
        className="community-guides-thumbnail__logo"
        src={SITE_LOGO_URL}
        alt=""
        loading="lazy"
        decoding="async"
      />
    </div>
  )
}
