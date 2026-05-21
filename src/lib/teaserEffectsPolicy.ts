import { FORUM_TEASER_IMAGE_URL } from './forumTeaserImage'
import { imgurIdFromUrl } from './teaserImageStorage'
import {
  GRAY_FOG_TEASER_IMGUR_ID,
  supportsGrayFog,
  supportsGrayFogForImgurId,
} from '../effects/grayFogConfig'

/**
 * Teaser effect stacks
 * --------------------
 * **Live forum embed** (`FORUM_TEASER_IMAGE_URL`):
 * - Always: CRT static + 15s reveal loop.
 * - Only when the live Imgur id still matches {@link GRAY_FOG_TEASER_IMGUR_ID}:
 *   GrayFog, red eye, mechano approach.
 *
 * **When the forum hotlink changes to a new image:**
 * 1. Add the *previous* id to `TEASER_ARCHIVE_ENTRIES` with `fullEffects: true` if it had the saved stack.
 * 2. Update `FORUM_TEASER_IMAGE_URL` to the new image.
 * 3. Clear {@link GRAY_FOG_TEASER_IMGUR_ID} (`''`) so the live embed stays **CRT-only** until effects are re-tuned.
 * 4. Run `npm run sync:teasers` and commit `public/teasers/`.
 * 5. After tuning fog/eye/mechano for the new art, set `GRAY_FOG_TEASER_IMGUR_ID` to that id.
 *
 * **Teasers archive** uses `fullEffects` + `imgurId` per row (not the live URL).
 */

/** Id that enables the saved live stack (empty = live is CRT-only). */
export const SAVED_LIVE_FULL_EFFECTS_IMGUR_ID = GRAY_FOG_TEASER_IMGUR_ID

export function getLiveTeaserImgurId(): string | null {
  return imgurIdFromUrl(FORUM_TEASER_IMAGE_URL)
}

/** Live embed: GrayFog + red eye + mechano (gated from `supportsGrayFog`). */
export function liveTeaserHasFullEffectStack(imgSrc: string): boolean {
  return supportsGrayFog(imgSrc)
}

/** Archive / explicit id: full stack only for ids we saved. */
export function archiveTeaserHasFullEffectStack(
  imgurId: string,
  fullEffects: boolean,
): boolean {
  return fullEffects && supportsGrayFogForImgurId(imgurId)
}

export { supportsGrayFog, supportsGrayFogForImgurId, GRAY_FOG_TEASER_IMGUR_ID }
