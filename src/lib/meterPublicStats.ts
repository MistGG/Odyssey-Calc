import {
  isDungeonPartyParsePayload,
  isFailedDungeonParseRow,
  memberDigimonBreakdowns,
  partyMembersFromPayload,
  sessionDurationFromPayload,
  type MeterPartyMemberStored,
} from './meterParsePayload'
import { dpsToPercentile, parseScoreColor } from './meterParseScoreColor'
import {
  digimonIdToBucket,
  memberDps,
  memberRoleBucket,
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

/** Clears only — excludes failed runs (My Parses may still list those for display). */
export function leaderboardEligibleParses(rows: PublicMeterParseRow[]): PublicMeterParseRow[] {
  return rows.filter((r) => !isFailedDungeonParseRow(r))
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
}

type PlayerRankBase = PlayerRankEntry

export type MeterPublicAggregates = {
  digimonByBucket: Record<MeterRoleBucket, DigimonBarEntry[]>
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

function topDigimonEntries(map: Map<string, DigimonBarEntry>): DigimonBarEntry[] {
  return [...map.values()].sort((a, b) => b.dps - a.dps).slice(0, TOP_DIGIMON)
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
  const digimonMax = emptyBucketRecord<Map<string, DigimonBarEntry>>()
  const playerBest = emptyBucketRecord<Map<string, PlayerRankBase>>()
  for (const b of METER_ROLE_BUCKETS) {
    digimonMax[b] = new Map()
    playerBest[b] = new Map()
  }

  for (const row of rows) {
    if (isFailedDungeonParseRow(row)) continue
    if (row.dungeon_id !== dungeonId) continue
    if (row.difficulty_id !== difficultyId) continue
    if (!isDungeonPartyParsePayload(row.payload)) continue

    const members = partyMembersFromPayload(row.payload)
    const sessionDur = sessionDurationFromPayload(row.payload, row.duration_sec, members)

    for (const member of members) {
      const bucket = memberRoleBucket(member, digimonRoleById)
      if (!bucket) continue
      const dps = memberDps(member)
      const pKey = normalizePlayerKey(member)
      const prev = playerBest[bucket].get(pKey)
      if (!prev || dps > prev.dps) {
        playerBest[bucket].set(pKey, {
          playerKey: pKey,
          displayName: playerDisplayName(member),
          dps,
        })
      }

      const memberDur = Math.max(member.durationSec, sessionDur, 1e-6)
      for (const dg of memberDigimonBreakdowns(member)) {
        const dBucket = digimonIdToBucket(dg.digimonId, digimonRoleById)
        if (!dBucket) continue
        const dDps = dg.totalDamage / memberDur
        const existing = digimonMax[dBucket].get(dg.digimonId)
        if (!existing || dDps > existing.dps) {
          digimonMax[dBucket].set(dg.digimonId, {
            digimonId: dg.digimonId,
            digimonName: dg.digimonName,
            iconId: dg.iconId,
            portraitUrl: dg.portraitUrl,
            dps: dDps,
          })
        }
      }
    }
  }

  const digimonByBucket = emptyBucketRecord<DigimonBarEntry[]>()
  const playersByBucket = emptyBucketRecord<PlayerRankBase[]>()
  const sortedDpsByBucket = emptyBucketRecord<number[]>()

  for (const b of METER_ROLE_BUCKETS) {
    digimonByBucket[b] = topDigimonEntries(digimonMax[b])
    playersByBucket[b] = topPlayerEntries(playerBest[b])
    sortedDpsByBucket[b] = topPlayerEntries(playerBest[b])
      .map((p) => p.dps)
      .sort((a, c) => a - c)
  }

  return { digimonByBucket, playersByBucket, sortedDpsByBucket }
}

export type DungeonOption = {
  dungeonId: string
  dungeonName: string
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
): string | undefined {
  if (!aggregates) return undefined
  const bucket = memberRoleBucket(member, digimonRoleById)
  if (!bucket) return undefined
  const dps = memberDps(member)
  const sortedDesc = [...aggregates.sortedDpsByBucket[bucket]].sort((a, c) => c - a)
  const pct = dpsToPercentile(dps, sortedDesc)
  return parseScoreColor(pct)
}
