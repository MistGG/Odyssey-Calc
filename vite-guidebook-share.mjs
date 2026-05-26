/**

 * Serve static share HTML before the SPA fallback (HashRouter otherwise

 * swallows /share/... and shows Browse).

 *

 * Guidebook: committed files under public/share/guidebook/

 * Meter profiles: public/share/meter-player/{key}.html if present, else Supabase public storage (dev)

 */

import fs from 'node:fs'

import path from 'node:path'



const GUIDEBOOK_PATH_RE = /^\/(?:Odyssey-Calc\/)?share\/guidebook\/([^/]+)\/?$/
const EVENT_SHARE_PATH_RE = /^\/(?:Odyssey-Calc\/)?share\/event\/([^/]+)\/?$/

const METER_PLAYER_HTML_RE =
  /^\/(?:Odyssey-Calc\/)?(?:share\/meter-player|meter-player)\/([^/]+)\.html$/

const METER_PLAYER_OG_RE =
  /^\/(?:Odyssey-Calc\/)?(?:share\/meter-player|meter-player)\/([^/]+)-og\.png$/

const METER_PLAYER_LEGACY_RE =

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



function serveEventShare(req, res, next, root) {
  const url = (req.url ?? '').split('?')[0]
  const match = url.match(EVENT_SHARE_PATH_RE)
  if (!match) return next()

  const file = path.join(root, 'public', 'share', 'event', match[1], 'index.html')
  if (!fs.existsSync(file)) return next()

  res.statusCode = 200
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  fs.createReadStream(file).pipe(res)
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

  const htmlMatch = url.match(METER_PLAYER_HTML_RE)

  const ogMatch = url.match(METER_PLAYER_OG_RE)

  const legacyMatch = url.match(METER_PLAYER_LEGACY_RE)



  let playerKey

  let wantsOg = false

  let localFile



  if (htmlMatch) {

    playerKey = decodeURIComponent(htmlMatch[1])

    localFile = path.join(root, 'public', 'share', 'meter-player', `${playerKey.toLowerCase()}.html`)

  } else if (ogMatch) {

    playerKey = decodeURIComponent(ogMatch[1])

    wantsOg = true

    localFile = path.join(root, 'public', 'share', 'meter-player', `${playerKey.toLowerCase()}-og.png`)

  } else if (legacyMatch) {

    playerKey = decodeURIComponent(legacyMatch[1])

    wantsOg = legacyMatch[2] === 'og.png' || url.endsWith('og.png')

    const key = playerKey.toLowerCase()

    localFile = wantsOg

      ? path.join(root, 'public', 'share', 'meter-player', `${key}-og.png`)

      : path.join(root, 'public', 'share', 'meter-player', `${key}.html`)

  } else {

    return next()

  }



  if (fs.existsSync(localFile)) {

    res.statusCode = 200

    res.setHeader('Content-Type', wantsOg ? 'image/png' : 'text/html; charset=utf-8')

    fs.createReadStream(localFile).pipe(res)

    return

  }



  const filename = wantsOg ? 'og.png' : 'index.html'

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

        serveEventShare(req, res, next, server.config.root)

      })

      server.middlewares.use((req, res, next) => {

        serveGuidebookShare(req, res, next, server.config.root)

      })

      server.middlewares.use((req, res, next) => {

        void serveMeterPlayerShare(req, res, next, server.config.root)

      })

    },

    configurePreviewServer(server) {

      server.middlewares.use((req, res, next) => {

        serveEventShare(req, res, next, server.config.root)

      })

      server.middlewares.use((req, res, next) => {

        serveGuidebookShare(req, res, next, server.config.root)

      })

      server.middlewares.use((req, res, next) => {

        void serveMeterPlayerShare(req, res, next, server.config.root)

      })

    },

  }

}


