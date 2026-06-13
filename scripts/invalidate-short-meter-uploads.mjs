/**
 * Remove ranked dungeon uploads shorter than the leaderboard minimum (30s).
 *
 *   node scripts/invalidate-short-meter-uploads.mjs --dry-run
 *   node scripts/invalidate-short-meter-uploads.mjs
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { createClient } from '@supabase/supabase-js'
import { meterSupabaseEnv } from './load-env-local.mjs'

const MIN_SESSION_SEC = 30
const { url, key } = meterSupabaseEnv()
const dryRun = process.argv.includes('--dry-run')

if (!url || !key) {
  console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.')
  process.exit(1)
}

const sb = createClient(url, key, { auth: { persistSession: false } })

function sessionDur(row) {
  const p = row.payload
  const fromPayload = Number(p?.sessionDurationSec)
  if (Number.isFinite(fromPayload) && fromPayload > 0) return fromPayload
  return Number(row.duration_sec) || 0
}

function shouldInvalidate(row) {
  const dur = sessionDur(row)
  if (dur >= MIN_SESSION_SEC) return false
  const d = row.payload?.dungeon ?? {}
  if (d.leaderboardEligible === true) return true
  if (d.runOutcome === 'clear') return true
  if (row.leaderboard_summary?.eligible === true) return true
  return false
}

function patchPayload(payload) {
  if (!payload || typeof payload !== 'object' || !payload.dungeon) return payload
  return {
    ...payload,
    dungeon: {
      ...payload.dungeon,
      leaderboardEligible: false,
      runOutcome: payload.dungeon.runOutcome === 'fail' ? 'fail' : payload.dungeon.runOutcome,
    },
  }
}

function patchSummary(summary) {
  const base =
    summary && typeof summary === 'object' && Array.isArray(summary.members)
      ? summary
      : { version: 1, members: [] }
  return {
    ...base,
    eligible: false,
    invalidateReason: `meter_reset_or_short_session_v3`,
  }
}

const targets = []
let offset = 0
const page = 500

while (offset < 50_000) {
  const { data, error } = await sb
    .from('meter_parses')
    .select('id, created_at, duration_sec, dungeon_name, payload, leaderboard_summary')
    .eq('parse_kind', 'dungeon_party')
    .gte('difficulty_id', 2)
    .order('created_at', { ascending: false })
    .range(offset, offset + page - 1)

  if (error) {
    console.error(error)
    process.exit(1)
  }
  const rows = data ?? []
  if (!rows.length) break
  for (const row of rows) {
    if (shouldInvalidate(row)) targets.push(row)
  }
  if (rows.length < page) break
  offset += page
}

console.log(`Found ${targets.length} ranked upload(s) under ${MIN_SESSION_SEC}s to invalidate`)

let entriesDeleted = 0
let updated = 0

for (const row of targets) {
  const dur = sessionDur(row)
  const players = (row.payload?.members ?? []).map((m) => m.tamerName || m.displayLabel).join(', ')
  console.log(
    ` ${row.id.slice(0, 8)} ${dur}s ${row.dungeon_name ?? ''} ${row.created_at?.slice(0, 19)} [${players}]`,
  )
  if (dryRun) continue

  const { error: upErr } = await sb
    .from('meter_parses')
    .update({
      payload: patchPayload(row.payload),
      leaderboard_summary: patchSummary(row.leaderboard_summary),
    })
    .eq('id', row.id)
  if (upErr) {
    console.error('update failed', row.id, upErr.message)
    continue
  }

  const { error: delErr, count } = await sb
    .from('meter_leaderboard_entries')
    .delete({ count: 'exact' })
    .eq('parse_id', row.id)
  if (delErr) console.error('delete entries failed', row.id, delErr.message)
  else entriesDeleted += count ?? 0

  updated += 1
}

console.log(JSON.stringify({ dryRun, invalidated: targets.length, updated, entriesDeleted }, null, 2))

if (!dryRun) {
  let purged = 0
  offset = 0
  while (offset < 50_000) {
    const { data, error } = await sb
      .from('meter_parses')
      .select('id')
      .eq('parse_kind', 'dungeon_party')
      .filter('payload->dungeon->>leaderboardEligible', 'eq', 'false')
      .range(offset, offset + 199)
    if (error) {
      console.error('purge list failed', error.message)
      break
    }
    const ids = (data ?? []).map((r) => r.id)
    if (!ids.length) break
    for (const parseId of ids) {
      const { count, error: delErr } = await sb
        .from('meter_leaderboard_entries')
        .delete({ count: 'exact' })
        .eq('parse_id', parseId)
      if (delErr) console.error('purge delete failed', parseId, delErr.message)
      else purged += count ?? 0
    }
    if (ids.length < 200) break
    offset += 200
  }
  console.log(JSON.stringify({ purgedIneligibleEntryRows: purged }, null, 2))
}
