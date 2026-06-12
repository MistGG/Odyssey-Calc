/**
 * Scrape the live forum teaser, download a UK-safe copy, and write teaser-manifest.json.
 *
 *   node scripts/sync-forum-teaser.mjs
 *
 * Requires: playwright (installed in GHA or `npm install --no-save playwright`)
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

import { imgurIdFromUrl, parseForumTeaserHtml } from './lib/parseForumTeaser.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'public', 'teasers')
const manifestPath = path.join(root, 'public', 'data', 'teaser-manifest.json')
const FORUM_HOME = 'https://digitalodyssey.proboards.com/'
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

async function scrapeForumTeaser() {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ userAgent: USER_AGENT })
    await page.goto(FORUM_HOME, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    try {
      await page.waitForSelector('.announcement-box img', { timeout: 45_000 })
      const live = await page.evaluate(() => {
        const box = document.querySelector('.announcement-box')
        if (!box) return null
        const img = box.querySelector('img')
        const link = box.querySelector('a.announcement-link')
        if (!img?.src || !link?.href) return null
        return { imageRemoteUrl: img.src, readMoreUrl: link.href }
      })
      if (live?.imageRemoteUrl && live?.readMoreUrl) return live
    } catch {
      /* fall through to HTML parse */
    }
    const html = await page.content()
    return parseForumTeaserHtml(html)
  } finally {
    await browser.close()
  }
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
