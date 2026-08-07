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
 * Community guides:
 *   GET /guides/{slug} → OG HTML
 *   GET /guides/{slug}-og.png → 1200×630 padded thumbnail (centered) for Discord
 */
import { ImageResponse } from 'workers-og'

const BUCKET = 'meter-profile-shares'
const GUIDE_IMAGES_BUCKET = 'guide-images'
const DEFAULT_APP_ORIGIN = 'https://odyssey-calc.com'
const OG_WIDTH = 1200
const OG_HEIGHT = 630
const GUIDE_IMAGE_PATH_RE = /^\/guide-images\/([^/]+)\/([^/]+)$/i
const COMMUNITY_GUIDE_OG_RE = /^\/guides\/([^/]+?)-og\.png$/i
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

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function readPngSize(bytes) {
  if (bytes.length < 24) return null
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null
  const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]
  const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]
  if (width <= 0 || height <= 0) return null
  return { width, height }
}

function readJpegSize(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let i = 2
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1
      continue
    }
    const marker = bytes[i + 1]
    if (marker === 0xd9 || marker === 0xda) break
    const len = (bytes[i + 2] << 8) | bytes[i + 3]
    if (len < 2) break
    // SOF0 / SOF2
    if (marker === 0xc0 || marker === 0xc2) {
      const height = (bytes[i + 5] << 8) | bytes[i + 6]
      const width = (bytes[i + 7] << 8) | bytes[i + 8]
      if (width > 0 && height > 0) return { width, height }
      break
    }
    i += 2 + len
  }
  return null
}

function readWebpSize(bytes) {
  if (bytes.length < 30) return null
  const riff =
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
  const webp =
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  if (!riff || !webp) return null
  // VP8X
  if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x58) {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16)
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)
    if (width > 0 && height > 0) return { width, height }
  }
  // VP8 (lossy)
  if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x20) {
    const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff
    const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff
    if (width > 0 && height > 0) return { width, height }
  }
  return null
}

function readImageSize(buffer, contentType) {
  const bytes = new Uint8Array(buffer)
  const type = String(contentType || '').toLowerCase()
  return (
    (type.includes('png') ? readPngSize(bytes) : null) ||
    (type.includes('jpeg') || type.includes('jpg') ? readJpegSize(bytes) : null) ||
    (type.includes('webp') ? readWebpSize(bytes) : null) ||
    readPngSize(bytes) ||
    readJpegSize(bytes) ||
    readWebpSize(bytes) ||
    { width: OG_WIDTH, height: OG_HEIGHT }
  )
}

function fitContain(srcW, srcH, maxW, maxH) {
  // Allow upscaling — Discord OG frames are 1200×630; author thumbs are often smaller.
  const scale = Math.min(maxW / Math.max(1, srcW), maxH / Math.max(1, srcH))
  return {
    width: Math.max(1, Math.round(srcW * scale)),
    height: Math.max(1, Math.round(srcH * scale)),
  }
}

async function fetchThumbnailDataUri(thumbnailUrl) {
  const res = await fetch(thumbnailUrl, { headers: { Accept: 'image/*,*/*' } })
  if (!res.ok) return null
  const contentType = (res.headers.get('Content-Type') || 'image/png').split(';')[0].trim()
  if (!contentType.startsWith('image/')) return null
  const buffer = await res.arrayBuffer()
  if (!buffer.byteLength || buffer.byteLength > 5 * 1024 * 1024) return null
  const size = readImageSize(buffer, contentType)
  // Fill most of the OG canvas; keep a small inset so edges aren't clipped.
  const fitted = fitContain(size.width, size.height, OG_WIDTH - 48, OG_HEIGHT - 48)
  const dataUri = `data:${contentType};base64,${arrayBufferToBase64(buffer)}`
  return { dataUri, width: fitted.width, height: fitted.height }
}

