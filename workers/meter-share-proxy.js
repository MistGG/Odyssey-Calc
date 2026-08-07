/**
 * Cloudflare Worker for instant Discord meter profile previews + durable guide images
 * + community guide Open Graph share pages.
 *
 * Deploy with custom domain: share.odyssey-calc.com
 * Secrets:
 *   SUPABASE_URL (project URL, no trailing slash)
 *   SUPABASE_ANON_KEY (for published community guide metadata)
 *
 * Serves HTML + og.png from public Supabase storage; never exposes Supabase in the share link.
 * Also proxies /guide-images/{userId}/{file} with long immutable cache headers.
 * Community guides: GET /guides/{slug} → OG HTML (thumbnail when set) + link to the SPA.
 */
const BUCKET = 'meter-profile-shares'
const GUIDE_IMAGES_BUCKET = 'guide-images'
const DEFAULT_APP_ORIGIN = 'https://odyssey-calc.com'
const GUIDE_IMAGE_PATH_RE = /^\/guide-images\/([^/]+)\/([^/]+)$/i
const COMMUNITY_GUIDE_SHARE_RE = /^\/guides\/([^/]+?)(?:\.html)?\/?$/i

const ROUTES = [
  { re: /^\/meter-player\/([^/]+)\.html$/i, file: 'index.html', rewrite: true },
  { re: /^\/meter-player\/([^/]+)-og\.png$/i, file: 'og.png', rewrite: false },
  { re: /^\/share\/meter-player\/([^/]+)\.html$/i, file: 'index.html', rewrite: true },
  { re: /^\/share\/meter-player\/([^/]+)-og\.png$/i, file: 'og.png', rewrite: false },
  { re: /^\/share\/meter-player\/([^/]+)\/og\.png$/i, file: 'og.png', rewrite: false },
  { re: /^\/share\/meter-player\/([^/]+)\/?$/i, file: 'index.html', rewrite: true },
]

function playerKeyFromMatch(match) {
  return decodeURIComponent(match[1]).trim().toLowerCase()
}

