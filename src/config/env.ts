/**
 * Wiki API root (no trailing slash).
 * In dev, default `'/api/wiki'` is proxied by Vite → thedigitalodyssey.com (see vite.config).
 * In production, defaults to your Cloudflare Worker proxy.
 */
function readViteEnv(key: string): string | undefined {
  try {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
      ?.env
    if (env) {
      const fromProcess = env[key] ?? env[key.replace(/^VITE_/, '')]
      if (typeof fromProcess === 'string' && fromProcess.trim()) return fromProcess.trim()
    }
  } catch {
    /* not in Node */
  }
  const fromMeta = import.meta.env[key] as string | undefined
  return fromMeta?.trim() || undefined
}

export const WIKI_API_BASE = (() => {
  const fromEnv = readViteEnv('VITE_WIKI_API_BASE')
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (import.meta.env.DEV) return '/api/wiki'
  return 'https://odyssey-proxy.qawsar-ahmed.workers.dev/proxy/api/wiki'
})()

/**
 * Site origin for static assets (wiki uses `/models/{model_id}l.png`).
 */
export const WIKI_SITE_ORIGIN = (() => {
  const v = readViteEnv('VITE_WIKI_SITE_ORIGIN')
  return v ? v.replace(/\/$/, '') : 'https://thedigitalodyssey.com'
})()

/**
 * Optional override for portrait URL. Placeholders: `{model_id}`, `{id}`, `{name}`.
 * If unset, default is `${WIKI_SITE_ORIGIN}/models/${model_id}l.png` (wiki behavior).
 */
export const WIKI_DIGIMON_IMAGE_TEMPLATE = readViteEnv('VITE_WIKI_DIGIMON_IMAGE_TEMPLATE')

/** Digimon list `per_page` when not overridden. Matches common bulk fetch. */
export const WIKI_DIGIMON_PER_PAGE = Number(readViteEnv('VITE_WIKI_DIGIMON_PER_PAGE') ?? 500)
