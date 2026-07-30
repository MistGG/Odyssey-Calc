import { isAllowedCommunityGuideImageUrl } from './communityGuideImageUrl'
import {
  DEFAULT_METER_SHARE_PUBLIC_ORIGIN,
} from '../config/site'

export const GUIDE_IMAGES_BUCKET = 'guide-images'
export const GUIDE_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const GUIDE_IMAGE_ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

/** CDN / share Worker origin used for durable guide image URLs. */
export function resolveGuideImageCdnOrigin(): string {
  const fromGuide = (import.meta.env.VITE_GUIDE_IMAGE_CDN_ORIGIN as string | undefined)?.trim()
  if (fromGuide) return fromGuide.replace(/\/$/, '')
  const fromShare = (import.meta.env.VITE_METER_SHARE_PUBLIC_ORIGIN as string | undefined)?.trim()
  if (fromShare) return fromShare.replace(/\/$/, '')
  return DEFAULT_METER_SHARE_PUBLIC_ORIGIN
}

function supabasePublicOrigin(): string | null {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
  if (!url) return null
  return url.replace(/\/$/, '')
}

/** Public Supabase storage object URL for a path in the guide-images bucket. */
export function guideImageStoragePublicUrl(storagePath: string): string {
  const origin = supabasePublicOrigin()
  if (!origin) throw new Error('Supabase is not configured.')
  const path = storagePath.replace(/^\/+/, '')
  return `${origin}/storage/v1/object/public/${GUIDE_IMAGES_BUCKET}/${path}`
}

/** Durable CDN URL served by the share Worker with long cache headers. */
export function guideImageCdnUrl(storagePath: string): string {
  const path = storagePath.replace(/^\/+/, '')
  return `${resolveGuideImageCdnOrigin()}/guide-images/${path}`
}

export function isDurableCommunityGuideImageUrl(url: string): boolean {
  const trimmed = url.trim()
  if (!trimmed || !isAllowedCommunityGuideImageUrl(trimmed)) return false
  try {
    const parsed = new URL(trimmed)
    const cdn = resolveGuideImageCdnOrigin()
    if (trimmed.startsWith(`${cdn}/guide-images/`)) return true
    const supabase = supabasePublicOrigin()
    if (
      supabase &&
      trimmed.startsWith(`${supabase}/storage/v1/object/public/${GUIDE_IMAGES_BUCKET}/`)
    ) {
      return true
    }
    // Path-style check for share worker on any host.
    if (/\/guide-images\/[^/]+\/[^/]+$/i.test(parsed.pathname)) {
      return parsed.hostname.includes('odyssey-calc.com') || parsed.hostname.includes('supabase')
    }
    return false
  } catch {
    return false
  }
}

export function extensionForGuideImageMime(contentType: string): string {
  const mime = contentType.toLowerCase().split(';')[0]!.trim()
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/gif') return 'gif'
  return 'bin'
}

export function mimeFromGuideImageFileName(name: string): string | null {
  const lower = name.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return null
}

export function validateGuideImageBlob(blob: Blob, fileName?: string): string {
  const mime =
    (blob.type && GUIDE_IMAGE_ALLOWED_MIME.has(blob.type) ? blob.type : null) ||
    (fileName ? mimeFromGuideImageFileName(fileName) : null)
  if (!mime || !GUIDE_IMAGE_ALLOWED_MIME.has(mime)) {
    throw new Error('Images must be JPEG, PNG, WebP, or GIF.')
  }
  if (blob.size <= 0) throw new Error('Image file is empty.')
  if (blob.size > GUIDE_IMAGE_MAX_BYTES) {
    throw new Error('Images must be 5 MB or smaller.')
  }
  return mime
}

/** Collect http(s) image URLs from markdown body `![](url)` forms (block + inline). */
export function collectCommunityGuideMarkdownImageUrls(body: string): string[] {
  const urls: string[] = []
  const seen = new Set<string>()
  const re = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(body))) {
    const url = match[1]?.trim() ?? ''
    if (!url || seen.has(url)) continue
    if (!isAllowedCommunityGuideImageUrl(url)) continue
    seen.add(url)
    urls.push(url)
  }
  return urls
}

export function rewriteCommunityGuideMarkdownImageUrls(
  body: string,
  replacements: Map<string, string>,
): string {
  if (!replacements.size) return body
  return body.replace(/(!\[[^\]]*]\()([^)\s]+)((?:\s+"[^"]*")?\))/g, (full, pre, url, post) => {
    const next = replacements.get(String(url).trim())
    if (!next) return full
    return `${pre}${next}${post}`
  })
}