function rewriteShareHtml(html, publicOrigin, appOrigin, playerKey) {
  const enc = encodeURIComponent(playerKey)
  const pagePath = `/meter-player/${enc}.html`
  const ogPath = `/meter-player/${enc}-og.png`
  const pageUrl = `${publicOrigin}${pagePath}`
  const ogUrl = `${publicOrigin}${ogPath}`
  const appUrl = `${appOrigin}/#/meter/player/${enc}`

  let out = html
  const replacements = [
    [/https?:\/\/[^"'\s]+\/Odyssey-Calc\/share\/meter-player\/[^"'\s]+\/og\.png/gi, ogUrl],
    [/https?:\/\/[^"'\s]+\/share\/meter-player\/[^"'\s]+-og\.png[^"'\s]*/gi, ogUrl],
    [/https?:\/\/[^"'\s]+\/Odyssey-Calc\/#\/meter\/player\/[^"'\s]+/gi, appUrl],
    [/https?:\/\/[^"'\s]+\/Odyssey-Calc\/share\/meter-player\/[^"'\s]+\/?/gi, pageUrl],
    [/https?:\/\/[^"'\s]+\/share\/meter-player\/[^"'\s]+\.html[^"'\s]*/gi, pageUrl],
    [/https?:\/\/mistgg\.github\.io\/Odyssey-Calc\/#\/meter\/player\/[^"'\s]+/gi, appUrl],
    [/https?:\/\/mistgg\.github\.io\/Odyssey-Calc\/share\/meter-player\/[^"'\s]+/gi, pageUrl],
  ]
  for (const [pattern, replacement] of replacements) {
    out = out.replace(pattern, replacement)
  }
  return out
}

function contentTypeForGuideFile(fileName) {
  const lower = String(fileName || '').toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'application/octet-stream'
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function plainGuideExcerpt(body, maxLen = 180) {
  const text = String(body || '')
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/\[\[(?:item|quest|digimon|dungeon):[^|\]]+(?:\|[^\]]*)?\]\]/gi, '')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/[#>*_`~|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return ''
  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen - 1).trimEnd()}…`
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function buildCommunityGuideShareHtml({
  title,
  authorName,
  description,
  sharePageUrl,
  appUrl,
  thumbnailUrl,
}) {
  const safeTitle = title || 'Community guide'
  const pageTitle = `${safeTitle} — Odyssey Calc`
  const desc =
    description ||
    (authorName
      ? `Community guide by ${authorName} on Odyssey Calc`
      : 'Community guide on Odyssey Calc')
  const hasImage = isHttpUrl(thumbnailUrl)
  const twitterCard = hasImage ? 'summary_large_image' : 'summary'
  const imageTags = hasImage
    ? `  <meta property="og:image" content="${escapeHtml(thumbnailUrl)}" />
  <meta name="twitter:image" content="${escapeHtml(thumbnailUrl)}" />`
    : `  <meta property="og:image" content="${escapeHtml(`${DEFAULT_APP_ORIGIN}/logo.png`)}" />
  <meta name="twitter:image" content="${escapeHtml(`${DEFAULT_APP_ORIGIN}/logo.png`)}" />`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(desc)}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Odyssey Calc" />
  <meta property="og:url" content="${escapeHtml(sharePageUrl)}" />
  <meta property="og:title" content="${escapeHtml(pageTitle)}" />
  <meta property="og:description" content="${escapeHtml(desc)}" />
${imageTags}
  <meta name="twitter:card" content="${twitterCard}" />
  <meta name="twitter:title" content="${escapeHtml(pageTitle)}" />
  <meta name="twitter:description" content="${escapeHtml(desc)}" />
  <link rel="canonical" href="${escapeHtml(sharePageUrl)}" />
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center;
      font-family: system-ui, sans-serif; color: #e2e8f0;
      background: #030712;
      background-image:
        linear-gradient(rgba(56, 189, 248, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(56, 189, 248, 0.03) 1px, transparent 1px);
      background-size: 48px 48px; }
    a { color: #7dd3fc; }
  </style>
  <!-- Delayed so Discord can read OG tags before navigation. -->
  <script>setTimeout(function () { location.replace(${JSON.stringify(appUrl)}) }, 1200)</script>
</head>
<body>
  <p><strong>Unofficial fan site.</strong> Odyssey Calc community guide preview, not Digital Odyssey.</p>
  <p>Open <a href="${escapeHtml(appUrl)}">${escapeHtml(safeTitle)}</a> on Odyssey Calc.</p>
</body>
</html>`
}

async function fetchPublishedCommunityGuide(supabaseUrl, anonKey, slug) {
  const endpoint = new URL(`${supabaseUrl}/rest/v1/community_guides`)
  endpoint.searchParams.set('select', 'title,slug,thumbnail_url,author_name,body,status')
  endpoint.searchParams.set('slug', `eq.${slug}`)
  endpoint.searchParams.set('status', 'eq.published')
  endpoint.searchParams.set('limit', '1')

  const res = await fetch(endpoint.toString(), {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: 'application/json',
      'x-odyssey-client': 'odyssey-calc',
    },
  })
  if (!res.ok) {
    const err = new Error(`Guide lookup failed (${res.status})`)
    err.status = res.status
    throw err
  }
  const rows = await res.json()
  if (!Array.isArray(rows) || !rows.length) return null
  return rows[0]
}

async function handleCommunityGuideShare(request, env, url, publicOrigin, appOrigin, supabaseUrl) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Accept, Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    })
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 })
  }

  const match = url.pathname.match(COMMUNITY_GUIDE_SHARE_RE)
  if (!match) return null

  let slug = ''
  try {
    slug = decodeURIComponent(match[1] || '').trim()
  } catch {
    slug = String(match[1] || '').trim()
  }
  if (!slug || slug.includes('/') || slug.includes('\\')) {
    return new Response('Not found', { status: 404 })
  }

  const anonKey = (env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim()
  if (!anonKey) {
    return new Response('Guide share service not configured', { status: 500 })
  }

  const cache = caches.default
  const cacheKey = new Request(url.toString(), { method: 'GET' })
  const cached = await cache.match(cacheKey)
  if (cached) {
    const hit = new Headers(cached.headers)
    hit.set('X-Odyssey-Cache', 'HIT')
    return new Response(request.method === 'HEAD' ? null : cached.body, {
      status: cached.status,
      headers: hit,
    })
  }

  let guide
  try {
    guide = await fetchPublishedCommunityGuide(supabaseUrl, anonKey, slug)
  } catch (err) {
    const status = typeof err?.status === 'number' ? err.status : 502
    return new Response('Guide lookup failed', { status })
  }
  if (!guide) {
    return new Response('Guide not found', { status: 404 })
  }

  const section = (url.searchParams.get('section') || '').trim()
  const encSlug = encodeURIComponent(guide.slug || slug)
  const appPath = `/#/guides/${encSlug}`
  const appUrl = section
    ? `${appOrigin}${appPath}?section=${encodeURIComponent(section)}`
    : `${appOrigin}${appPath}`
  const sharePageUrl = `${publicOrigin}/guides/${encSlug}${section ? `?section=${encodeURIComponent(section)}` : ''}`
  const thumbnailUrl = String(guide.thumbnail_url || '').trim()
  const authorName = String(guide.author_name || '').trim()
  const excerpt = plainGuideExcerpt(guide.body)
  const description = excerpt
    ? authorName
      ? `${excerpt} — by ${authorName}`
      : excerpt
    : authorName
      ? `Community guide by ${authorName} on Odyssey Calc`
      : 'Community guide on Odyssey Calc'

  const html = buildCommunityGuideShareHtml({
    title: String(guide.title || slug).trim() || slug,
    authorName,
    description,
    sharePageUrl,
    appUrl,
    thumbnailUrl,
  })

  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'text/html; charset=utf-8')
  // Short cache so thumbnail/title edits show up; Discord still caches aggressively on its side.
  headers.set('Cache-Control', 'public, max-age=120')
  headers.set('X-Odyssey-Cache', 'MISS')

  const out = new Response(request.method === 'HEAD' ? null : html, { status: 200, headers })
  try {
    await cache.put(cacheKey, out.clone())
  } catch {
    // ignore cache put failures
  }
  return out
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const publicOrigin = (env.SHARE_PUBLIC_ORIGIN || 'https://share.odyssey-calc.com').replace(/\/$/, '')
    const appOrigin = (env.APP_SITE_ORIGIN || DEFAULT_APP_ORIGIN).replace(/\/$/, '')

    const supabaseUrl = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
    if (!supabaseUrl) {
      return new Response('Share service not configured', { status: 500 })
    }

    const guideShare = await handleCommunityGuideShare(
      request,
      env,
      url,
      publicOrigin,
      appOrigin,
      supabaseUrl,
    )
    if (guideShare) return guideShare

    const guideMatch = url.pathname.match(GUIDE_IMAGE_PATH_RE)
    if (guideMatch) {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': 'Accept, Content-Type',
            'Access-Control-Max-Age': '86400',
          },
        })
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method not allowed', { status: 405 })
      }
      const userId = encodeURIComponent(decodeURIComponent(guideMatch[1]).trim())
      const file = encodeURIComponent(decodeURIComponent(guideMatch[2]).trim())
      const storageUrl = `${supabaseUrl}/storage/v1/object/public/${GUIDE_IMAGES_BUCKET}/${userId}/${file}`
      const cache = caches.default
      const cacheKey = new Request(url.toString(), { method: 'GET' })
      const cached = await cache.match(cacheKey)
      if (cached) {
        const hit = new Headers(cached.headers)
        hit.set('X-Odyssey-Cache', 'HIT')
        return new Response(cached.body, { status: cached.status, headers: hit })
      }

      const res = await fetch(storageUrl, { headers: { Accept: 'image/*,*/*' } })
      if (!res.ok) {
        return new Response('Guide image not found', { status: res.status })
      }
      const headers = new Headers()
      headers.set('Access-Control-Allow-Origin', '*')
      headers.set('Cache-Control', 'public, max-age=31536000, immutable')
      headers.set('Content-Type', res.headers.get('Content-Type') || contentTypeForGuideFile(guideMatch[2]))
      headers.set('X-Odyssey-Cache', 'MISS')
      const out = new Response(res.body, { status: 200, headers })
      try {
        await cache.put(cacheKey, out.clone())
      } catch {
        // ignore cache put failures
      }
      return out
    }

    let route = null
    let match = null
    for (const r of ROUTES) {
      const m = url.pathname.match(r.re)
      if (m) {
        route = r
        match = m
        break
      }
    }

    if (!route || !match) {
      return new Response('Not found', { status: 404 })
    }

    const playerKey = playerKeyFromMatch(match)
    const folder = encodeURIComponent(playerKey)
    const storageUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${folder}/${route.file}`

    const res = await fetch(storageUrl, { headers: { Accept: '*/*' } })
    if (!res.ok) {
      return new Response('Share preview not found', { status: res.status })
    }

    const headers = new Headers()
    headers.set('Access-Control-Allow-Origin', '*')
    headers.set('Cache-Control', 'public, max-age=300')

    if (route.file === 'index.html') {
      headers.set('Content-Type', 'text/html; charset=utf-8')
      let html = await res.text()
      if (route.rewrite) {
        html = rewriteShareHtml(html, publicOrigin, appOrigin, playerKey)
      }
      return new Response(html, { status: 200, headers })
    }

    headers.set('Content-Type', 'image/png')
    return new Response(res.body, { status: 200, headers })
  },
}
