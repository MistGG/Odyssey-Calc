/** Static copies under `public/teasers/{imgurId}.png` (see `npm run sync:teasers`). */
export const TEASER_ASSET_DIR = 'teasers'

export function imgurIdFromUrl(url: string): string | null {
  const m = url.match(/imgur\.com\/([A-Za-z0-9]+)/i)
  return m?.[1] ?? null
}

export function imgurIdFromBundledPath(url: string): string | null {
  const m = url.match(/\/teasers\/([A-Za-z0-9]+)\.png/i)
  return m?.[1] ?? null
}

export function imgurTeaserRemoteUrl(imgurId: string): string {
  return `https://i.imgur.com/${imgurId.trim()}.png`
}

/** On-site copy shipped with the build (survives Imgur deletion). */
export function bundledTeaserImageUrl(imgurId: string): string {
  const id = imgurId.trim()
  const base = import.meta.env.BASE_URL
  const prefix = base.endsWith('/') ? base : `${base}/`
  return `${prefix}${TEASER_ASSET_DIR}/${id}.png`
}

export function isBundledTeaserImageUrl(url: string, imgurId: string): boolean {
  const id = imgurId.trim()
  if (!id) return false
  return url.includes(`/teasers/${id}.png`)
}
