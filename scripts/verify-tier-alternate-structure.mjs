/**
 * Post-rebuild check: alternate-structure override Digimon must appear in tier-list-live.json.
 * Update REQUIRED_ALTERNATE_OVERRIDE_IDS when new Alternate Structure Module variants ship.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const tierListOut = resolve(dirname(fileURLToPath(import.meta.url)), '../public/data/tier-list-live.json')

/** Wiki override_id values that must be indexed after a full tier rebuild. */
const REQUIRED_ALTERNATE_OVERRIDE_IDS = [
  'd17wcc7a', // Obsidian Valor Ulforce V-dramon (Melee DPS alt)
  'dhs58kt', // Chaos Megidramon (Tank alt)
  'd16e4fy1', // White Gale Ornismon (Support alt; unlock suffix variant)
]

if (!existsSync(tierListOut)) {
  console.error('[verify-tier-alternates] missing', tierListOut)
  process.exit(1)
}

const snapshot = JSON.parse(readFileSync(tierListOut, 'utf8'))
const cache = snapshot?.cache
if (!cache || typeof cache !== 'object') {
  console.error('[verify-tier-alternates] invalid tier-list-live.json shape')
  process.exit(1)
}

const alternateIds = Array.isArray(cache.alternateStructureIds) ? cache.alternateStructureIds : []
const entries = cache.entries ?? {}
const missing = REQUIRED_ALTERNATE_OVERRIDE_IDS.filter((id) => !alternateIds.includes(id))
const missingEntries = REQUIRED_ALTERNATE_OVERRIDE_IDS.filter((id) => !entries[id])

if (missing.length > 0 || missingEntries.length > 0) {
  console.error('[verify-tier-alternates] alternate structure digimon not indexed:')
  for (const id of [...new Set([...missing, ...missingEntries])]) {
    console.error(`  - ${id}`)
  }
  console.error('[verify-tier-alternates] alternateStructureIds:', alternateIds.join(', ') || '(none)')
  process.exit(1)
}

const labels = REQUIRED_ALTERNATE_OVERRIDE_IDS.map((id) => `${entries[id]?.name ?? id} (${entries[id]?.role ?? '?'})`)
console.log('[verify-tier-alternates] ok:', labels.join('; '))
console.log('[verify-tier-alternates] total alternates indexed:', alternateIds.length)