function buildCommunityGuideShareHtml({
  title,
  authorName,
  description,
  sharePageUrl,
  appUrl,
  ogImageUrl,
  hasCustomThumbnail,
}) {
  const safeTitle = title || 'Community guide'
  const pageTitle = `${safeTitle} — Odyssey Calc`
  const desc =
    description ||
    (authorName
      ? `Community guide by ${authorName} on Odyssey Calc`
      : 'Community guide on Odyssey Calc')
  const twitterCard = hasCustomThumbnail ? 'summary_large_image' : 'summary'
  const imageUrl = ogImageUrl || `${DEFAULT_APP_ORIGIN}/logo.png`

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
  <meta property="og:image" content="${escapeHtml(imageUrl)}" />
  <meta property="og:image:width" content="${OG_WIDTH}" />
  <meta property="og:image:height" content="${OG_HEIGHT}" />
  <meta name="twitter:card" content="${twitterCard}" />
  <meta name="twitter:title" content="${escapeHtml(pageTitle)}" />
  <meta name="twitter:description" content="${escapeHtml(desc)}" />
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
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

async function renderCommunityGuideOgPng({ title, authorName, thumbnailUrl }) {
  const thumb = isHttpUrl(thumbnailUrl) ? await fetchThumbnailDataUri(thumbnailUrl) : null
  const subtitle = authorName ? `by ${authorName}` : 'Odyssey Calc community guide'

  if (thumb) {
    const html = `
      <div style="display:flex;width:${OG_WIDTH}px;height:${OG_HEIGHT}px;background:#030712;align-items:center;justify-content:center;">
        <img src="${thumb.dataUri}" width="${thumb.width}" height="${thumb.height}" style="display:flex;" />
      </div>
    `
    return new ImageResponse(html, { width: OG_WIDTH, height: OG_HEIGHT })
  }

  const html = `
    <div style="display:flex;flex-direction:column;width:${OG_WIDTH}px;height:${OG_HEIGHT}px;background:#030712;align-items:center;justify-content:center;padding:64px;">
      <div style="display:flex;color:#67e8f9;font-size:28px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:24px;">Odyssey Calc</div>
      <div style="display:flex;color:#f8fafc;font-size:56px;font-weight:800;text-align:center;line-height:1.15;max-width:1000px;">${escapeHtml(title || 'Community guide')}</div>
      <div style="display:flex;color:#94a3b8;font-size:28px;margin-top:28px;">${escapeHtml(subtitle)}</div>
    </div>
  `
  return new ImageResponse(html, { width: OG_WIDTH, height: OG_HEIGHT })
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

function decodeGuideSlug(raw) {
  try {
    return decodeURIComponent(raw || '').trim()
  } catch {
    return String(raw || '').trim()
  }
}

async function loadPublishedGuideOrResponse(env, supabaseUrl, slug) {
  if (!slug || slug.includes('/') || slug.includes('\\')) {
    return { error: new Response('Not found', { status: 404 }) }
  }
  const anonKey = (env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim()
  if (!anonKey) {
    return { error: new Response('Guide share service not configured', { status: 500 }) }
  }
  try {
    const guide = await fetchPublishedCommunityGuide(supabaseUrl, anonKey, slug)
    if (!guide) return { error: new Response('Guide not found', { status: 404 }) }
    return { guide }
  } catch (err) {
    const status = typeof err?.status === 'number' ? err.status : 502
    return { error: new Response('Guide lookup failed', { status }) }
  }
}

async function handleCommunityGuideOg(request, env, url, supabaseUrl) {
  const match = url.pathname.match(COMMUNITY_GUIDE_OG_RE)
  if (!match) return null

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

  const slug = decodeGuideSlug(match[1])
  const loaded = await loadPublishedGuideOrResponse(env, supabaseUrl, slug)
  if (loaded.error) return loaded.error

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

  const guide = loaded.guide
  try {
    const imageRes = await renderCommunityGuideOgPng({
      title: String(guide.title || slug).trim() || slug,
      authorName: String(guide.author_name || '').trim(),
      thumbnailUrl: String(guide.thumbnail_url || '').trim(),
    })
    const headers = new Headers(imageRes.headers)
    headers.set('Access-Control-Allow-Origin', '*')
    headers.set('Cache-Control', 'public, max-age=300')
    headers.set('X-Odyssey-Cache', 'MISS')
    const body = request.method === 'HEAD' ? null : await imageRes.arrayBuffer()
    const out = new Response(body, { status: 200, headers })
    try {
      await cache.put(cacheKey, out.clone())
    } catch {
      // ignore cache put failures
    }
    return out
  } catch (err) {
    console.error('guide og render failed', err)
    const fallback = String(guide.thumbnail_url || '').trim()
    if (isHttpUrl(fallback)) {
      return Response.redirect(fallback, 302)
    }
    return new Response('OG image failed', { status: 500 })
  }
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
  // Avoid treating /guides/foo-og.png as a share HTML slug.
  if (COMMUNITY_GUIDE_OG_RE.test(url.pathname)) return null

  const slug = decodeGuideSlug(match[1])
  const loaded = await loadPublishedGuideOrResponse(env, supabaseUrl, slug)
  if (loaded.error) return loaded.error

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

  const guide = loaded.guide
  const section = (url.searchParams.get('section') || '').trim()
  const encSlug = encodeURIComponent(guide.slug || slug)
  const appPath = `/#/guides/${encSlug}`
  const appUrl = section
    ? `${appOrigin}${appPath}?section=${encodeURIComponent(section)}`
    : `${appOrigin}${appPath}`
  const sharePageUrl = `${publicOrigin}/guides/${encSlug}${section ? `?section=${encodeURIComponent(section)}` : ''}`
  const thumbnailUrl = String(guide.thumbnail_url || '').trim()
  const hasCustomThumbnail = isHttpUrl(thumbnailUrl)
  const ogImageUrl = hasCustomThumbnail
    ? `${publicOrigin}/guides/${encSlug}-og.png?v=3`
    : `${DEFAULT_APP_ORIGIN}/logo.png`
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
    ogImageUrl,
    hasCustomThumbnail,
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

    const guideOg = await handleCommunityGuideOg(request, env, url, supabaseUrl)
    if (guideOg) return guideOg

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
