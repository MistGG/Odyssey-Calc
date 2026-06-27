import { useState } from 'react'
import { isAllowedCommunityGuideImageUrl } from '../../lib/communityGuideImageUrl'

const SITE_LOGO_URL = `${import.meta.env.BASE_URL}logo.png`

type CommunityGuideThumbnailProps = {
  url: string | null | undefined
  className?: string
}

export function CommunityGuideThumbnail({ url, className }: CommunityGuideThumbnailProps) {
  const [failed, setFailed] = useState(false)
  const safeUrl = url?.trim() ?? ''
  const showCustom =
    Boolean(safeUrl) && isAllowedCommunityGuideImageUrl(safeUrl) && !failed
  const classes = ['community-guides-thumbnail', className].filter(Boolean).join(' ')

  if (showCustom) {
    return (
      <img
        className={classes}
        src={safeUrl}
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
