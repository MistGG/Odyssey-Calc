/**
 * One-off repair: strip peer isSelf flags left on owned parses by the Jul 24
 * co-upload merge, and fix confirmed_player_key when it was poisoned by that bleed.
 *
 *   node scripts/repair-meter-peer-isSelf-contamination.mjs --dry-run
 *   node scripts/repair-meter-peer-isSelf-contamination.mjs
 *   node scripts/repair-meter-peer-isSelf-contamination.mjs --since 2026-07-24T00:00:00.000Z
 *   node scripts/repair-meter-peer-isSelf-contamination.mjs --reprocess
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { createClient } from '@supabase/supabase-js'
import { meterSupabaseEnv } from './load-env-local.mjs'

const dryRun = process.argv.includes('--dry-run')
const reprocess = process.argv.includes('--reprocess')
const sinceIdx = process.argv.indexOf('--since')
const sinceArg = sinceIdx >= 0 ? process.argv[sinceIdx + 1]?.trim() : null
/** Default: day of the isSelf kit-merge change. */
const since = sinceArg || '2026-07-24T00:00:00.000Z'

const { url, key: envKey } = meterSupabaseEnv()
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || envKey
if (!url || !key) {
  console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.')
  process.exit(1)
}

const sb = createClient(url, key, { auth: { persistSession: false } })

function normKey(raw) {
  return (raw ?? '').trim().toLowerCase()
}

function partyMembers(payload) {
  if (!payload || typeof payload !== 'object') return []
  if (payload.kind && payload.kind !== 'dungeon_party') return []
  return Array.isArray(payload.members) ? payload.members : []
}

function memberKey(member) {
  return normKey(member?.tamerName || member?.displayLabel || member?.memberKey)
}

function selfKeys(payload) {
  const keys = []
  const seen = new Set()
  for (const member of partyMembers(payload)) {
    if (member?.isSelf !== true) continue
    const k = memberKey(member)
    if (!k || seen.has(k)) continue
    seen.add(k)
    keys.push(k)
  }
  return keys
}

function restrictIsSelf(payload, ownerKey) {
  const members = partyMembers(payload)
  return {
    ...payload,
    members: members.map((member) => ({
      ...member,
      isSelf: memberKey(member) === ownerKey,
    })),
  }
}

async function fetchAllContaminatedParses() {
  const pageSize = 500
  let from = 0
  const out = []
  while (true) {
    let q = sb
      .from('meter_parses')
      .select('id, user_id, created_at, payload, dungeon_id, difficulty_id')
      .eq('parse_kind', 'dungeon_party')
      .not('user_id', 'is', null)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    const rows = data ?? []
    for (const row of rows) {
      if (selfKeys(row.payload).length > 1) out.push(row)
    }
    if (rows.length < pageSize) break
    from += pageSize
  }
  return out
}

async function fetchUserContext(userIds) {
  const unique = [...new Set(userIds.filter(Boolean))]
  /** @type {Map<string, { confirmedKey: string | null, displayName: string | null, soleSelfCounts: Map<string, number> }>} */
  const ctx = new Map()
  for (const id of unique) {
    ctx.set(id, {
      confirmedKey: null,
      displayName: null,
      soleSelfCounts: new Map(),
    })
  }

  // Reward accounts
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200)
    const { data, error } = await sb
      .from('meter_reward_accounts')
      .select('user_id, confirmed_player_key')
      .in('user_id', chunk)
    if (error) throw new Error(error.message)
    for (const row of data ?? []) {
      const c = ctx.get(row.user_id)
      if (!c) continue
      const key = normKey(row.confirmed_player_key)
      c.confirmedKey = key || null
    }
  }

  // Profiles
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200)
    const { data, error } = await sb
      .from('profiles')
      .select('id, display_name')
      .in('id', chunk)
    if (error) throw new Error(error.message)
    for (const row of data ?? []) {
      const c = ctx.get(row.id)
      if (!c) continue
      const name = typeof row.display_name === 'string' ? row.display_name.trim() : ''
      c.displayName = name || null
    }
  }

  // Sole-isSelf frequency from clean rows (same window + a bit of history)
  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50)
    const { data, error } = await sb
      .from('meter_parses')
      .select('user_id, payload')
      .eq('parse_kind', 'dungeon_party')
      .in('user_id', chunk)
      .gte('created_at', since)
      .limit(5000)
    if (error) throw new Error(error.message)
    for (const row of data ?? []) {
      const c = ctx.get(row.user_id)
      if (!c) continue
      const selves = selfKeys(row.payload)
      if (selves.length !== 1) continue
      const k = selves[0]
      c.soleSelfCounts.set(k, (c.soleSelfCounts.get(k) || 0) + 1)
    }
  }

  return ctx
}

