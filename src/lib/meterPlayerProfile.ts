import {
  dungeonFromPayload,
  isBrokenMeterPartyParse,
  isDungeonPartyParsePayload,
  isFailedDungeonParseRow,
  partyMembersFromPayload,
  type MeterPartyMemberStored,
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
import { dpsToPercentile } from './meterParseScoreColor'
import { fetchPrecomputedMeterLeaderboard } from './meterLeaderboardPrecomputed'
import type { PlayerLeaderboardEntryRow } from './meterDataSource'
import { difficultySelectOptions, dungeonSelectOptions } from './wikiDungeons'
import type { WikiDungeonListItem } from '../types/wikiApi'

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

export const METER_PROFILE_IDENTITY_NOTICE =
  'Please upload a parse through the meter to confirm your Tamer identity'

export type SignedInMeterIdentity = {
  playerKey: string
  displayName: string
  /** True when at least one upload marked the member as self. */
  confirmedFromUpload: boolean
}

export function selfTamerFromMember(member: MeterPartyMemberStored): SignedInMeterIdentity | null {
  if (!member.isSelf) return null
  const displayName = playerDisplayName(member)
  if (!displayName) return null
  return {
    playerKey: normalizePlayerKey(member),
    displayName,
    confirmedFromUpload: true,
  }
}

/** All distinct self tamers from the user's meter uploads, sorted by display name. */
export function resolveSignedInMeterIdentities(
  profileDisplayName: string | null | undefined,
  myParseRows: PublicMeterParseRow[],
): SignedInMeterIdentity[] {
  const byKey = new Map<string, SignedInMeterIdentity>()

  for (const row of myParseRows) {
    const members = partyMembersFromPayload(row.payload)
    for (const member of members) {
      const self = selfTamerFromMember(member)
      if (self && !byKey.has(self.playerKey)) {
        byKey.set(self.playerKey, self)
      }
    }
  }

  const fromUploads = [...byKey.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }),
  )
  if (fromUploads.length > 0) return fromUploads

  const fallbackName = profileDisplayName?.trim()
  if (!fallbackName) return []
  const key = fallbackName.toLowerCase()
  return [{ playerKey: key, displayName: fallbackName, confirmedFromUpload: false }]
}

