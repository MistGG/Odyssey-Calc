import { useEffect, useState } from 'react'
import { getDigimonThumbUrl } from '../lib/digimonThumbCache'

/**
 * Renders a downscaled portrait so the browser does not retain full-res decoded bitmaps
 * for every tier-list cell. Remount with `key={src}` when the source changes.
 */
export function DigimonThumbImg({
  src,
  alt = '',
  className,
}: {
  src: string
  alt?: string
  className?: string
}) {
  const [thumb, setThumb] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getDigimonThumbUrl(src).then((url) => {
      if (cancelled) return
      if (url) setThumb(url)
      else setFailed(true)
    })
    return () => {
      cancelled = true
    }
  }, [src])

  if (failed) {
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        width={16}
        height={16}
        loading="lazy"
        decoding="async"
      />
    )
  }

  if (!thumb) {
    return <span className={className} aria-hidden="true" />
  }

  return (
    <img
      src={thumb}
      alt={alt}
      className={className}
      width={16}
      height={16}
      decoding="async"
      draggable={false}
    />
  )
}
