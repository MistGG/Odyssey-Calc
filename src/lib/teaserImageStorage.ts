/** Static copies under `public/teasers/{imgurId}.{png|jpg}` (see `npm run sync:teasers`). */
export const TEASER_ASSET_DIR = 'teasers'
const TEASER_BUNDLED_EXTS = ['jpg', 'png'] as const

export function imgurIdFromUrl(url: string): string | null {
  const m = url.match(/imgur\.com\/([A-Za-z0-9]+)/i)
  return m?.[1] ?? null
}

export function imgurIdFromBundledPath(url: string): string | null {
  const m = url.match(/\/teasers\/([A-Za-z0-9]+)\.(?:png|jpe?g)/i)
  return m?.[1] ?? null
}

export function imgurTeaserRemoteUrl(imgurId: string): string {
  return `https://i.imgur.com/${imgurId.trim()}.png`
}

function teaserAssetPrefix(): string {
  const base = import.meta.env.BASE_URL
  return base.endsWith('/') ? base : `${base}/`
}

/** On-site copies shipped with the build (survives Imgur deletion / UK blocks). */
export function bundledTeaserImageUrls(imgurId: string): string[] {
  const id = imgurId.trim()
  const prefix = teaserAssetPrefix()
  return TEASER_BUNDLED_EXTS.map((ext) => `${prefix}${TEASER_ASSET_DIR}/${id}.${ext}`)
}

/** Primary bundled path (jpg first — Imgur often serves JPEG at .png URLs). */
export function bundledTeaserImageUrl(imgurId: string): string {
  return bundledTeaserImageUrls(imgurId)[0]
}

export function isBundledTeaserImageUrl(url: string, imgurId: string): boolean {
  const id = imgurId.trim()
  if (!id) return false
  return TEASER_BUNDLED_EXTS.some((ext) => url.includes(`/teasers/${id}.${ext}`))
}
