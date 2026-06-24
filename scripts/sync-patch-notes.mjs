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
const OUT_DIR = path.join(root, 'public', 'data', 'patch-notes')
const CATALOG_PATH = path.join(OUT_DIR, 'catalog.json')

async function outlinePost(endpoint, body) {
  const res = await fetch(`${OUTLINE_API}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'OdysseyCalc-sync-patch-notes/1.0',
    },
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

async function readExistingCatalog() {
  try {
    const raw = await fs.readFile(CATALOG_PATH, 'utf8')
    const catalog = JSON.parse(raw)
    if (Array.isArray(catalog?.entries) && catalog.entries.length > 0) return catalog
  } catch {
    /* no fallback */
  }
  return null
}

async function useExistingCatalog(reason) {
  const existing = await readExistingCatalog()
  if (!existing) {
    console.error(`${reason} and no usable catalog.json fallback found.`)
    process.exit(1)
  }
  console.warn(`${reason}; keeping existing catalog (${existing.entries.length} entries).`)
  console.warn(`Run "npm run sync:patch-notes" locally when Outline is reachable, then commit catalog.json.`)
  process.exit(0)
}

function slugFromDocUrl(url) {
  const match = String(url || '').match(/\/doc\/([^/?#]+)/)
  return match?.[1]?.trim() || ''
}

async function main() {
  let share
  try {
    share = await outlinePost('shares.info', { id: SHARE_ID })
  } catch (err) {
    await useExistingCatalog(err instanceof Error ? err.message : 'Outline shares.info failed')
    return
  }

  const children = share?.sharedTree?.children ?? []
  if (!children.length) {
    await useExistingCatalog('No patch note documents in share tree')
    return
  }

  const entries = []
  for (const node of children) {
    let doc
    try {
      doc = await outlinePost('documents.info', { id: node.id, shareId: SHARE_ID })
    } catch (err) {
      await useExistingCatalog(err instanceof Error ? err.message : 'Outline documents.info failed')
      return
    }
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

  if (!entries.length) {
    await useExistingCatalog('No patch note entries could be synced')
    return
  }

  const catalog = {
    syncedAt: new Date().toISOString(),
    shareId: SHARE_ID,
    officialUrl: OFFICIAL_URL,
    entries,
  }

  await fs.mkdir(OUT_DIR, { recursive: true })
  await fs.writeFile(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
  console.log(`Wrote ${entries.length} patch notes to ${path.relative(root, CATALOG_PATH)}`)
}

main().catch(async (err) => {
  await useExistingCatalog(err instanceof Error ? err.message : 'Patch notes sync failed')
})
