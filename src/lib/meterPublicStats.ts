import {
  dungeonFromPayload,
  isBrokenMeterPartyParse,
  isDungeonPartyParsePayload,
  isFailedDungeonParseRow,
  isLeaderboardEligibleDungeonParsePayload,
  memberDigimonBreakdowns,
  partyMembersFromPayload,
  sessionDurationFromPayload,
  type MeterPartyMemberStored,
} from './meterParsePayload'
import { dpsToPercentile, parseScoreColor } from './meterParseScoreColor'
import {
  digimonIdToBucket,
  memberDps,
  memberDpsInParse,
  memberPrimaryDigimonId,
  memberRoleBucket,
  memberTopDigimonUsed,
  METER_ROLE_BUCKETS,
  normalizePlayerKey,
  playerDisplayName,
  type MeterRoleBucket,
} from './meterRoleBuckets'

export { parseScoreColor, dpsToPercentile } from './meterParseScoreColor'

export type PublicMeterParseRow = {
  id: string
  created_at: string
  duration_sec: number
  payload: unknown
  app_version?: string | null
  total_damage?: number
  hit_count?: number
  parse_kind?: string | null
  dungeon_id?: string | null
  dungeon_name?: string | null
  difficulty?: string | null
  difficulty_id?: number | null
}

export type MeterParseListRow = PublicMeterParseRow & {
  app_version: string | null
  total_damage: number
  hit_count: number
}

/** Clears with valid party attribution — excludes failed, incomplete, and broken meter runs. */
export function leaderboardEligibleParses(rows: PublicMeterParseRow[]): PublicMeterParseRow[] {
  return rows.filter((r) => {
    if (isFailedDungeonParseRow(r)) return false
    if (!isLeaderboardEligibleDungeonParsePayload(r.payload)) return false
    const members = partyMembersFromPayload(r.payload)
    if (isBrokenMeterPartyParse(r.payload, members)) return false
    return true
  })
}

export type DigimonBarEntry = {
  digimonId: string
  digimonName: string
  iconId: string | null
  portraitUrl?: string
  dps: number
}

export type PlayerRankEntry = {
  playerKey: string
  displayName: string
  dps: number
  /** Top-DPS digimon from this player's best parse in the bucket. */
  digimonId: string
  digimonName: string
  iconId: string | null
  portraitUrl?: string
}

type PlayerRankBase = PlayerRankEntry

export type DigimonDpsSortMode = 'average' | 'best'

export type MeterPublicAggregates = {
  digimonByBucketAverage: Record<MeterRoleBucket, DigimonBarEntry[]>
  digimonByBucketBest: Record<MeterRoleBucket, DigimonBarEntry[]>
  playersByBucket: Record<MeterRoleBucket, PlayerRankBase[]>
  sortedDpsByBucket: Record<MeterRoleBucket, number[]>
}

const TOP_DIGIMON = 10
const TOP_PLAYERS = 100

function emptyBucketRecord<T>(): Record<MeterRoleBucket, T> {
  return {
    melee: [] as T,
    ranged: [] as T,
    caster: [] as T,
    hybrid: [] as T,
    tank: [] as T,
    healer: [] as T,
  }
}

type DigimonDpsAccum = {
  digimonId: string
  digimonName: string
  iconId: string | null
  portraitUrl?: string
  dpsSum: number
  dpsBestMax: number
  sampleCount: number
}

function topDigimonEntries(map: Map<string, DigimonDpsAccum>, mode: DigimonDpsSortMode): DigimonBarEntry[] {
  return [...map.values()]
    .map((a) => ({
      digimonId: a.digimonId,
      digimonName: a.digimonName,
      iconId: a.iconId,
      portraitUrl: a.portraitUrl,
      dps:
        mode === 'best'
          ? a.dpsBestMax
          : a.sampleCount > 0
            ? a.dpsSum / a.sampleCount
            : 0,
    }))
    .sort((a, b) => b.dps - a.dps)
    .slice(0, TOP_DIGIMON)
}

function topPlayerEntries(map: Map<string, PlayerRankBase>): PlayerRankBase[] {
  return [...map.values()].sort((a, b) => b.dps - a.dps).slice(0, TOP_PLAYERS)
}

