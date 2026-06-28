/**
 * Scrape the live forum teaser, download a UK-safe copy, and write teaser-manifest.json.
 *
 *   node scripts/sync-forum-teaser.mjs
 *
 * ProBoards serves a POW bot challenge to headless browsers; we solve it in Node
 * (see scripts/lib/proboardsPowBypass.mjs) so CI does not need Playwright.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { imgurIdFromUrl, parseForumTeaserHtml } from './lib/parseForumTeaser.mjs'
import { fetchProboardsPage } from './lib/proboardsPowBypass.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'public', 'teasers')
const manifestPath = path.join(root, 'public', 'data', 'teaser-manifest.json')
const FORUM_HOME = 'https://digitalodyssey.proboards.com/'
const FETCH_TIMEOUT_MS = 120_000

async function scrapeForumTeaser() {
  const { html } = await fetchProboardsPage(FORUM_HOME, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  return parseForumTeaserHtml(html)
}

function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch {
    return null
  }
}

function bundledExtForId(id) {
  for (const ext of ['png', 'jpg', 'jpeg']) {
    const p = path.join(outDir, `${id}.${ext}`)
    if (fs.existsSync(p)) return ext === 'jpeg' ? 'jpg' : ext
  }
  return null
}

function syncImage(imageRemoteUrl) {
  execFileSync(process.execPath, ['scripts/sync-teaser-images.mjs', imageRemoteUrl], {
    cwd: root,
    stdio: 'inherit',
  })
}

const scraped = await scrapeForumTeaser()
const imgurId = imgurIdFromUrl(scraped.imageRemoteUrl)
if (!imgurId) {
  console.error('Forum teaser is not an Imgur URL:', scraped.imageRemoteUrl)
  process.exit(1)
}

const previous = readManifest()
const changed = previous?.teaser?.imgurId !== imgurId

if (changed || !bundledExtForId(imgurId)) {
  console.log(changed ? `New teaser id: ${imgurId}` : `Missing bundled file for ${imgurId}, re-downloading`)
  syncImage(scraped.imageRemoteUrl)
}

const bundledExt = bundledExtForId(imgurId)
if (!bundledExt) {
  console.error('Download finished but bundled teaser file is missing for', imgurId)
  process.exit(1)
}

const manifest = {
  updated_at: new Date().toISOString(),
  teaser: {
    imgurId,
    imageRemoteUrl: scraped.imageRemoteUrl,
    readMoreUrl: scraped.readMoreUrl,
    bundledExt,
  },
}

fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`wrote ${manifestPath}`)

if (!changed && previous?.teaser?.bundledExt === bundledExt) {
  console.log('Teaser unchanged:', imgurId)
} else {
  console.log('Teaser manifest updated:', imgurId)
}
