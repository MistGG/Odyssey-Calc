import { FORUM_TEASER_IMAGE_URL } from '../lib/forumTeaserImage'
import { isBundledTeaserImageUrl } from '../lib/teaserImageStorage'

/**
 * Imgur id for the **saved** live effect stack (GrayFog, red eye, mechano approach).
 * When {@link FORUM_TEASER_IMAGE_URL} changes to a new image, clear to `''` so the live
 * embed is a **plain image** until the new art is tuned. See `teaserEffectsPolicy.ts`.
 */
export const GRAY_FOG_TEASER_IMGUR_ID = ''

/** True when this Imgur id has the saved GrayFog stack (live or archive). */
export function supportsGrayFogForImgurId(imgurId: string): boolean {
  const id = GRAY_FOG_TEASER_IMGUR_ID.trim()
  return Boolean(id) && imgurId.trim() === id
}

/** True only while the configured teaser URL still matches {@link GRAY_FOG_TEASER_IMGUR_ID}. */
export function supportsGrayFog(
  imgSrc: string,
  teaserImageUrl: string = FORUM_TEASER_IMAGE_URL,
): boolean {
  const id = GRAY_FOG_TEASER_IMGUR_ID.trim()
  if (!id || !teaserImageUrl.includes(id)) return false
  if (supportsGrayFogForImgurId(id) && imgSrc.includes(id)) return true
  if (isBundledTeaserImageUrl(imgSrc, id)) return true
  return imgSrc.startsWith('blob:') && teaserImageUrl.includes(id)
}
