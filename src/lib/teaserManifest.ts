import { bundledTeaserImageUrls } from './teaserImageStorage'

export type TeaserManifest = {
  updated_at: string
  teaser: {
    imgurId: string
    imageRemoteUrl: string
    readMoreUrl: string
    bundledExt: 'png' | 'jpg'
  }
}

function manifestUrl(): string {
  const base = import.meta.env.BASE_URL || '/'
  const prefix = base.endsWith('/') ? base : `${base}/`
  return `${prefix}data/teaser-manifest.json`
}

export async function fetchTeaserManifest(): Promise<{
  manifest: TeaserManifest | null
  error: string | null
}> {
  try {
    const res = await fetch(manifestUrl(), { cache: 'no-store' })
    if (!res.ok) {
      if (res.status === 404) return { manifest: null, error: null }
      return { manifest: null, error: `Teaser manifest HTTP ${res.status}` }
    }
    const raw = (await res.json()) as TeaserManifest
    if (!raw?.teaser?.imgurId || !raw.teaser.imageRemoteUrl || !raw.teaser.readMoreUrl) {
      return { manifest: null, error: 'Invalid teaser manifest payload.' }
    }
    return { manifest: raw, error: null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { manifest: null, error: msg }
  }
}

/** UK-safe bundled URLs for the live manifest teaser (same origin as the site). */
export function bundledUrlsFromManifest(manifest: TeaserManifest): string[] {
  const id = manifest.teaser.imgurId.trim()
  const preferred = bundledTeaserImageUrls(id)
  const ext = manifest.teaser.bundledExt
  const primary = preferred.find((url) => url.endsWith(`.${ext}`)) ?? preferred[0]
  return [primary, ...preferred.filter((url) => url !== primary)]
}
