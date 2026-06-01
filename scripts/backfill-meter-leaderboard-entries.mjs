/**
 * Backfill meter_leaderboard_entries when ingest stored null roleBucket (wiki lookup failed).
 *
 *   node scripts/backfill-meter-leaderboard-entries.mjs [--dry-run] [--parse <uuid>]
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY from .env.local when set (required for inserts).
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
for (const line of readFileSync(resolve(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i < 0) continue
  let v = t.slice(i + 1).trim()
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1)
  }
  process.env[t.slice(0, i).trim()] = v
}

const dryRun = process.argv.includes('--dry-run')
const parseArgIdx = process.argv.indexOf('--parse')
const singleParseId = parseArgIdx >= 0 ? process.argv[parseArgIdx + 1]?.trim() : ''

const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!key && !dryRun) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required for inserts (set in .env.local).')
  process.exit(1)
}

const sb = createClient(process.env.VITE_SUPABASE_URL, key || process.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
})

const WIKI_BASE =
  process.env.VITE_WIKI_API_BASE?.trim() ||
  'https://odyssey-proxy.qawsar-ahmed.workers.dev/proxy/api/wiki'

function normalizeWikiRole(role) {
  return (role ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function wikiRoleToBucket(role) {
  const norm = normalizeWikiRole(role)
  if (norm === 'melee dps') return 'melee'
  if (norm === 'ranged dps') return 'ranged'
  if (norm === 'caster') return 'caster'
  if (norm === 'hybrid') return 'hybrid'
  if (norm === 'tank') return 'tank'
  if (norm === 'support') return 'healer'
  return null
}

async function fetchWikiCatalog() {
  const base = WIKI_BASE.replace(/\/$/, '')
  const map = new Map()
  let page = 0
  let totalPages = 1
  while (page < totalPages) {
    const url = `${base}/digimon?page=${page}&limit=500`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`wiki page ${page}: ${res.status}`)
    const json = await res.json()
    totalPages = Math.max(1, Number(json.total_pages) || 1)
    for (const d of json.data ?? []) {
      map.set(String(d.id).trim(), {
        role: String(d.role ?? '').trim(),
        name: String(d.name ?? '').trim(),
        modelId: String(d.model_id ?? '').trim(),
      })
    }
    page += 1
  }
  return map
}

function roleBucketForDigimon(digimonId, catalog) {
  const entry = catalog.get(digimonId?.trim())
  if (!entry) return null
  return wikiRoleToBucket(entry.role)
}

async function existingKeysForParse(parseId) {
  const { data, error } = await sb
    .from('meter_leaderboard_entries')
    .select('player_key, role_bucket')
    .eq('parse_id', parseId)
  if (error) throw error
  const keys = new Set()
  for (const row of data ?? []) {
    keys.add(`${row.player_key}:${row.role_bucket}`)
  }
  return keys
}

async function* iterParses() {
  if (singleParseId) {
    const { data, error } = await sb
      .from('meter_parses')
      .select('id, created_at, dungeon_id, difficulty_id, leaderboard_summary')
      .eq('id', singleParseId)
      .maybeSingle()
    if (error) throw error
    if (data) yield data
    return
  }

  let offset = 0
  const page = 200
  while (offset < 5000) {
    const { data, error } = await sb
      .from('meter_parses')
      .select('id, created_at, dungeon_id, difficulty_id, leaderboard_summary')
      .eq('parse_kind', 'dungeon_party')
      .not('leaderboard_summary', 'is', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + page - 1)
    if (error) throw error
    const rows = data ?? []
    if (!rows.length) break
    yield* rows
    if (rows.length < page) break
    offset += page
  }
}

const catalog = await fetchWikiCatalog()
console.log(`Wiki catalog: ${catalog.size} digimon`)

let scanned = 0
let inserted = 0
let skipped = 0

for await (const row of iterParses()) {
  scanned += 1
  const summary = row.leaderboard_summary
  if (!summary?.eligible || !Array.isArray(summary.members)) continue

  const dungeonId = row.dungeon_id?.trim()
  const difficultyId = row.difficulty_id
  if (!dungeonId || difficultyId == null || difficultyId < 2) continue

  const existing = await existingKeysForParse(row.id)

  for (const member of summary.members) {
    const playerKey = String(member.playerKey ?? '').trim().toLowerCase()
    const dps = Number(member.dps) || 0
    if (!playerKey || dps <= 0) continue

    let roleBucket = member.roleBucket
    if (!roleBucket) {
      roleBucket = roleBucketForDigimon(member.digimonId, catalog)
    }
    if (!roleBucket) {
      skipped += 1
      continue
    }

    const dedupeKey = `${playerKey}:${roleBucket}`
    if (existing.has(dedupeKey)) continue

    const entry = {
      parse_id: row.id,
      created_at: row.created_at,
      dungeon_id: dungeonId,
      difficulty_id: difficultyId,
      role_bucket: roleBucket,
      player_key: playerKey,
      display_name: member.displayName || playerKey,
      dps,
      digimon_id: member.digimonId ?? '',
      digimon_name: member.digimonName ?? '',
      icon_id: member.iconId ?? null,
      portrait_url: member.portraitUrl ?? null,
    }

    if (dryRun) {
      console.log('[dry-run] would insert', entry)
    } else {
      const { error } = await sb.from('meter_leaderboard_entries').insert(entry)
      if (error) {
        console.error('insert failed', row.id, playerKey, error.message)
        skipped += 1
        continue
      }
      console.log('inserted', row.id, playerKey, roleBucket, Math.round(dps))
    }
    existing.add(dedupeKey)
    inserted += 1
  }
}

console.log(JSON.stringify({ scanned, inserted, skipped, dryRun }, null, 2))