export function aggregatePublicMeterStats(
  rows: PublicMeterParseRow[],
  digimonRoleById: Map<string, string>,
  dungeonId: string,
  difficultyId: number,
): MeterPublicAggregates {
  const digimonAvg = emptyBucketRecord<Map<string, DigimonDpsAccum>>()
  const playerBest = emptyBucketRecord<Map<string, PlayerRankBase>>()
  for (const b of METER_ROLE_BUCKETS) {
    digimonAvg[b] = new Map()
    playerBest[b] = new Map()
  }

  for (const row of rows) {
    if (isFailedDungeonParseRow(row)) continue
    if (row.dungeon_id !== dungeonId) continue
    if (row.difficulty_id !== difficultyId) continue
    if (!isDungeonPartyParsePayload(row.payload)) continue

    const members = partyMembersFromPayload(row.payload)
    if (isBrokenMeterPartyParse(row.payload, members)) continue

    const sessionDur = sessionDurationFromPayload(row.payload, row.duration_sec, members)

    for (const member of members) {
      const bucket = memberRoleBucket(member, digimonRoleById)
      if (!bucket) continue
      const primaryDigimonId = memberPrimaryDigimonId(member)
      const dps = memberDpsInParse(member, row.payload, row.duration_sec, members)
      const pKey = normalizePlayerKey(member)
      const prev = playerBest[bucket].get(pKey)
      if (!prev || dps > prev.dps) {
        const topDg = memberTopDigimonUsed(member)
        playerBest[bucket].set(pKey, {
          playerKey: pKey,
          displayName: playerDisplayName(member),
          dps,
          digimonId: topDg?.digimonId ?? '',
          digimonName: topDg?.digimonName ?? '',
          iconId: topDg?.iconId ?? null,
          portraitUrl: topDg?.portraitUrl,
        })
      }

      if (!primaryDigimonId) continue
      const memberDur = Math.max(member.durationSec, sessionDur, 1e-6)
      for (const dg of memberDigimonBreakdowns(member)) {
        if (dg.digimonId !== primaryDigimonId) continue
        const dBucket = digimonIdToBucket(dg.digimonId, digimonRoleById)
        if (!dBucket) continue
        const dDps = dg.totalDamage / memberDur
        const existing = digimonAvg[dBucket].get(dg.digimonId)
        if (!existing) {
          digimonAvg[dBucket].set(dg.digimonId, {
            digimonId: dg.digimonId,
            digimonName: dg.digimonName,
            iconId: dg.iconId,
            portraitUrl: dg.portraitUrl,
            dpsSum: dDps,
            dpsBestMax: dDps,
            sampleCount: 1,
          })
        } else {
          existing.dpsSum += dDps
          existing.dpsBestMax = Math.max(existing.dpsBestMax, dDps)
          existing.sampleCount += 1
          if (dg.digimonName.trim()) existing.digimonName = dg.digimonName
          if (dg.iconId) existing.iconId = dg.iconId
          if (dg.portraitUrl) existing.portraitUrl = dg.portraitUrl
        }
      }
    }
  }

  const digimonByBucketAverage = emptyBucketRecord<DigimonBarEntry[]>()
  const digimonByBucketBest = emptyBucketRecord<DigimonBarEntry[]>()
  const playersByBucket = emptyBucketRecord<PlayerRankBase[]>()
  const sortedDpsByBucket = emptyBucketRecord<number[]>()

  for (const b of METER_ROLE_BUCKETS) {
    digimonByBucketAverage[b] = topDigimonEntries(digimonAvg[b], 'average')
    digimonByBucketBest[b] = topDigimonEntries(digimonAvg[b], 'best')
    playersByBucket[b] = topPlayerEntries(playerBest[b])
    sortedDpsByBucket[b] = topPlayerEntries(playerBest[b])
      .map((p) => p.dps)
      .sort((a, c) => a - c)
  }

  return { digimonByBucketAverage, digimonByBucketBest, playersByBucket, sortedDpsByBucket }
}

export type DungeonOption = {
  dungeonId: string
  dungeonName: string
}

export type MeterParseSelection = {
  dungeonId: string
  difficultyId: number
}

function parseRowDungeonId(row: PublicMeterParseRow): string | null {
  const fromColumn = row.dungeon_id?.trim()
  if (fromColumn) return fromColumn
  return dungeonFromPayload(row.payload)?.dungeonId?.trim() ?? null
}

function parseRowDifficultyId(row: PublicMeterParseRow): number | null {
  const fromColumn = row.difficulty_id
  if (fromColumn != null && fromColumn >= 2) return fromColumn
  const fromPayload = dungeonFromPayload(row.payload)?.difficultyId
  if (fromPayload != null && fromPayload >= 2) return fromPayload
  return null
}

/** First eligible row in newest-first order (no extra Supabase query). */
export function mostRecentMeterParseSelection(
  rows: PublicMeterParseRow[],
  allowedDungeonIds: Iterable<string>,
): MeterParseSelection | null {
  const allowed = new Set(allowedDungeonIds)
  for (const row of rows) {
    const dungeonId = parseRowDungeonId(row)
    const difficultyId = parseRowDifficultyId(row)
    if (!dungeonId || !allowed.has(dungeonId)) continue
    if (difficultyId == null) continue
    return { dungeonId, difficultyId }
  }
  return null
}

export function dungeonOptionsFromRows(rows: PublicMeterParseRow[]): DungeonOption[] {
  const seen = new Map<string, string>()
  for (const r of leaderboardEligibleParses(rows)) {
    const id = r.dungeon_id?.trim()
    if (!id) continue
    const name =
      r.dungeon_name?.trim() ||
      (isDungeonPartyParsePayload(r.payload)
        ? r.payload.dungeon.dungeonName?.trim() || ''
        : '') ||
      id
    if (!seen.has(id)) seen.set(id, name)
  }
  return [...seen.entries()]
    .map(([dungeonId, dungeonName]) => ({ dungeonId, dungeonName }))
    .sort((a, b) => a.dungeonName.localeCompare(b.dungeonName))
}

export function memberNameColor(
  member: MeterPartyMemberStored,
  digimonRoleById: Map<string, string>,
  aggregates: MeterPublicAggregates | null,
  parseContext?: {
    payload: unknown
    rowDurationSec: number
    members: MeterPartyMemberStored[]
  },
): string | undefined {
  if (!aggregates) return undefined
  const bucket = memberRoleBucket(member, digimonRoleById)
  if (!bucket) return undefined
  const dps = parseContext
    ? memberDpsInParse(member, parseContext.payload, parseContext.rowDurationSec, parseContext.members)
    : memberDps(member)
  const pct = dpsToPercentile(dps, aggregates.sortedDpsByBucket[bucket] ?? [])
  return parseScoreColor(pct)
}
