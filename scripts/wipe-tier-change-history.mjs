/**
 * Wipe tier changes history and optionally trigger a fresh wiki API sync.
 *
 *   node scripts/wipe-tier-change-history.mjs --dry-run
 *   node scripts/wipe-tier-change-history.mjs
 *   node scripts/wipe-tier-change-history.mjs --sync
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * For --sync set TIER_SYNC_CRON_KEY (TIER_SYNC_FUNCTION_URL optional; derived from VITE_SUPABASE_URL).
 */
import { meterSupabaseEnv } from './load-env-local.mjs'
import { createClient } from '@supabase/supabase-js'

const { url, key } = meterSupabaseEnv()
const dryRun = process.argv.includes('--dry-run')
const runSync = process.argv.includes('--sync')

if (!url || !key) {
  console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.')
  process.exit(1)
}

const sb = createClient(url, key, { auth: { persistSession: false } })

async function countTable(name) {
  const { count, error } = await sb.from(name).select('*', { count: 'exact', head: true })
  if (error) throw error
  return count ?? 0
}

const beforeSync = await countTable('tier_sync_runs')
let beforeRecompute = 0
try {
  beforeRecompute = await countTable('tier_recompute_runs')
} catch {
  beforeRecompute = 0
}

console.log(JSON.stringify({ beforeSync, beforeRecompute, dryRun }, null, 2))

if (!dryRun) {
  if (beforeRecompute > 0) {
    const { error } = await sb.from('tier_recompute_runs').delete().gte('created_at', '1970-01-01')
    if (error && !/does not exist|schema cache/i.test(error.message)) {
      console.error('tier_recompute_runs delete failed', error.message)
    }
  }
  const { error: syncDelErr } = await sb.from('tier_sync_runs').delete().gte('created_at', '1970-01-01')
  if (syncDelErr) {
    console.error('tier_sync_runs delete failed', syncDelErr.message)
    process.exit(1)
  }
}

if (runSync && !dryRun) {
  const syncUrl =
    (process.env.TIER_SYNC_FUNCTION_URL || '').trim() ||
    (url ? `${url}/functions/v1/sync-tier-index` : '')
  const syncKey = (process.env.TIER_SYNC_CRON_KEY || '').trim()
  if (!syncUrl || !syncKey) {
    console.error(
      'Set TIER_SYNC_CRON_KEY in .env.local for --sync (TIER_SYNC_FUNCTION_URL is optional; defaults from VITE_SUPABASE_URL).',
    )
    process.exit(1)
  }
  const res = await fetch(syncUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sync-key': syncKey,
    },
    body: JSON.stringify({ source: 'wipe-tier-change-history' }),
  })
  const text = await res.text()
  if (!res.ok) {
    console.error('sync failed', res.status, text)
    process.exit(1)
  }
  console.log('sync response:', text)
}

const afterSync = dryRun ? beforeSync : await countTable('tier_sync_runs')
let afterRecompute = dryRun ? beforeRecompute : 0
if (!dryRun) {
  try {
    afterRecompute = await countTable('tier_recompute_runs')
  } catch {
    afterRecompute = 0
  }
}

console.log(JSON.stringify({ afterSync, afterRecompute, wiped: !dryRun, synced: runSync && !dryRun }, null, 2))
