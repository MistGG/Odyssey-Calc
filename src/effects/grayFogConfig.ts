import { FORUM_TEASER_IMAGE_URL } from '../lib/forumTeaserImage'

/**
 * Imgur id that enables {@link GrayFog} on the event teaser embed.
 * When {@link FORUM_TEASER_IMAGE_URL} changes to a new image, clear this id so only
 * CRT + the 15s reveal loop run (no gray fog).
 */
export const GRAY_FOG_TEASER_IMGUR_ID = '6v7FJWV'

/** True only while the configured teaser URL still matches {@link GRAY_FOG_TEASER_IMGUR_ID}. */
export function supportsGrayFog(
  imgSrc: string,
  teaserImageUrl: string = FORUM_TEASER_IMAGE_URL,
): boolean {
  const id = GRAY_FOG_TEASER_IMGUR_ID.trim()
  if (!id || !teaserImageUrl.includes(id)) return false
  if (imgSrc.includes(id)) return true
  return imgSrc.startsWith('blob:')
}
