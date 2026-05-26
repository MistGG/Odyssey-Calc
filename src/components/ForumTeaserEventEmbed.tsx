import { EVENT_TEASER_IMAGE_URL } from '../lib/mayClearEvent'
import { imgurIdFromUrl } from '../lib/teaserImageStorage'
import { ForumTeaserEmbed } from './ForumTeaserEmbed'

/** Event page announcement image, plain only (no CRT / fog / Marsmon). */
export function ForumTeaserEventEmbed() {
  const imgurId = imgurIdFromUrl(EVENT_TEASER_IMAGE_URL) ?? undefined
  return <ForumTeaserEmbed plainOnly imageUrl={EVENT_TEASER_IMAGE_URL} imgurId={imgurId} />
}