function majoritySoleSelf(counts) {
  let best = null
  let bestN = 0
  for (const [key, n] of counts) {
    if (n > bestN) {
      best = key
      bestN = n
    }
  }
  return best
}

/**
 * Resolve which isSelf belongs to the parse owner among a contaminated multi-isSelf set.
 */
function resolveOwnerKey(selfSet, userCtx) {
  const set = new Set(selfSet)
  if (userCtx.confirmedKey && set.has(userCtx.confirmedKey)) return userCtx.confirmedKey

  const profileKey = normKey(userCtx.displayName)
  if (profileKey && set.has(profileKey)) return profileKey

  const majority = majoritySoleSelf(userCtx.soleSelfCounts)
  if (majority && set.has(majority)) return majority

  // Prefer the self that appears most as sole-self for this user among candidates
  let best = null
  let bestN = -1
  for (const key of selfSet) {
    const n = userCtx.soleSelfCounts.get(key) || 0
    if (n > bestN) {
      best = key
      bestN = n
    }
  }
  if (best && bestN > 0) return best

  // Last resort: if profile/confirmed exist but not in set, still prefer confirmed/profile
  // only when set size is 2 and we can drop the other by... we can't. Leave null.
  return null
}

function resolveTrustedConfirmedKey(userCtx, repairedOwnerKeys) {
  const profileKey = normKey(userCtx.displayName)
  const counts = new Map(userCtx.soleSelfCounts)
  for (const key of repairedOwnerKeys) {
    if (!key) continue
    counts.set(key, (counts.get(key) || 0) + 2) // weight repaired owners
  }
  const majority = majoritySoleSelf(counts)

  // If stored key is already the profile or majority, keep it.
  if (userCtx.confirmedKey) {
    if (profileKey && userCtx.confirmedKey === profileKey) return userCtx.confirmedKey
    if (majority && userCtx.confirmedKey === majority) return userCtx.confirmedKey
    // Stored key never appears as this user's sole/repaired self — likely poisoned.
    const storedSeen =
      (userCtx.soleSelfCounts.get(userCtx.confirmedKey) || 0) > 0 ||
      repairedOwnerKeys.includes(userCtx.confirmedKey)
    if (!storedSeen && (majority || profileKey)) {
      return majority || profileKey
    }
    return userCtx.confirmedKey
  }

  return majority || profileKey || null
}

console.log(
  `Scanning contaminated multi-isSelf parses since ${since}` +
    (dryRun ? ' (dry-run)' : '') +
    (reprocess ? ' (+reprocess)' : '') +
    '...',
)

const contaminated = await fetchAllContaminatedParses()
console.log(`Found ${contaminated.length} contaminated parse(s).`)

const userIds = contaminated.map((r) => r.user_id).filter(Boolean)
const ctx = await fetchUserContext(userIds)

/** @type {Map<string, string[]>} */
const repairedOwnersByUser = new Map()
const payloadRepairs = []
const skipped = []

