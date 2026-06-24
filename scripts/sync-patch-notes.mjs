/**
 * Sync official Digital Odyssey patch notes (Outline share) into static JSON for the SPA.
 *
 *   node scripts/sync-patch-notes.mjs
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const OUTLINE_API = 'https://docs.thedigitalodyssey.com/api'
const SHARE_ID = '2bb157c9-224d-48ab-a6f2-697589ebe97a'
const OFFICIAL_URL = `https://docs.thedigitalodyssey.com/s/${SHARE_ID}/?theme=dark`

async function outlinePost(endpoint, body) {
  const res = await fetch(`${OUTLINE_API}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Outline ${endpoint} failed (${res.status}): ${text.slice(0, 200)}`)
  }
  const json = await res.json()
  if (!json.ok) throw new Error(`Outline ${endpoint} error: ${json.message || json.error || 'unknown'}`)
  return json.data
}

function slugFromDocUrl(url) {
  const match = String(url || '').match(/\/doc\/([^/?#]+)/)
  return match?.[1]?.trim() || ''
}

async function main() {
  const share = await outlinePost('shares.info', { id: SHARE_ID })
  const children = share?.sharedTree?.children ?? []
  if (!children.length) throw new Error('No patch note documents in share tree.')

  const entries = []
  for (const node of children) {
    const doc = await outlinePost('documents.info', { id: node.id, shareId: SHARE_ID })
    const slug = slugFromDocUrl(doc.url)
    if (!slug) continue
    entries.push({
      id: doc.id,
      slug,
      title: doc.title?.trim() || node.title?.trim() || slug,
      text: doc.text ?? '',
      updatedAt: doc.updatedAt ?? doc.publishedAt ?? null,
      publishedAt: doc.publishedAt ?? null,
    })
    await new Promise((r) => setTimeout(r, 40))
  }

  const catalog = {
    syncedAt: new Date().toISOString(),
    shareId: SHARE_ID,
    officialUrl: OFFICIAL_URL,
    entries,
  }

  const outDir = path.join(root, 'public', 'data', 'patch-notes')
  await fs.mkdir(outDir, { recursive: true })
  const outPath = path.join(outDir, 'catalog.json')
  await fs.writeFile(outPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
  console.log(`Wrote ${entries.length} patch notes to ${path.relative(root, outPath)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
