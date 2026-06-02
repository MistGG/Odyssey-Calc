/**
 * Mark specific meter parses unranked and remove their leaderboard rows.
 *
 *   node scripts/invalidate-meter-parses.mjs <parse-uuid> [...]
 *   node scripts/invalidate-meter-parses.mjs --reason wrong_role_bucket <uuid> [...]
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { createClient } from '@supabase/supabase-js'
import { meterSupabaseEnv } from './load-env-local.mjs'

const { url, key } = meterSupabaseEnv()
const args = process.argv.slice(2)
const reasonIdx = args.indexOf('--reason')
const reason =
  reasonIdx >= 0 ? args[reasonIdx + 1]?.trim() || 'manual_invalidate_v1' : 'manual_invalidate_v1'
const parseIds = args.filter((a) => a !== '--reason' && a !== reason)

if (!url || !key) {
  console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.')
  process.exit(1)
}

if (!parseIds.length) {
  console.error('Usage: node scripts/invalidate-meter-parses.mjs [--reason code] <parse-uuid> [...]')
  process.exit(1)
}

const sb = createClient(url, key, { auth: { persistSession: false } })

function patchPayload(payload) {
  if (!payload || typeof payload !== 'object' || !payload.dungeon) return payload
  return {
    ...payload,
    dungeon: {
      ...payload.dungeon,
      leaderboardEligible: false,
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
    invalidateReason: reason,
  }
}

let updated = 0
let entriesDeleted = 0

for (const id of parseIds) {
  const { data: row, error: fetchErr } = await sb
    .from('meter_parses')
    .select('id, dungeon_name, payload, leaderboard_summary')
    .eq('id', id)
    .maybeSingle()

  if (fetchErr) {
    console.error('fetch failed', id, fetchErr.message)
    continue
  }
  if (!row) {
    console.error('not found', id)
    continue
  }

  const players = (row.payload?.members ?? [])
    .map((m) => m.tamerName || m.displayLabel)
    .join(', ')
  console.log(`invalidate ${id.slice(0, 8)} ${row.dungeon_name ?? ''} [${players}]`)

  const { error: upErr } = await sb
    .from('meter_parses')
    .update({
      payload: patchPayload(row.payload),
      leaderboard_summary: patchSummary(row.leaderboard_summary),
    })
    .eq('id', id)

  if (upErr) {
    console.error('update failed', id, upErr.message)
    continue
  }

  const { error: delErr, count } = await sb
    .from('meter_leaderboard_entries')
    .delete({ count: 'exact' })
    .eq('parse_id', id)

  if (delErr) console.error('delete entries failed', id, delErr.message)
  else entriesDeleted += count ?? 0

  updated += 1
}

console.log(JSON.stringify({ reason, updated, entriesDeleted }, null, 2))
