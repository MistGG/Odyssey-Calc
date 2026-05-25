/**
 * Cloudflare Worker for instant Discord meter profile previews.
 *
 * Deploy with custom domain: share.odyssey-calc.com
 * Secrets: SUPABASE_URL (your project URL, no trailing slash)
 *
 * Serves HTML + og.png from public Supabase storage; never exposes Supabase in the share link.
 */
const BUCKET = 'meter-profile-shares'
const DEFAULT_APP_ORIGIN = 'https://odyssey-calc.com'

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const publicOrigin = (env.SHARE_PUBLIC_ORIGIN || 'https://share.odyssey-calc.com').replace(/\/$/, '')
    const appOrigin = (env.APP_SITE_ORIGIN || DEFAULT_APP_ORIGIN).replace(/\/$/, '')

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

    const supabaseUrl = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
    if (!supabaseUrl) {
      return new Response('Share service not configured', { status: 500 })
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
