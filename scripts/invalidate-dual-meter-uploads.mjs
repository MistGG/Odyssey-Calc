/**
 * Mark superseded dual-meter uploads ineligible and remove their leaderboard rows.
 *
 *   node scripts/invalidate-dual-meter-uploads.mjs --dry-run
 *   node scripts/invalidate-dual-meter-uploads.mjs
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { createClient } from '@supabase/supabase-js'
import { meterSupabaseEnv } from './load-env-local.mjs'

const { url, key } = meterSupabaseEnv()
const dryRun = process.argv.includes('--dry-run')
const limit = Math.min(Math.max(Number(process.env.SCAN_LIMIT) || 5000, 100), 50_000)

if (!url || !key) {
  console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.')
  process.exit(1)
}

const sb = createClient(url, key, { auth: { persistSession: false } })

const SUPERSESSION_MS = 30 * 60 * 1000

const PARSE_SELECT =
  'id, created_at, duration_sec, app_version, payload, parse_kind, dungeon_id, dungeon_name, difficulty, difficulty_id, leaderboard_summary'

function normKey(s) {
  return (s ?? '').trim().toLowerCase()
}

function partyMembers(payload) {
  if (!payload || payload.kind !== 'dungeon_party' || !Array.isArray(payload.members)) return []
  return payload.members
}

function parseScopeKey(row) {
  const dungeonId = row.dungeon_id?.trim() || payloadDungeonId(row.payload)
  const difficultyId = row.difficulty_id ?? payloadDifficultyId(row.payload) ?? 0
  if (!dungeonId || difficultyId < 2) return null
  return `${dungeonId}:${difficultyId}`
}

function payloadDungeonId(payload) {
  return payload?.dungeon?.dungeonId?.trim() || ''
}

function payloadDifficultyId(payload) {
  return payload?.dungeon?.difficultyId ?? null
}

function playerKeys(row) {
  const keys = new Set()
  for (const m of partyMembers(row.payload)) {
    const k = normKey(m.tamerName || m.displayLabel || m.memberKey)
    if (k) keys.add(k)
  }
  return keys
}

function overlap(a, b) {
  let n = 0
  for (const k of a) if (b.has(k)) n += 1
  return n
}

function memberDps(member, row, members) {
  const dur = Math.max(row.duration_sec ?? 0, member.durationSec ?? 0, ...members.map((m) => m.durationSec ?? 0), 1e-6)
  return (member.totalDamage ?? 0) / dur
}

function parseCompanionVersion(v) {
  if (!v?.trim()) return null
  const m = v.trim().match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

function isFixedCompanion(v) {
  const p = parseCompanionVersion(v)
  if (!p) return false
  const [maj, min, patch] = p
  if (maj > 0) return true
  if (min > 1) return true
  return patch >= 69
}

function clusterRows(rows, windowMs = SUPERSESSION_MS) {
  const sorted = [...rows].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  const clusters = []
  for (const row of sorted) {
    if (!partyMembers(row.payload).length) continue
    const scope = parseScopeKey(row)
    if (!scope) continue
    const time = new Date(row.created_at).getTime()
    const players = playerKeys(row)
    let merged = false
    for (const cluster of clusters) {
      const anchor = cluster[0]
      if (parseScopeKey(anchor) !== scope) continue
      const anchorTime = new Date(anchor.created_at).getTime()
      if (time - anchorTime > windowMs) continue
      if (overlap(players, playerKeys(anchor)) >= 2) {
        cluster.push(row)
        merged = true
        break
      }
    }
    if (!merged) clusters.push([row])
  }
  return clusters
}

function supersededIds(rows) {
  const drop = new Set()
  for (const cluster of clusterRows(rows)) {
    if (cluster.length <= 1) continue
    if (cluster.every((row) => isFixedCompanion(row.app_version))) continue

    const wouldDrop = new Set()
    const stats = cluster.map((row) => {
      const members = partyMembers(row.payload)
      const self = members.find((m) => m.isSelf === true)
      return {
        id: row.id,
        created_at: row.created_at,
        dungeon_name: row.dungeon_name,
        app_version: row.app_version,
        memberCount: members.length,
        damagingCount: members.filter((m) => (m.totalDamage ?? 0) > 0).length,
        self: self
          ? { key: normKey(self.tamerName || self.displayLabel), dps: memberDps(self, row, members) }
          : null,
        members: members.map((m) => ({
          name: m.tamerName || m.displayLabel,
          self: m.isSelf,
          dps: Math.round(memberDps(m, row, members)),
        })),
      }
    })

    const maxMembers = Math.max(...stats.map((s) => s.memberCount))
    const maxDamaging = Math.max(...stats.map((s) => s.damagingCount))

    for (const s of stats) {
      let mark = false
      if (s.memberCount < maxMembers && s.damagingCount <= maxDamaging) mark = true
      if (s.self?.dps > 0) {
        for (const other of stats) {
          if (other.id === s.id || !other.self) continue
          if (other.self.key === s.self.key) continue
          const lo = Math.min(s.self.dps, other.self.dps)
          const hi = Math.max(s.self.dps, other.self.dps)
          if (hi > 0 && lo / hi >= 0.94) {
            if (s.memberCount < other.memberCount) mark = true
            if (s.memberCount === other.memberCount && s.damagingCount < other.damagingCount) {
              mark = true
            }
          }
        }
      }
      if (mark) wouldDrop.add(s.id)
    }

    const remaining = stats.filter((s) => !wouldDrop.has(s.id))
    if (remaining.length > 1) {
      const bestMembers = Math.max(...remaining.map((s) => s.memberCount))
      for (const s of remaining) {
        if (s.memberCount < bestMembers) wouldDrop.add(s.id)
      }
    }

    if (wouldDrop.size > 0) {
      for (const row of cluster) drop.add(row.id)
    }
  }
  return drop
}

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
    invalidateReason: 'dual_meter_superseded_v1',
  }
}

async function* iterParses() {
  let offset = 0
  const page = 200
  while (offset < limit) {
    const { data, error } = await sb
      .from('meter_parses')
      .select(PARSE_SELECT)
      .eq('parse_kind', 'dungeon_party')
      .gte('difficulty_id', 2)
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

const all = []
for await (const row of iterParses()) {
  all.push(row)
}

const dropIds = supersededIds(all)
console.log(`Scanned ${all.length} parses, ${dropIds.size} invalid dual-meter upload(s)`)

if (!dropIds.size) {
  console.log('Nothing to invalidate.')
  process.exit(0)
}

for (const id of dropIds) {
  const row = all.find((r) => r.id === id)
  const members = row ? partyMembers(row.payload).map((m) => m.tamerName || m.displayLabel).join(', ') : ''
  console.log(' ', id, row?.created_at?.slice(0, 19), row?.dungeon_name, `v${row?.app_version ?? '?'}`, members)
}

let updated = 0
let entriesDeleted = 0

for (const id of dropIds) {
  const row = all.find((r) => r.id === id)
  if (!row) continue

  if (dryRun) {
    updated += 1
    continue
  }

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

  if (delErr) {
    console.error('delete entries failed', id, delErr.message)
  } else {
    entriesDeleted += count ?? 0
  }

  updated += 1
}

console.log(JSON.stringify({ dryRun, updated, entriesDeleted }, null, 2))

if (!dryRun) {
  let purged = 0
  let offset = 0
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

if (!dryRun && updated > 0) {
  console.log('Tip: npm run backfill:meter-parses — refresh leaderboard rows for remaining uploads in each cluster.')
}
