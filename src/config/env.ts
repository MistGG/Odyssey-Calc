/**
 * Wiki API root (no trailing slash).
 * In dev, default `'/api/wiki'` is proxied by Vite → thedigitalodyssey.com (see vite.config).
 * In production, defaults to your Cloudflare Worker proxy.
 */
export const WIKI_API_BASE = (() => {
  const fromEnv = import.meta.env.VITE_WIKI_API_BASE as string | undefined
  if (fromEnv?.trim()) return fromEnv.trim().replace(/\/$/, '')
  if (import.meta.env.DEV) return '/api/wiki'
  return 'https://odyssey-proxy.qawsar-ahmed.workers.dev/proxy/api/wiki'
})()

/**
 * Site origin for static assets (wiki uses `/models/{model_id}l.png`).
 */
export const WIKI_SITE_ORIGIN = (() => {
  const v = (import.meta.env.VITE_WIKI_SITE_ORIGIN as string | undefined)?.trim()
  return v ? v.replace(/\/$/, '') : 'https://thedigitalodyssey.com'
})()

/**
 * Optional override for portrait URL. Placeholders: `{model_id}`, `{id}`, `{name}`.
 * If unset, default is `${WIKI_SITE_ORIGIN}/models/${model_id}l.png` (wiki behavior).
 */
export const WIKI_DIGIMON_IMAGE_TEMPLATE = (
  import.meta.env.VITE_WIKI_DIGIMON_IMAGE_TEMPLATE as string | undefined
)?.trim()

/** Digimon list `per_page` when not overridden. Matches common bulk fetch. */
export const WIKI_DIGIMON_PER_PAGE = Number(
  import.meta.env.VITE_WIKI_DIGIMON_PER_PAGE ?? 500,
)
