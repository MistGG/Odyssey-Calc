/**
 * Rebuild published tier list + changelog JSON for GitHub Actions (tier-list-staging).
 * Requires absolute VITE_WIKI_API_BASE. Optional Supabase for community rotations.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runTierListGhaRebuild } from '../src/lib/tierListGhaRebuild.ts'
import {
  TIER_CHANGES_PUBLISHED_PATH,
  TIER_LIST_PUBLISHED_PATH,
  type TierChangesPublished,
  type TierListPublishedBundle,
} from '../src/lib/tierListPublished.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = path.join(root, 'public', 'data')
const tierListFile = path.join(dataDir, 'tier-list.json')
const tierChangesFile = path.join(dataDir, 'tier-changes.json')
const skipMarkerFile = path.join(root, '.tier-rebuild-skip')

function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
  } catch {
    return null
  }
}

function writeJsonFile(filePath: string, data: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

async function main() {
  if (fs.existsSync(skipMarkerFile)) fs.unlinkSync(skipMarkerFile)

  const wikiBase = process.env.VITE_WIKI_API_BASE?.trim()
  if (!wikiBase || !/^https?:\/\//i.test(wikiBase)) {
    console.error(
      'VITE_WIKI_API_BASE must be set to an absolute URL (e.g. the Cloudflare wiki proxy).',
    )
    process.exit(1)
  }

  const result = await runTierListGhaRebuild({
    onProgress: (msg) => console.log(msg),
    loadPrevious: () => ({
      bundle: readJsonFile<TierListPublishedBundle>(tierListFile),
      changes: readJsonFile<TierChangesPublished>(tierChangesFile),
    }),
  })

  if (result.skipCommit) {
    console.log(`Skip commit: ${result.skipReason ?? 'unchanged'}`)
    fs.writeFileSync(skipMarkerFile, result.skipReason ?? 'unchanged', 'utf8')
    return
  }

  writeJsonFile(tierListFile, result.bundle)
  writeJsonFile(tierChangesFile, result.changes)
  console.log(`Wrote ${TIER_LIST_PUBLISHED_PATH} and ${TIER_CHANGES_PUBLISHED_PATH}.`)
  if (result.newHistoryRow) {
    console.log(`Changelog run: ${result.newHistoryRow.finishedAt}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
