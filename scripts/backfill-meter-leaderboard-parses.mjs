/**
 * Ingest leaderboard rows + leaderboard_summary for parses missing meter_leaderboard_entries.
 * Calls process-meter-leaderboard once per parse (works without batch backfill RPCs).
 *
 *   node scripts/backfill-meter-leaderboard-parses.mjs
 *   node scripts/backfill-meter-leaderboard-parses.mjs --dungeon uqia2vm
 *   node scripts/backfill-meter-leaderboard-parses.mjs --dry-run
 *   node scripts/backfill-meter-leaderboard-parses.mjs --force
 */
import { createClient } from '@supabase/supabase-js'
import { meterSupabaseEnv } from './load-env-local.mjs'

const { url, key } = meterSupabaseEnv()
const dryRun = process.argv.includes('--dry-run')
const force = process.argv.includes('--force')
const dungeonIdx = process.argv.indexOf('--dungeon')
const dungeonFilter = dungeonIdx >= 0 ? process.argv[dungeonIdx + 1]?.trim() : ''
const pauseMs = Math.max(Number(process.env.PARSE_PAUSE_MS) || 150, 0)
const maxParses = Math.min(Math.max(Number(process.env.MAX_PARSES) || 10_000, 1), 50_000)

if (!url || !key) {
  console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.')
  process.exit(1)
}

const sb = createClient(url, key, { auth: { persistSession: false } })

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function parseIdsWithAnyEntry() {
  const ids = new Set()
  let offset = 0
  const page = 1000
  while (offset < 200_000) {
    const { data, error } = await sb
      .from('meter_leaderboard_entries')
      .select('parse_id')
      .range(offset, offset + page - 1)
    if (error) throw error
    const rows = data ?? []
    if (!rows.length) break
    for (const row of rows) {
      const id = row.parse_id?.trim()
      if (id) ids.add(id)
    }
    if (rows.length < page) break
    offset += page
  }
  return ids
}

async function* iterEligibleParses() {
  let offset = 0
  const page = 200
  while (offset < maxParses) {
    let q = sb
      .from('meter_parses')
      .select('id, dungeon_id, dungeon_name, difficulty_id')
      .eq('parse_kind', 'dungeon_party')
      .gte('difficulty_id', 2)
      .order('created_at', { ascending: true })
    if (dungeonFilter) q = q.eq('dungeon_id', dungeonFilter)
    const { data, error } = await q.range(offset, offset + page - 1)
    if (error) throw error
    const rows = data ?? []
    if (!rows.length) break
    yield* rows
    if (rows.length < page) break
    offset += page
  }
}

const withEntries = force ? new Set() : await parseIdsWithAnyEntry()
console.log(`Parses already ingested: ${withEntries.size}${force ? ' (--force ignores)' : ''}`)

let scanned = 0
let invoked = 0
let insertedTotal = 0
let skipped = 0
let errors = 0

for await (const row of iterEligibleParses()) {
  scanned += 1
  const parseId = row.id
  if (!force && withEntries.has(parseId)) {
    skipped += 1
    continue
  }

  if (dryRun) {
    console.log('[dry-run] would process', parseId, row.dungeon_name, row.dungeon_id)
    invoked += 1
    continue
  }

  const { data, error } = await sb.functions.invoke('process-meter-leaderboard', {
    body: { parse_id: parseId, force },
  })

  if (error) {
    console.error('invoke failed', parseId, error.message)
    errors += 1
  } else {
    const inserted = Number(data?.inserted) || 0
    if (inserted > 0) {
      insertedTotal += inserted
      console.log('ok', parseId, row.dungeon_name ?? row.dungeon_id, `inserted=${inserted}`)
    } else {
      skipped += 1
      if (data?.skipped) console.log('skip', parseId, data.skipped)
    }
    invoked += 1
  }

  if (pauseMs > 0) await sleep(pauseMs)
}

console.log(
  JSON.stringify({ scanned, invoked, insertedTotal, skipped, errors, dryRun, force, dungeonFilter }, null, 2),
)
