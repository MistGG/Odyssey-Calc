import { getMeterAnonSupabase } from './meterDataSource'
import { applyOfficialNamesToPlayerRankEntries } from './meterParseDigimonNames'
import { dpsToPercentile } from './meterParseScoreColor'
import type { PlayerRankEntry } from './meterPublicStats'
import { METER_ROLE_BUCKETS, METER_ROLE_BUCKET_LABELS, type MeterRoleBucket } from './meterRoleBuckets'

const HOF_SCAN_PAGE_SIZE = 1000
const HOF_SCAN_MAX_ROWS = 100_000

export type MeterHallOfFameEntry = PlayerRankEntry & {
  roleBucket: MeterRoleBucket
  roleLabel: string
  parseId: string
  achievedAt: string
  /** Parse percentile vs current all-time pool (may drop below 100 if beaten later). */
  currentPercentile: number
}

type LeaderboardEntryRow = {
  parse_id: string
  created_at: string
  role_bucket: string
  player_key: string
  display_name: string
  dps: number
  digimon_id: string
  digimon_name: string
  icon_id: string | null
  portrait_url: string | null
}

function isRoleBucket(value: string): value is MeterRoleBucket {
  return (METER_ROLE_BUCKETS as readonly string[]).includes(value)
}

function mapRow(row: LeaderboardEntryRow): Omit<MeterHallOfFameEntry, 'currentPercentile'> | null {
  if (!isRoleBucket(row.role_bucket)) return null
  const dps = Number(row.dps) || 0
  if (dps <= 0) return null
  return {
    roleBucket: row.role_bucket,
    roleLabel: METER_ROLE_BUCKET_LABELS[row.role_bucket],
    parseId: row.parse_id,
    achievedAt: row.created_at,
    playerKey: row.player_key,
    displayName: row.display_name || row.player_key,
    dps,
    digimonId: row.digimon_id ?? '',
    digimonName: row.digimon_name ?? '',
    iconId: row.icon_id,
    portraitUrl: row.portrait_url ?? undefined,
  }
}

function entryKey(entry: Pick<MeterHallOfFameEntry, 'parseId' | 'playerKey' | 'achievedAt' | 'roleBucket'>) {
  return `${entry.roleBucket}:${entry.parseId}:${entry.playerKey}:${entry.achievedAt}`
}

/** Max gap between party uploads treated as the same clear (matches ingest dedupe window). */
export const PARTY_UPLOAD_CLUSTER_MS = 10_000

/** Min shared party members to merge parse uploads into one run cluster. */
export const PARTY_UPLOAD_MIN_PLAYER_OVERLAP = 2

type HofRow = Omit<MeterHallOfFameEntry, 'currentPercentile'>

function parsePlayers(rows: HofRow[], parseId: string): Set<string> {
  const players = new Set<string>()
  for (const row of rows) {
    if (row.parseId === parseId) players.add(row.playerKey.trim().toLowerCase())
  }
  return players
}

function playerOverlap(a: Set<string>, b: Set<string>): number {
  let n = 0
  for (const key of a) {
    if (b.has(key)) n += 1
  }
  return n
}

/**
 * When several tamers upload the same party clear, each upload becomes its own `meter_parses` row
 * milliseconds apart with slightly different DPS. Merge those into one logical run before HoF logic.
 */
export function dedupeCoalescedPartyUploads(rows: HofRow[]): HofRow[] {
  if (rows.length <= 1) return rows

  const byParse = new Map<string, HofRow[]>()
  for (const row of rows) {
    const list = byParse.get(row.parseId) ?? []
    list.push(row)
    byParse.set(row.parseId, list)
  }

  const parseIds = [...byParse.keys()].sort((a, b) => {
    const ta = new Date(byParse.get(a)![0]!.achievedAt).getTime()
    const tb = new Date(byParse.get(b)![0]!.achievedAt).getTime()
    return ta - tb
  })

  const parsePlayersCache = new Map<string, Set<string>>()
  const playersFor = (parseId: string) => {
    let set = parsePlayersCache.get(parseId)
    if (!set) {
      set = parsePlayers(rows, parseId)
      parsePlayersCache.set(parseId, set)
    }
    return set
  }

  const clusters: string[][] = []
  for (const parseId of parseIds) {
    const time = new Date(byParse.get(parseId)![0]!.achievedAt).getTime()
    const players = playersFor(parseId)

    let merged = false
    for (const cluster of clusters) {
      const anchorId = cluster[0]!
      const anchorTime = new Date(byParse.get(anchorId)![0]!.achievedAt).getTime()
      if (time - anchorTime > PARTY_UPLOAD_CLUSTER_MS) continue

      let maxOverlap = 0
      for (const otherId of cluster) {
        maxOverlap = Math.max(maxOverlap, playerOverlap(players, playersFor(otherId)))
      }
      if (maxOverlap >= PARTY_UPLOAD_MIN_PLAYER_OVERLAP) {
        cluster.push(parseId)
        merged = true
        break
      }
    }

    if (!merged) clusters.push([parseId])
  }

  const bestByPlayerRole = new Map<string, HofRow>()
  for (const cluster of clusters) {
    const parseSet = new Set(cluster)
    for (const row of rows) {
      if (!parseSet.has(row.parseId)) continue
      const roleKey = `${row.playerKey.trim().toLowerCase()}:${row.roleBucket}`
      const prev = bestByPlayerRole.get(roleKey)
      if (!prev || row.dps > prev.dps) bestByPlayerRole.set(roleKey, row)
    }
  }

  return [...bestByPlayerRole.values()].sort(
    (a, b) => new Date(a.achievedAt).getTime() - new Date(b.achievedAt).getTime(),
  )
}

