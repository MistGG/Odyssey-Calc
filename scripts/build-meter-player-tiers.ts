/**
 * Build slim public/data/meter-player-tier-lookup.json (playerKey → tier).
 * Runtime profile loads fetch only this static file — no Supabase.
 *
 *   npx tsx scripts/build-meter-player-tiers.ts
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync, unlinkSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import {
  getDefaultMeterLeaderboardCycle,
  meterLeaderboardCycleShortLabel,
  meterLeaderboardCycleWindow,
} from '../src/lib/meterLeaderboardCycles'
import { filterGoldRecordBreaksByScope } from '../src/lib/meterHallOfFame'
import {
  computePlayerTierSnapshot,
  type PlayerTierEntryInput,
  type PlayerTierHofCounts,
} from '../src/lib/meterPlayerTiers'
import { METER_ROLE_BUCKET_LABELS, type MeterRoleBucket } from '../src/lib/meterRoleBuckets'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = resolve(root, '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    const keyName = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (process.env[keyName] === undefined) process.env[keyName] = v
  }
}

const url = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
  ''
if (!url || !key) {
  console.error(
    'Need VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY) in env / .env.local',
  )
  process.exit(1)
}

const ROLE_BUCKETS = new Set<MeterRoleBucket>(['melee', 'ranged', 'caster', 'hybrid', 'tank', 'healer'])

function asRole(raw: string | null | undefined): MeterRoleBucket | null {
  const v = (raw ?? '').trim() as MeterRoleBucket
  return ROLE_BUCKETS.has(v) ? v : null
}

/** REST-only client; polyfill WebSocket on Node < 22 for @supabase/realtime-js init. */
async function createMeterSupabase() {
  const options: {
    auth: { persistSession: boolean; autoRefreshToken: boolean }
    global: { headers: Record<string, string> }
    realtime?: { transport: typeof WebSocket }
  } = {
    auth: { persistSession: false, autoRefreshToken: false },
    // Gateway requires an official Odyssey client header (same as the website).
    global: { headers: { 'x-odyssey-client': 'odyssey-calc' } },
  }
  if (typeof WebSocket === 'undefined') {
    const { default: ws } = await import('ws')
    options.realtime = { transport: ws as unknown as typeof WebSocket }
  }
  return createClient(url, key, options)
}

const sb = await createMeterSupabase()
const cycle = getDefaultMeterLeaderboardCycle()
const window = meterLeaderboardCycleWindow(cycle)

console.log(`Building player tiers for ${cycle.id} since ${window.windowStart}...`)

const entries: PlayerTierEntryInput[] = []
let offset = 0
const page = 1000
while (true) {
  let q = sb
    .from('meter_leaderboard_entries')
    .select(
      'player_key, display_name, dps, role_bucket, dungeon_id, difficulty_id, digimon_id, digimon_name, created_at',
    )
    .gte('difficulty_id', 2)
    .gte('created_at', window.windowStart)
    .order('created_at', { ascending: true })
    .range(offset, offset + page - 1)
  if (window.windowEnd) q = q.lt('created_at', window.windowEnd)
  const { data, error } = await q
  if (error) throw error
  const rows = data ?? []
  if (!rows.length) break
  for (const row of rows) {
    const role = asRole(row.role_bucket)
    const playerKey = String(row.player_key ?? '').trim().toLowerCase()
    const dungeonId = String(row.dungeon_id ?? '').trim()
    const dps = Number(row.dps)
    if (!role || !playerKey || !dungeonId || !(dps > 0)) continue
    entries.push({
      playerKey,
      displayName: String(row.display_name ?? playerKey).trim() || playerKey,
      dps,
      roleBucket: role,
      dungeonId,
      difficultyId: Number(row.difficulty_id) || 0,
      digimonId: String(row.digimon_id ?? '').trim(),
      digimonName: String(row.digimon_name ?? '').trim(),
      createdAt: String(row.created_at ?? ''),
    })
  }
  console.log(`  entries ${entries.length} (+${rows.length})`)
  if (rows.length < page) break
  offset += page
}

