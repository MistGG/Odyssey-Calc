import {
  dungeonFromPayload,
  isBrokenMeterPartyParse,
  isDungeonPartyParsePayload,
  isFailedDungeonParseRow,
  partyMembersFromPayload,
} from './meterParsePayload'
import {
  memberDpsInParse,
  memberRoleBucket,
  memberTopDigimonUsed,
  normalizePlayerKey,
  playerDisplayName,
  METER_ROLE_BUCKET_LABELS,
  type MeterRoleBucket,
} from './meterRoleBuckets'
import { aggregatePublicMeterStats, type PublicMeterParseRow } from './meterPublicStats'

export function meterPlayerProfilePath(playerKey: string): string {
  return `/meter/player/${encodeURIComponent(playerKey.trim().toLowerCase())}`
}

export function normalizeRoutePlayerKey(raw: string): string {
  try {
    return decodeURIComponent(raw).trim().toLowerCase()
  } catch {
    return raw.trim().toLowerCase()
  }
}

export function parseRowIncludesPlayer(row: PublicMeterParseRow, playerKey: string): boolean {
  if (!isDungeonPartyParsePayload(row.payload)) return false
  const members = partyMembersFromPayload(row.payload)
  return members.some((m) => normalizePlayerKey(m) === playerKey)
}

export function filterParsesForPlayer(rows: PublicMeterParseRow[], playerKey: string): PublicMeterParseRow[] {
  return rows.filter((r) => parseRowIncludesPlayer(r, playerKey))
}

export function displayNameForPlayerKey(rows: PublicMeterParseRow[], playerKey: string): string {
  for (const row of rows) {
    const members = partyMembersFromPayload(row.payload)
    for (const member of members) {
      if (normalizePlayerKey(member) === playerKey) return playerDisplayName(member)
    }
  }
  return playerKey
}

export function mergeParseRowsById(chunks: PublicMeterParseRow[][]): PublicMeterParseRow[] {
  const byId = new Map<string, PublicMeterParseRow>()
  for (const chunk of chunks) {
    for (const row of chunk) {
      if (!byId.has(row.id)) byId.set(row.id, row)
    }
  }
  return [...byId.values()]
}

export type PlayerBestParseEntry = {
  dungeonId: string
  dungeonName: string
  difficultyId: number
  difficultyLabel: string
  roleBucket: MeterRoleBucket
  roleLabel: string
  dps: number
  digimonName: string
  parseId: string
  createdAt: string
}

export function buildScopeLeaderboardDpsPools(
  rows: PublicMeterParseRow[],
  digimonRoleById: Map<string, string>,
  bestEntries: PlayerBestParseEntry[],
): Map<string, Record<MeterRoleBucket, number[]>> {
  const pools = new Map<string, Record<MeterRoleBucket, number[]>>()
  const seen = new Set<string>()

  for (const entry of bestEntries) {
    const scopeKey = `${entry.dungeonId}:${entry.difficultyId}`
    if (seen.has(scopeKey)) continue
    seen.add(scopeKey)
    const agg = aggregatePublicMeterStats(
      rows,
      digimonRoleById,
      entry.dungeonId,
      entry.difficultyId,
    )
    pools.set(scopeKey, agg.sortedDpsByBucket)
  }

  return pools
}

export function leaderboardDpsPoolForBestEntry(
  poolsByScope: Map<string, Record<MeterRoleBucket, number[]>>,
  entry: PlayerBestParseEntry,
): number[] {
  return poolsByScope.get(`${entry.dungeonId}:${entry.difficultyId}`)?.[entry.roleBucket] ?? []
}

