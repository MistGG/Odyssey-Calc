import { WIKI_SITE_ORIGIN } from '../config/env'

const ODYSSEY_PROXY_ORIGIN = 'https://odyssey-proxy.qawsar-ahmed.workers.dev/proxy'

/** Same-origin-friendly URL for wiki static assets (models, icons) used on canvas. */
export function proxiedWikiAssetUrl(url: string): string {
  try {
    const u = new URL(url)
    const wikiOrigin = new URL(WIKI_SITE_ORIGIN).origin
    if (u.origin === wikiOrigin) {
      return `${ODYSSEY_PROXY_ORIGIN}${u.pathname}${u.search}`
    }
  } catch {
    /* ignore */
  }
  return url
}
