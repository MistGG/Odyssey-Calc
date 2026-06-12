/**
 * Download forum teaser PNGs (via US-accessible proxy) into public/teasers/ for UK-safe hosting.
 *
 *   node scripts/sync-teaser-images.mjs
 *   node scripts/sync-teaser-images.mjs https://i.imgur.com/bvXYVDQ.png
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'public', 'teasers')
const PROXY = 'https://odyssey-proxy.qawsar-ahmed.workers.dev/proxy-img'

function readDefaultUrl() {
  const src = fs.readFileSync(path.join(root, 'src/lib/forumTeaserImage.ts'), 'utf8')
  const m = src.match(/FORUM_TEASER_IMAGE_URL\s*=\s*'([^']+)'/)
  if (!m?.[1]) throw new Error('Could not read FORUM_TEASER_IMAGE_URL')
  return m[1]
}

function imgurId(url) {
  const m = url.match(/imgur\.com\/(?:gallery\/)?([A-Za-z0-9]+)/i)
  return m?.[1] ?? null
}

function iImgurPngUrl(id) {
  return `https://i.imgur.com/${id}.png`
}

function imageExt(buf) {
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8
  if (isPng) return 'png'
  if (isJpeg) return 'jpg'
  return null
}

async function download(url) {
  const res = await fetch(url, {
    headers: { Accept: 'image/*,*/*', 'User-Agent': 'OdysseyCalc-sync-teasers/1.0' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 10_000) throw new Error(`Response too small (${buf.length} bytes)`)
  const ext = imageExt(buf)
  if (!ext) {
    const head = buf.subarray(0, 120).toString('utf8')
    if (/viewable in your region|<html/i.test(head)) {
      throw new Error('Imgur returned regional block / HTML instead of image')
    }
    throw new Error('Not a PNG/JPEG file')
  }
  return { buf, ext }
}

const remote = process.argv[2]?.trim() || readDefaultUrl()
const id = imgurId(remote)
if (!process.argv[2]?.trim()) {
  console.log(`Using FORUM_TEASER_IMAGE_URL: ${remote}`)
  console.log('If the forum changed teasers, update src/lib/forumTeaserImage.ts first.')
}
if (!id) {
  console.error('Not an Imgur URL:', remote)
  process.exit(1)
}

const sources = [
  `${PROXY}/i.imgur.com/${id}.png`,
  iImgurPngUrl(id),
]

let downloaded = null
let used = null
for (const url of sources) {
  try {
    downloaded = await download(url)
    used = url
    break
  } catch (e) {
    console.warn(`skip ${url}:`, e instanceof Error ? e.message : e)
  }
}

if (!downloaded) {
  console.error('All download sources failed')
  process.exit(1)
}

const { buf, ext } = downloaded
fs.mkdirSync(outDir, { recursive: true })
for (const stale of ['png', 'jpg', 'jpeg', 'webp']) {
  if (stale === ext) continue
  const stalePath = path.join(outDir, `${id}.${stale}`)
  if (fs.existsSync(stalePath)) fs.unlinkSync(stalePath)
}
const outPath = path.join(outDir, `${id}.${ext}`)
fs.writeFileSync(outPath, buf)
console.log(`wrote ${outPath} (${buf.length} bytes) from ${used}`)