/**
 * Hall of Fame entry = this parse strictly beat the prior role record for the dungeon+difficulty.
 * Ties at the same DPS do not add another row (they are still 100% parses on the leaderboard, but one induction per record break).
 */
export function goldParsesFromLeaderboardHistory(
  rows: HofRow[],
  currentPoolByRole: Record<MeterRoleBucket, number[]>,
): MeterHallOfFameEntry[] {
  const sorted = dedupeCoalescedPartyUploads(rows)
  const runningMax: Record<MeterRoleBucket, number> = {
    melee: 0,
    ranged: 0,
    caster: 0,
    hybrid: 0,
    tank: 0,
    healer: 0,
  }
  const gold: MeterHallOfFameEntry[] = []
  const seen = new Set<string>()

  for (const entry of sorted) {
    const max = runningMax[entry.roleBucket]
    if (entry.dps <= max) continue

    const key = entryKey(entry)
    if (seen.has(key)) continue
    seen.add(key)

    const pool = currentPoolByRole[entry.roleBucket]
    gold.push({
      ...entry,
      currentPercentile: dpsToPercentile(entry.dps, pool),
    })
    runningMax[entry.roleBucket] = entry.dps
  }

  gold.sort((a, b) => new Date(b.achievedAt).getTime() - new Date(a.achievedAt).getTime())
  return gold
}

export async function fetchScopeLeaderboardEntryHistory(
  dungeonId: string,
  difficultyId: number,
): Promise<{ rows: Omit<MeterHallOfFameEntry, 'currentPercentile'>[]; error: string | null }> {
  const supabase = getMeterAnonSupabase()
  if (!supabase) return { rows: [], error: 'Supabase is not configured.' }

  const id = dungeonId.trim()
  if (!id || difficultyId < 2) return { rows: [], error: 'Select a dungeon and difficulty.' }

  const collected: Omit<MeterHallOfFameEntry, 'currentPercentile'>[] = []
  let offset = 0

  while (offset < HOF_SCAN_MAX_ROWS) {
    const to = offset + HOF_SCAN_PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('meter_leaderboard_entries')
      .select(
        'parse_id, created_at, role_bucket, player_key, display_name, dps, digimon_id, digimon_name, icon_id, portrait_url',
      )
      .eq('dungeon_id', id)
      .eq('difficulty_id', difficultyId)
      .order('created_at', { ascending: true })
      .range(offset, to)

    if (error) return { rows: [], error: error.message }
    const page = (data ?? []) as LeaderboardEntryRow[]
    if (!page.length) break

    for (const row of page) {
      const mapped = mapRow(row)
      if (mapped) collected.push(mapped)
    }

    if (page.length < HOF_SCAN_PAGE_SIZE) break
    offset += HOF_SCAN_PAGE_SIZE
  }

  const forNames: PlayerRankEntry[] = collected.map((e) => ({
    playerKey: e.playerKey,
    displayName: e.displayName,
    dps: e.dps,
    digimonId: e.digimonId,
    digimonName: e.digimonName,
    iconId: e.iconId,
    portraitUrl: e.portraitUrl,
  }))
  const resolved = await applyOfficialNamesToPlayerRankEntries(forNames).catch(() => forNames)

  const rows = collected.map((entry, i) => ({
    ...entry,
    displayName: resolved[i]!.displayName,
    digimonName: resolved[i]!.digimonName,
    iconId: resolved[i]!.iconId,
    portraitUrl: resolved[i]!.portraitUrl,
  }))

  return { rows, error: null }
}
