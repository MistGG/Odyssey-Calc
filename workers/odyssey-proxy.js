/**
 * Cloudflare Worker: proxy The Digital Odyssey APIs for odyssey-calc.com.
 *
 * Wiki GETs are cached in the Worker Cache API (shared across all visitors).
 * Tier-list rebuilds bypass cache via `X-Odyssey-Wiki-Refresh: 1` and refresh the entry.
 *
 * Deploy: npx wrangler deploy -c wrangler-odyssey-proxy.toml
 */
const WIKI_ORIGIN = 'https://thedigitalodyssey.com'
/** Shared edge cache for wiki JSON (seconds). */
const WIKI_CACHE_MAX_AGE_SEC = 12 * 60 * 60
/** Shorter cache for other proxied GET APIs (raid timer, etc.). */
const DEFAULT_CACHE_MAX_AGE_SEC = 5 * 60

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, X-Odyssey-Wiki-Refresh',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    ...extra,
  }
}

function withCors(response, extraHeaders = {}) {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(corsHeaders(extraHeaders))) {
    headers.set(key, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function wikiRefreshRequested(request) {
  return request.headers.get('X-Odyssey-Wiki-Refresh') === '1'
}

function originUrlFromProxy(request) {
  const url = new URL(request.url)
  const originPath = url.pathname.replace(/^\/proxy/, '') || '/'
  return `${WIKI_ORIGIN}${originPath}${url.search}`
}

function isWikiApiPath(pathname) {
  return pathname.startsWith('/proxy/api/wiki')
}

async function cachedProxyGet(request, ctx, { maxAgeSec, forceRefresh = false }) {
  const cache = caches.default
  const cacheKey = new Request(request.url, { method: 'GET' })

  if (!forceRefresh) {
    const hit = await cache.match(cacheKey)
    if (hit) {
      return withCors(hit, { 'X-Odyssey-Cache': 'HIT' })
    }
  }

  const originUrl = originUrlFromProxy(request)
  const originRes = await fetch(originUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cf: { cacheTtl: forceRefresh ? 0 : maxAgeSec },
  })

  if (!originRes.ok) {
    return withCors(originRes, { 'X-Odyssey-Cache': forceRefresh ? 'REFRESH-ERROR' : 'MISS-ERROR' })
  }

  const body = await originRes.arrayBuffer()
  const headers = new Headers()
  headers.set('Content-Type', originRes.headers.get('Content-Type') || 'application/json')
  headers.set('Cache-Control', `public, max-age=${maxAgeSec}`)

  const response = new Response(body, { status: originRes.status, headers })
  ctx.waitUntil(cache.put(cacheKey, response.clone()))

  return withCors(response, {
    'X-Odyssey-Cache': forceRefresh ? 'REFRESH' : 'MISS',
  })
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }

    if (!url.pathname.startsWith('/proxy/')) {
      return new Response('Not found', { status: 404, headers: corsHeaders() })
    }

    if (request.method !== 'GET') {
      const originUrl = originUrlFromProxy(request)
      const originRes = await fetch(originUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      })
      return withCors(originRes)
    }

    const wiki = isWikiApiPath(url.pathname)
    const forceRefresh = wiki && wikiRefreshRequested(request)
    const maxAgeSec = wiki ? WIKI_CACHE_MAX_AGE_SEC : DEFAULT_CACHE_MAX_AGE_SEC

    return cachedProxyGet(request, ctx, { maxAgeSec, forceRefresh })
  },
}
