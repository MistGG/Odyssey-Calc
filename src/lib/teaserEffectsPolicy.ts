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
 * - No match for {@link GRAY_FOG_TEASER_IMGUR_ID}: plain image (see `marsmonTeaserConfig` for 6JQlbLZ ambience).
 * - Match: full saved stack (CRT loop, GrayFog, red eye, mechano approach).
 *
 * **When the forum hotlink changes to a new image:**
 * 1. Add the *previous* id to `TEASER_ARCHIVE_ENTRIES` with `fullEffects: true` if it had the saved stack.
 * 2. Update `FORUM_TEASER_IMAGE_URL` to the new image.
 * 3. Leave {@link GRAY_FOG_TEASER_IMGUR_ID} as `''` until the new art is tuned (live stays plain).
 * 4. GHA `teaser-sync.yml` auto-syncs; or run `npm run sync:forum-teaser` locally.
 * 5. After tuning, set `GRAY_FOG_TEASER_IMGUR_ID` to that id to enable the full stack on live.
 *
 * **Teasers archive** uses `fullEffects` per row (not the live URL).
 */

/** Id that enables the saved live effect stack (empty = live is plain image only). */
export const SAVED_LIVE_EFFECTS_IMGUR_ID = GRAY_FOG_TEASER_IMGUR_ID

export function getLiveTeaserImgurId(): string | null {
  return imgurIdFromUrl(FORUM_TEASER_IMAGE_URL)
}

/** Live embed: full stack only when the hotlink matches the saved effects id. */
export function liveTeaserHasSavedEffectStack(imgSrc: string): boolean {
  return supportsGrayFog(imgSrc)
}

/** Archive row: full stack when `fullEffects: true`; otherwise plain image. */
export function archiveTeaserHasSavedEffectStack(
  _imgurId: string,
  fullEffects: boolean,
): boolean {
  return fullEffects
}

/** @deprecated Use {@link liveTeaserHasSavedEffectStack}. */
export const liveTeaserHasFullEffectStack = liveTeaserHasSavedEffectStack

/** @deprecated Use {@link archiveTeaserHasSavedEffectStack}. */
export const archiveTeaserHasFullEffectStack = archiveTeaserHasSavedEffectStack

export { supportsGrayFog, supportsGrayFogForImgurId, GRAY_FOG_TEASER_IMGUR_ID }