for (const row of contaminated) {
  const selves = selfKeys(row.payload)
  const userCtx = ctx.get(row.user_id) || {
    confirmedKey: null,
    displayName: null,
    soleSelfCounts: new Map(),
  }
  const ownerKey = resolveOwnerKey(selves, userCtx)
  if (!ownerKey) {
    skipped.push({
      parseId: row.id,
      userId: row.user_id,
      selves,
      reason: 'could not resolve owner self key',
    })
    continue
  }
  const stripped = selves.filter((k) => k !== ownerKey)
  payloadRepairs.push({
    parseId: row.id,
    userId: row.user_id,
    ownerKey,
    stripped,
    createdAt: row.created_at,
  })
  const list = repairedOwnersByUser.get(row.user_id) || []
  list.push(ownerKey)
  repairedOwnersByUser.set(row.user_id, list)
}

console.log(`Payload repairs: ${payloadRepairs.length}; skipped: ${skipped.length}`)
if (skipped.length) {
  console.log('Skipped sample:', JSON.stringify(skipped.slice(0, 15), null, 2))
}

let payloadUpdated = 0
let payloadErrors = 0
for (const repair of payloadRepairs) {
  const row = contaminated.find((r) => r.id === repair.parseId)
  if (!row) continue
  const nextPayload = restrictIsSelf(row.payload, repair.ownerKey)
  console.log(
    `${dryRun ? '[dry-run] ' : ''}payload ${repair.parseId}: keep isSelf=${repair.ownerKey}; strip=${repair.stripped.join(',')}`,
  )
  if (dryRun) continue
  const { error } = await sb
    .from('meter_parses')
    .update({ payload: nextPayload })
    .eq('id', repair.parseId)
  if (error) {
    payloadErrors += 1
    console.error('update failed', repair.parseId, error.message)
  } else {
    payloadUpdated += 1
  }
}

// Fix confirmed_player_key for affected users (and any whose stored key looks poisoned).
const confirmedFixes = []
for (const userId of new Set([...repairedOwnersByUser.keys(), ...userIds])) {
  const userCtx = ctx.get(userId)
  if (!userCtx) continue
  const trusted = resolveTrustedConfirmedKey(userCtx, repairedOwnersByUser.get(userId) || [])
  if (!trusted) continue
  if (userCtx.confirmedKey === trusted) continue
  confirmedFixes.push({
    userId,
    from: userCtx.confirmedKey,
    to: trusted,
    displayName: userCtx.displayName,
  })
}

console.log(`Confirmed-key fixes: ${confirmedFixes.length}`)
for (const fix of confirmedFixes) {
  console.log(
    `${dryRun ? '[dry-run] ' : ''}confirmed_player_key ${fix.userId}: ${fix.from ?? '(null)'} -> ${fix.to}` +
      (fix.displayName ? ` (profile=${fix.displayName})` : ''),
  )
  if (dryRun) continue
  const { error } = await sb.from('meter_reward_accounts').upsert(
    {
      user_id: fix.userId,
      confirmed_player_key: fix.to,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )
  if (error) console.error('confirmed key upsert failed', fix.userId, error.message)
}

let reprocessOk = 0
let reprocessFail = 0
if (reprocess && !dryRun) {
  console.log(`Reprocessing ${payloadRepairs.length} repaired parse(s) with force...`)
  for (const repair of payloadRepairs) {
    const { data, error } = await sb.functions.invoke('process-meter-leaderboard', {
      body: { parse_id: repair.parseId, force: true },
    })
    if (error || data?.ok === false) {
      reprocessFail += 1
      console.error('reprocess failed', repair.parseId, error?.message ?? data)
    } else {
      reprocessOk += 1
    }
  }
}

console.log(
  JSON.stringify(
    {
      dryRun,
      since,
      contaminated: contaminated.length,
      payloadRepairs: payloadRepairs.length,
      payloadUpdated,
      payloadErrors,
      skipped: skipped.length,
      confirmedFixes: confirmedFixes.length,
      reprocessOk,
      reprocessFail,
      sampleRepairs: payloadRepairs.slice(0, 20),
      sampleConfirmedFixes: confirmedFixes.slice(0, 20),
    },
    null,
    2,
  ),
)