/** First resolved identity (convenience). */
export function resolveSignedInMeterIdentity(
  profileDisplayName: string | null | undefined,
  myParseRows: PublicMeterParseRow[],
): SignedInMeterIdentity | null {
  return resolveSignedInMeterIdentities(profileDisplayName, myParseRows)[0] ?? null
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

/** Highest parse color (percentile) first, then raw DPS. */
export function sortPlayerBestParsesByParseScore(
  entries: PlayerBestParseEntry[],
  poolsByScope: Map<string, Record<MeterRoleBucket, number[]>>,
): PlayerBestParseEntry[] {
  return [...entries].sort((a, b) => {
    const pctA = dpsToPercentile(a.dps, leaderboardDpsPoolForBestEntry(poolsByScope, a))
    const pctB = dpsToPercentile(b.dps, leaderboardDpsPoolForBestEntry(poolsByScope, b))
    if (pctB !== pctA) return pctB - pctA
    if (b.dps !== a.dps) return b.dps - a.dps
    const byDungeon = a.dungeonName.localeCompare(b.dungeonName)
    if (byDungeon !== 0) return byDungeon
    if (a.difficultyId !== b.difficultyId) return a.difficultyId - b.difficultyId
    return a.roleLabel.localeCompare(b.roleLabel)
  })
}

export function displayNameFromLeaderboardEntries(
  entries: PlayerLeaderboardEntryRow[],
  playerKey: string,
): string {
  for (const entry of entries) {
    if (entry.displayName.trim()) return entry.displayName.trim()
  }
  return playerKey
}

export function buildPlayerBestParsesFromLeaderboardEntries(
  entries: PlayerLeaderboardEntryRow[],
  wikiDungeons: WikiDungeonListItem[],
): PlayerBestParseEntry[] {
  const best = new Map<string, PlayerBestParseEntry>()

  for (const entry of entries) {
    const scopeKey = `${entry.dungeonId}:${entry.difficultyId}:${entry.roleBucket}`
    const prev = best.get(scopeKey)
    if (prev && prev.dps >= entry.dps) continue

    const { dungeonName, difficultyLabel } = resolveProfileScopeLabels(
      entry.dungeonId,
      entry.difficultyId,
      wikiDungeons,
    )
    best.set(scopeKey, {
      dungeonId: entry.dungeonId,
      dungeonName,
      difficultyId: entry.difficultyId,
      difficultyLabel,
      roleBucket: entry.roleBucket,
      roleLabel: METER_ROLE_BUCKET_LABELS[entry.roleBucket],
      dps: entry.dps,
      digimonName: entry.digimonName,
      parseId: entry.parseId,
      createdAt: entry.createdAt,
    })
  }

  return [...best.values()]
}

function resolveProfileScopeLabels(
  dungeonId: string,
  difficultyId: number,
  wikiDungeons: WikiDungeonListItem[],
): { dungeonName: string; difficultyLabel: string } {
  const dungeonName =
    dungeonSelectOptions(wikiDungeons).find((d) => d.dungeonId === dungeonId)?.dungeonName ?? dungeonId
  const difficultyLabel =
    difficultySelectOptions(wikiDungeons, dungeonId).find((d) => d.difficultyId === difficultyId)?.label ??
    (difficultyId === 3 ? 'Hard' : difficultyId === 2 ? 'Normal' : String(difficultyId))
  return { dungeonName, difficultyLabel }
}

/** Leaderboard rows whose upload time falls in a cycle window (inclusive start, exclusive end). */
export function filterLeaderboardEntriesInCycleWindow(
  entries: PlayerLeaderboardEntryRow[],
  windowStart: string,
  windowEnd: string | null,
): PlayerLeaderboardEntryRow[] {
  const startMs = new Date(windowStart).getTime()
  const endMs = windowEnd ? new Date(windowEnd).getTime() : null
  if (!Number.isFinite(startMs)) return entries

  return entries.filter((entry) => {
    const at = new Date(entry.createdAt).getTime()
    if (!Number.isFinite(at)) return false
    if (at < startMs) return false
    if (endMs != null && Number.isFinite(endMs) && at >= endMs) return false
    return true
  })
}

/** Most frequently used digimon from precomputed leaderboard rows. */
export function buildPlayerFavoriteDigimonFromLeaderboardEntries(
  entries: PlayerLeaderboardEntryRow[],
): PlayerFavoriteDigimon | null {
  const tallies = new Map<
    string,
    PlayerFavoriteDigimon & { totalDps: number }
  >()

  for (const entry of entries) {
    const digimonId = entry.digimonId.trim()
    if (!digimonId) continue
    const prev = tallies.get(digimonId)
    if (!prev) {
      tallies.set(digimonId, {
        digimonId,
        digimonName: entry.digimonName,
        iconId: entry.iconId,
        portraitUrl: entry.portraitUrl,
        parseCount: 1,
        totalDps: entry.dps,
      })
    } else {
      prev.parseCount += 1
      prev.totalDps += entry.dps
      if (entry.digimonName.trim()) prev.digimonName = entry.digimonName
      if (entry.iconId) prev.iconId = entry.iconId
      if (entry.portraitUrl) prev.portraitUrl = entry.portraitUrl
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

export async function buildScopeLeaderboardDpsPoolsFromPrecomputed(
  bestEntries: PlayerBestParseEntry[],
  cycle?: {
    leaderboardCycleId: string
    windowStart: string
    windowEnd: string | null
  },
): Promise<Map<string, Record<MeterRoleBucket, number[]>>> {
  const pools = new Map<string, Record<MeterRoleBucket, number[]>>()
  const scopes: Array<{ dungeonId: string; difficultyId: number }> = []
  const seen = new Set<string>()

  for (const entry of bestEntries) {
    const scopeKey = `${entry.dungeonId}:${entry.difficultyId}`
    if (seen.has(scopeKey)) continue
    seen.add(scopeKey)
    scopes.push({ dungeonId: entry.dungeonId, difficultyId: entry.difficultyId })
  }

  await mapPool(scopes, 4, async (scope) => {
    const scopeKey = `${scope.dungeonId}:${scope.difficultyId}`
    const pre = await fetchPrecomputedMeterLeaderboard({
      ...scope,
      leaderboardCycleId: cycle?.leaderboardCycleId,
      windowStart: cycle?.windowStart,
      windowEnd: cycle?.windowEnd,
    })
    if (pre.stats) pools.set(scopeKey, pre.stats.sortedDpsByBucket)
  })

  return pools
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
      const dps = memberDpsInParse(member, row.payload, row.duration_sec, members, digimonRoleById)
      const scopeKey = `${dungeonId}:${difficultyId}:${bucket}`
      const prev = best.get(scopeKey)
      if (!prev || dps > prev.dps) {
        const topDg = memberTopDigimonUsed(member, digimonRoleById)
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

  return [...best.values()]
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