export function buildPlayerBestParses(
  rows: PublicMeterParseRow[],
  playerKey: string,
  digimonRoleById: Map<string, string>,
): PlayerBestParseEntry[] {
  const best = new Map<string, PlayerBestParseEntry>()

  for (const row of rows) {
    if (isFailedDungeonParseRow(row)) continue
    if (!isDungeonPartyParsePayload(row.payload)) continue
    const members = partyMembersFromPayload(row.payload)
    if (isBrokenMeterPartyParse(row.payload, members)) continue

    const dungeonMeta = dungeonFromPayload(row.payload)
    const dungeonId = row.dungeon_id?.trim() || dungeonMeta?.dungeonId?.trim() || ''
    const difficultyId = row.difficulty_id ?? dungeonMeta?.difficultyId
    if (!dungeonId || difficultyId == null || difficultyId < 2) continue

    const dungeonName =
      row.dungeon_name?.trim() || dungeonMeta?.dungeonName?.trim() || dungeonId
    const difficultyLabel =
      row.difficulty?.trim() ||
      dungeonMeta?.difficulty?.trim() ||
      (difficultyId === 3 ? 'Hard' : difficultyId === 2 ? 'Normal' : String(difficultyId))

    for (const member of members) {
      if (normalizePlayerKey(member) !== playerKey) continue
      const bucket = memberRoleBucket(member, digimonRoleById)
      if (!bucket) continue
      const dps = memberDpsInParse(member, row.payload, row.duration_sec, members)
      const scopeKey = `${dungeonId}:${difficultyId}:${bucket}`
      const prev = best.get(scopeKey)
      if (!prev || dps > prev.dps) {
        const topDg = memberTopDigimonUsed(member)
        best.set(scopeKey, {
          dungeonId,
          dungeonName,
          difficultyId,
          difficultyLabel,
          roleBucket: bucket,
          roleLabel: METER_ROLE_BUCKET_LABELS[bucket],
          dps,
          digimonName: topDg?.digimonName?.trim() || '',
          parseId: row.id,
          createdAt: row.created_at,
        })
      }
    }
  }

  return [...best.values()].sort((a, b) => {
    const byDungeon = a.dungeonName.localeCompare(b.dungeonName)
    if (byDungeon !== 0) return byDungeon
    if (a.difficultyId !== b.difficultyId) return a.difficultyId - b.difficultyId
    return a.roleLabel.localeCompare(b.roleLabel)
  })
}

export type PlayerFavoriteDigimon = {
  digimonId: string
  digimonName: string
  iconId: string | null
  portraitUrl?: string
  /** Parses where this was their top-DPS digimon. */
  parseCount: number
}

/** Most frequently used top-DPS digimon across public parses (tie-break: higher total DPS). */
export function buildPlayerFavoriteDigimon(
  rows: PublicMeterParseRow[],
  playerKey: string,
): PlayerFavoriteDigimon | null {
  const tallies = new Map<
    string,
    PlayerFavoriteDigimon & { totalDps: number }
  >()

  for (const row of rows) {
    if (isFailedDungeonParseRow(row)) continue
    if (!isDungeonPartyParsePayload(row.payload)) continue
    const members = partyMembersFromPayload(row.payload)
    if (isBrokenMeterPartyParse(row.payload, members)) continue

    for (const member of members) {
      if (normalizePlayerKey(member) !== playerKey) continue
      const top = memberTopDigimonUsed(member)
      if (!top?.digimonId) continue
      const dps = memberDpsInParse(member, row.payload, row.duration_sec, members)
      const prev = tallies.get(top.digimonId)
      if (!prev) {
        tallies.set(top.digimonId, {
          digimonId: top.digimonId,
          digimonName: top.digimonName,
          iconId: top.iconId,
          portraitUrl: top.portraitUrl,
          parseCount: 1,
          totalDps: dps,
        })
      } else {
        prev.parseCount += 1
        prev.totalDps += dps
        if (top.digimonName.trim()) prev.digimonName = top.digimonName
        if (top.iconId) prev.iconId = top.iconId
        if (top.portraitUrl) prev.portraitUrl = top.portraitUrl
      }
    }
  }

  let best: (PlayerFavoriteDigimon & { totalDps: number }) | null = null
  for (const entry of tallies.values()) {
    if (
      !best ||
      entry.parseCount > best.parseCount ||
      (entry.parseCount === best.parseCount && entry.totalDps > best.totalDps)
    ) {
      best = entry
    }
  }

  if (!best) return null
  const { totalDps: _omit, ...favorite } = best
  return favorite
}

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return []
  const results = new Array<R>(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await fn(items[index]!, index)
    }
  }

  const workers = Math.min(Math.max(1, concurrency), items.length)
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return results
}
