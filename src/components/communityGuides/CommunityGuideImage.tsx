import { useState } from 'react'
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
      src={src.trim()}
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
