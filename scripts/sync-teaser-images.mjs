/**
 * Download every forum teaser Imgur id referenced in source into public/teasers/.
 * Run automatically before production builds; run manually when the live URL rotates.
 *
 *   npm run sync:teasers
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const srcDir = path.join(root, 'src', 'lib')
const outDir = path.join(root, 'public', 'teasers')

async function readText(rel) {
  return fs.readFile(path.join(root, rel), 'utf8')
}

/** Collect Imgur ids from FORUM_TEASER_IMAGE_URL and TEASER_ARCHIVE_ENTRIES. */
function collectImgurIds(forumTs, archiveTs) {
  const ids = new Set()

  const liveUrl = forumTs.match(
    /export const FORUM_TEASER_IMAGE_URL\s*=\s*['"]([^'"]+)['"]/,
  )?.[1]
  if (liveUrl) {
    const m = liveUrl.match(/imgur\.com\/([A-Za-z0-9]+)/i)
    if (m) ids.add(m[1])
  }

  for (const m of archiveTs.matchAll(/imgurId:\s*['"]([A-Za-z0-9]+)['"]/g)) {
    ids.add(m[1])
  }

  return [...ids].sort()
}

async function downloadPng(imgurId) {
  const url = `https://i.imgur.com/${imgurId}.png`
  const dest = path.join(outDir, `${imgurId}.png`)
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) {
    throw new Error(`${url} → HTTP ${res.status}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length === 0) throw new Error(`${url} → empty body`)
  await fs.writeFile(dest, buf)
  return buf.length
}

async function main() {
  const forumTs = await readText('src/lib/forumTeaserImage.ts')
  const archiveTs = await readText('src/lib/teaserArchive.ts')
  const ids = collectImgurIds(forumTs, archiveTs)

  if (ids.length === 0) {
    console.warn('sync-teaser-images: no Imgur ids found in source')
    process.exit(1)
  }

  await fs.mkdir(outDir, { recursive: true })

  const manifest = { updatedAt: new Date().toISOString(), ids: {} }

  for (const id of ids) {
    const bytes = await downloadPng(id)
    manifest.ids[id] = { bytes, file: `teasers/${id}.png` }
    console.log(`saved public/teasers/${id}.png (${bytes} bytes)`)
  }

  await fs.writeFile(
    path.join(outDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  )
  console.log(`sync-teaser-images: ${ids.length} image(s) up to date`)
}

main().catch((err) => {
  console.error('sync-teaser-images failed:', err.message ?? err)
  process.exit(1)
})
