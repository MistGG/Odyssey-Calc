/**
 * Serve static guidebook share HTML before the SPA fallback (HashRouter otherwise
 * swallows /share/... and shows Browse).
 */
import fs from 'node:fs'
import path from 'node:path'

const SHARE_PATH_RE = /^\/(?:Odyssey-Calc\/)?share\/guidebook\/([^/]+)\/?$/

function serveSharePage(req, res, next, root) {
  const url = (req.url ?? '').split('?')[0]
  const match = url.match(SHARE_PATH_RE)
  if (!match) return next()

  const file = path.join(root, 'public', 'share', 'guidebook', match[1], 'index.html')
  if (!fs.existsSync(file)) return next()

  res.statusCode = 200
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  fs.createReadStream(file).pipe(res)
}

export function guidebookSharePagesPlugin() {
  return {
    name: 'guidebook-share-pages',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        serveSharePage(req, res, next, server.config.root)
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        serveSharePage(req, res, next, server.config.root)
      })
    },
  }
}