/** Prestige: true inductions on Normal + Hard; additive caps applied in scorer (5H + 10N). */
const hofCountsByPlayer: Record<string, PlayerTierHofCounts> = {}
{
  type GoldRow = {
    dungeon_id: string | null
    difficulty_id: number | null
    role_bucket: string | null
    parse_id: string | null
    created_at: string | null
    player_key: string | null
    display_name: string | null
    dps: number | null
    digimon_id: string | null
    digimon_name: string | null
    icon_id: string | null
    portrait_url: string | null
  }
  const goldRows: GoldRow[] = []
  let hofOffset = 0
  while (true) {
    const { data, error } = await sb
      .from('meter_hof_gold_entries')
      .select(
        'dungeon_id,difficulty_id,role_bucket,parse_id,created_at,player_key,display_name,dps,digimon_id,digimon_name,icon_id,portrait_url',
      )
      .in('difficulty_id', [2, 3])
      .order('created_at', { ascending: true })
      .range(hofOffset, hofOffset + page - 1)
    if (error) throw error
    const rows = (data ?? []) as GoldRow[]
    if (!rows.length) break
    goldRows.push(...rows)
    if (rows.length < page) break
    hofOffset += page
  }

  const mapped = goldRows
    .map((row) => {
      const role = asRole(row.role_bucket)
      const dps = Number(row.dps) || 0
      const parseId = String(row.parse_id ?? '').trim()
      const playerKey = String(row.player_key ?? '').trim().toLowerCase()
      const dungeonId = String(row.dungeon_id ?? '').trim()
      const difficultyId = Number(row.difficulty_id) || 0
      if (!role || dps <= 0 || !parseId || !playerKey || !dungeonId || difficultyId < 2) return null
      return {
        roleBucket: role,
        roleLabel: METER_ROLE_BUCKET_LABELS[role],
        parseId,
        achievedAt: row.created_at ?? '',
        playerKey,
        displayName: String(row.display_name ?? playerKey).trim() || playerKey,
        dps,
        digimonId: String(row.digimon_id ?? '').trim(),
        digimonName: String(row.digimon_name ?? '').trim(),
        iconId: row.icon_id,
        portraitUrl: row.portrait_url ?? undefined,
        dungeonId,
        difficultyId,
      }
    })
    .filter((row): row is NonNullable<typeof row> => row != null)

  const inductions = filterGoldRecordBreaksByScope(mapped, (row) => ({
    dungeonId: row.dungeonId,
    difficultyId: row.difficultyId,
  })).filter((row) => {
    const t = new Date(row.achievedAt).getTime()
    if (!Number.isFinite(t) || t < new Date(window.windowStart).getTime()) return false
    if (window.windowEnd && t >= new Date(window.windowEnd).getTime()) return false
    return true
  })

  for (const row of inductions) {
    const acc = hofCountsByPlayer[row.playerKey] ?? { hard: 0, normal: 0 }
    if (row.difficultyId === 3) acc.hard += 1
    else if (row.difficultyId === 2) acc.normal += 1
    hofCountsByPlayer[row.playerKey] = acc
  }
  console.log(
    `  hof gold ${goldRows.length}, cycle inductions ${inductions.length}, players ${Object.keys(hofCountsByPlayer).length}`,
  )
}

const snapshot = computePlayerTierSnapshot({
  cycleId: cycle.id,
  cycleLabel: meterLeaderboardCycleShortLabel(cycle),
  windowStart: window.windowStart,
  windowEnd: window.windowEnd,
  entries,
  hofCountsByPlayer,
})

/** Client-facing file: playerKey → tier only (keeps profile loads tiny; no Supabase at runtime). */
const lookup = {
  version: 1 as const,
  cycleId: snapshot.cycleId,
  cycleLabel: snapshot.cycleLabel,
  tiers: Object.fromEntries(snapshot.players.map((p) => [p.playerKey, p.tier])),
}

const outDir = resolve(root, 'public/data')
mkdirSync(outDir, { recursive: true })
const outPath = resolve(outDir, 'meter-player-tier-lookup.json')
writeFileSync(outPath, `${JSON.stringify(lookup)}\n`, 'utf8')

const legacyFat = resolve(outDir, 'meter-player-tiers.json')
if (existsSync(legacyFat)) unlinkSync(legacyFat)

console.log(
  JSON.stringify(
    {
      outPath,
      bytes: Buffer.byteLength(JSON.stringify(lookup)),
      playerCount: snapshot.playerCount,
      rankedCount: snapshot.rankedCount,
      tiers: Object.fromEntries(
        Object.entries(snapshot.byTier).map(([tier, rows]) => [tier, rows.length]),
      ),
    },
    null,
    2,
  ),
)
