/**
 * Re-run process-meter-leaderboard for one parse (repair partial ingests).
 *
 *   node scripts/reprocess-meter-parse.mjs <parse-uuid> [--force]
 *
 * --force  Delete existing leaderboard rows for this parse, then re-insert all party members.
 */
import { createClient } from '@supabase/supabase-js'
import { meterSupabaseEnv } from './load-env-local.mjs'

const { url, key: envKey } = meterSupabaseEnv()

const parseId = process.argv[2]?.trim()
const force = process.argv.includes('--force')
if (!parseId) {
  console.error('Usage: node scripts/reprocess-meter-parse.mjs <parse-uuid> [--force]')
  process.exit(1)
}

const key = process.env.SUPABASE_SERVICE_ROLE_KEY || envKey
const sb = createClient(url, key, {
  auth: { persistSession: false },
})

const { data, error } = await sb.functions.invoke('process-meter-leaderboard', {
  body: { parse_id: parseId, force },
})

if (error) {
  console.error(error)
  process.exit(1)
}
console.log(JSON.stringify(data, null, 2))

const { data: entries } = await sb
  .from('meter_leaderboard_entries')
  .select('player_key, role_bucket, dps')
  .eq('parse_id', parseId)
  .order('dps', { ascending: false })

console.log('entries:', entries)
