const FORUM_ORIGIN = 'https://digitalodyssey.proboards.com'

function resolveForumUrl(href) {
  return new URL(href, FORUM_ORIGIN).href
}

/** Parse forum homepage HTML for the latest announcement teaser. */
export function parseForumTeaserHtml(html) {
  const boxIdx = html.search(/class=["']announcement-box["']/i)
  if (boxIdx === -1) {
    throw new Error('No announcement box found on forum homepage')
  }
  const chunk = html.slice(boxIdx, boxIdx + 6000)

  const imgMatch =
    chunk.match(/<img[^>]+src=["']([^"']+)["']/i) ??
    chunk.match(/<img[^>]+src=([^\s>]+)/i)
  if (!imgMatch?.[1]) {
    throw new Error('No teaser image found in announcement box')
  }

  const linkMatch =
    chunk.match(/<a[^>]+class=["']announcement-link["'][^>]+href=["']([^"']+)["']/i) ??
    chunk.match(/<a[^>]+href=["']([^"']+)["'][^>]+class=["']announcement-link["']/i)
  if (!linkMatch?.[1]) {
    throw new Error('No read-more link found in announcement box')
  }

  return {
    imageRemoteUrl: resolveForumUrl(imgMatch[1].trim()),
    readMoreUrl: resolveForumUrl(linkMatch[1].trim()),
  }
}

export function imgurIdFromUrl(url) {
  const m = url.match(/imgur\.com\/(?:gallery\/)?([A-Za-z0-9]+)/i)
  return m?.[1] ?? null
}
