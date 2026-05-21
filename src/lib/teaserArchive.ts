import { FORUM_TEASER_IMAGE_URL, FORUM_TEASER_THREAD_URL } from './forumTeaserImage'
import { bundledTeaserImageUrl, imgurIdFromUrl } from './teaserImageStorage'
import { GRAY_FOG_TEASER_IMGUR_ID } from '../effects/grayFogConfig'

export type TeaserArchiveEntry = {
  /** Stable slug (usually Imgur id). */
  id: string
  imgurId: string
  imageUrl: string
  title: string
  /** Short label for the archive list. */
  dateLabel: string
  /** CRT + GrayFog + red-eye ignition (saved effect stack). */
  fullEffects: boolean
}

/**
 * Past forum teasers kept on-site so CRT / GrayFog / eye effects remain playable
 * after {@link FORUM_TEASER_IMAGE_URL} changes (see `teaserEffectsPolicy.ts`). Add archive
 * rows with `fullEffects: true` only for ids that had the saved stack; run `sync:teasers`.
 */
export const TEASER_ARCHIVE_ENTRIES: TeaserArchiveEntry[] = [
  {
    id: GRAY_FOG_TEASER_IMGUR_ID,
    imgurId: GRAY_FOG_TEASER_IMGUR_ID,
    imageUrl: bundledTeaserImageUrl(GRAY_FOG_TEASER_IMGUR_ID),
    title: 'Dungeon silhouettes',
    dateLabel: 'May 2026',
    fullEffects: true,
  },
]

export { FORUM_TEASER_THREAD_URL }

/** Live forum teaser id from {@link FORUM_TEASER_IMAGE_URL}. */
export function getLiveTeaserImgurId(): string | null {
  return imgurIdFromUrl(FORUM_TEASER_IMAGE_URL)
}

/** Archive list with `isCurrent` derived from the live forum URL. */
export function getTeaserArchive(): (TeaserArchiveEntry & { isCurrent: boolean })[] {
  const liveId = getLiveTeaserImgurId()
  return TEASER_ARCHIVE_ENTRIES.map((entry) => ({
    ...entry,
    isCurrent: liveId !== null && entry.imgurId === liveId,
  }))
}

export function getTeaserArchiveEntry(
  id: string | null | undefined,
): (TeaserArchiveEntry & { isCurrent: boolean }) | undefined {
  const list = getTeaserArchive()
  if (!id) return list.find((e) => e.isCurrent) ?? list[0]
  return list.find((e) => e.id === id || e.imgurId === id)
}
