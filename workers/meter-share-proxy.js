/**
 * Cloudflare Worker route: serve meter profile Discord share pages from Supabase storage.
 * Mount on odyssey-proxy (or similar) so shares work before the next GitHub Pages sync.
 *
 * Example path: /share/meter-player/:playerKey
 * Optional: /share/meter-player/:playerKey/og.png
 */
const BUCKET = 'meter-profile-shares'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const pageMatch = url.pathname.match(/^\/share\/meter-player\/([^/]+)\/?$/i)
    const ogMatch = url.pathname.match(/^\/share\/meter-player\/([^/]+)\/og\.png$/i)
    const match = ogMatch || pageMatch
    if (!match) return new Response('Not found', { status: 404 })

    const supabaseUrl = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
    if (!supabaseUrl) return new Response('Supabase URL not configured', { status: 500 })

    const playerKey = decodeURIComponent(match[1]).trim().toLowerCase()
    const folder = encodeURIComponent(playerKey)
    const filename = ogMatch ? 'og.png' : 'index.html'
    const storageUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${folder}/${filename}`

    const res = await fetch(storageUrl, { headers: { Accept: '*/*' } })
    if (!res.ok) return new Response('Share preview not found', { status: res.status })

    const headers = new Headers(res.headers)
    headers.set('Access-Control-Allow-Origin', '*')
    headers.set('Cache-Control', 'public, max-age=300')
    if (filename === 'index.html') {
      headers.set('Content-Type', 'text/html; charset=utf-8')
    }

    return new Response(res.body, { status: res.status, headers })
  },
}
