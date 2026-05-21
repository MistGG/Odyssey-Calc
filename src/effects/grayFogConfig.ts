import { FORUM_TEASER_IMAGE_URL } from '../lib/forumTeaserImage'
import { isBundledTeaserImageUrl } from '../lib/teaserImageStorage'

/**
 * Imgur id that enables {@link GrayFog} on the event teaser embed.
 * When {@link FORUM_TEASER_IMAGE_URL} changes to a new image, clear this id so only
 * CRT + the 15s reveal loop run (no gray fog).
 */
export const GRAY_FOG_TEASER_IMGUR_ID = '6v7FJWV'

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
