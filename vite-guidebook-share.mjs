/**
 * Serve static share HTML before the SPA fallback (HashRouter otherwise
 * swallows /share/... and shows Browse).
 *
 * Guidebook: committed files under public/share/guidebook/
 * Meter profiles: public/share/meter-player/{key}/ (CI sync) or Supabase public storage
 */
import fs from 'node:fs'
import path from 'node:path'

const GUIDEBOOK_PATH_RE = /^\/(?:Odyssey-Calc\/)?share\/guidebook\/([^/]+)\/?$/
const METER_PLAYER_PATH_RE =
  /^\/(?:Odyssey-Calc\/)?share\/meter-player\/([^/]+)(?:\/(index\.html|og\.png))?\/?$/

function supabaseEnv() {
  const url = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  const key = process.env.VITE_SUPABASE_ANON_KEY || ''
  return url && key ? { url, key } : null
}

function meterShareStorageUrl(playerKey, filename) {
  const env = supabaseEnv()
  if (!env) return null
  const folder = encodeURIComponent(playerKey.trim().toLowerCase())
  return `${env.url}/storage/v1/object/public/meter-profile-shares/${folder}/${filename}`
}

async function fetchSupabaseShare(playerKey, filename) {
  const storageUrl = meterShareStorageUrl(playerKey, filename)
  if (!storageUrl) return null
  const res = await fetch(storageUrl)
  if (!res.ok) return null
  return Buffer.from(await res.arrayBuffer())
}

function serveGuidebookShare(req, res, next, root) {
  const url = (req.url ?? '').split('?')[0]
  const match = url.match(GUIDEBOOK_PATH_RE)
  if (!match) return next()

  const file = path.join(root, 'public', 'share', 'guidebook', match[1], 'index.html')
  if (!fs.existsSync(file)) return next()

  res.statusCode = 200
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  fs.createReadStream(file).pipe(res)
}

async function serveMeterPlayerShare(req, res, next, root) {
  const url = (req.url ?? '').split('?')[0]
  const match = url.match(METER_PLAYER_PATH_RE)
  if (!match) return next()

  const playerKey = decodeURIComponent(match[1])
  const wantsOg = match[2] === 'og.png' || url.endsWith('og.png')
  const filename = wantsOg ? 'og.png' : 'index.html'

  const localFile = path.join(root, 'public', 'share', 'meter-player', playerKey, filename)
  if (fs.existsSync(localFile)) {
    res.statusCode = 200
    res.setHeader('Content-Type', wantsOg ? 'image/png' : 'text/html; charset=utf-8')
    fs.createReadStream(localFile).pipe(res)
    return
  }

  const remote = await fetchSupabaseShare(playerKey, filename)
  if (!remote) return next()

  res.statusCode = 200
  res.setHeader('Content-Type', wantsOg ? 'image/png' : 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.end(remote)
}

export function guidebookSharePagesPlugin() {
  return {
    name: 'guidebook-share-pages',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        serveGuidebookShare(req, res, next, server.config.root)
      })
      server.middlewares.use((req, res, next) => {
        void serveMeterPlayerShare(req, res, next, server.config.root)
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        serveGuidebookShare(req, res, next, server.config.root)
      })
      server.middlewares.use((req, res, next) => {
        void serveMeterPlayerShare(req, res, next, server.config.root)
      })
    },
  }
}
