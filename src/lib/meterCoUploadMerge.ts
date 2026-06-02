import {
  dungeonFromPayload,
  isBrokenMeterPartyParse,
  partyMembersFromPayload,
} from './meterParsePayload'
import type { MeterPartyMemberStored } from './meterParsePayload'
import {
  PARTY_UPLOAD_CLUSTER_MS,
  PARTY_UPLOAD_MIN_PLAYER_OVERLAP,
} from './meterHallOfFame'

/** Wider window for dropping bad dual-meter uploads (same party re-uploads minutes apart). */
export const CO_UPLOAD_SUPERSESSION_MS = 30 * 60 * 1000
import type { PublicMeterParseRow } from './meterPublicStats'
import { normalizePlayerKey } from './meterRoleBuckets'

function playerKeysFromParse(row: PublicMeterParseRow): Set<string> {
  const keys = new Set<string>()
  for (const member of partyMembersFromPayload(row.payload)) {
    const key = normalizePlayerKey(member)
    if (key) keys.add(key)
  }
  return keys
}

function playerOverlap(a: Set<string>, b: Set<string>): number {
  let n = 0
  for (const key of a) {
    if (b.has(key)) n += 1
  }
  return n
}

function parseScopeKey(row: PublicMeterParseRow): string | null {
  const dungeon = dungeonFromPayload(row.payload)
  const dungeonId = row.dungeon_id?.trim() || dungeon?.dungeonId?.trim() || ''
  const difficultyId = row.difficulty_id ?? dungeon?.difficultyId ?? 0
  if (!dungeonId || difficultyId < 2) return null
  return `${dungeonId}:${difficultyId}`
}

/** Group parse rows that are co-uploads of the same party clear (multi-meter parties). */
export function clusterCoUploadedParseRows(
  rows: PublicMeterParseRow[],
  windowMs: number = PARTY_UPLOAD_CLUSTER_MS,
): PublicMeterParseRow[][] {
  const sorted = [...rows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )

  const clusters: PublicMeterParseRow[][] = []
  for (const row of sorted) {
    if (!partyMembersFromPayload(row.payload).length) continue
    const scope = parseScopeKey(row)
    if (!scope) continue
    const time = new Date(row.created_at).getTime()
    const players = playerKeysFromParse(row)

    let merged = false
    for (const cluster of clusters) {
      const anchor = cluster[0]!
      if (parseScopeKey(anchor) !== scope) continue
      const anchorTime = new Date(anchor.created_at).getTime()
      if (time - anchorTime > windowMs) continue
      if (playerOverlap(players, playerKeysFromParse(anchor)) >= PARTY_UPLOAD_MIN_PLAYER_OVERLAP) {
        cluster.push(row)
        merged = true
        break
      }
    }
    if (!merged) clusters.push([row])
  }

  return clusters
}

type MemberPick = { member: MeterPartyMemberStored; row: PublicMeterParseRow; dps: number }

function memberDpsInRow(
  member: MeterPartyMemberStored,
  row: PublicMeterParseRow,
  members: MeterPartyMemberStored[],
): number {
  const dur = Math.max(
    row.duration_sec ?? 0,
    member.durationSec ?? 0,
    ...members.map((m) => m.durationSec ?? 0),
    1e-6,
  )
  return (member.totalDamage ?? 0) / dur
}

/**
 * Merge co-uploaded parses: each tamer's self row comes from their own upload when present;
 * other party members use the best non-zero DPS seen across the cluster.
 */
export function mergeCoUploadedParseCluster(cluster: PublicMeterParseRow[]): PublicMeterParseRow {
  if (cluster.length <= 1) return cluster[0]!

  const anchor = [...cluster].sort(
    (a, b) => partyMembersFromPayload(b.payload).length - partyMembersFromPayload(a.payload).length,
  )[0]!

  const bestByPlayer = new Map<string, MemberPick>()

  for (const row of cluster) {
    const members = partyMembersFromPayload(row.payload)
    for (const member of members) {
      const key = normalizePlayerKey(member)
      if (!key) continue
      const dps = memberDpsInRow(member, row, members)
      const selfAuthoritative = member.isSelf === true
      const prev = bestByPlayer.get(key)

      if (!prev) {
        bestByPlayer.set(key, { member, row, dps })
        continue
      }

      if (selfAuthoritative && !prev.member.isSelf) {
        bestByPlayer.set(key, { member, row, dps })
        continue
      }
      if (!selfAuthoritative && prev.member.isSelf) continue
      if (dps > prev.dps) bestByPlayer.set(key, { member, row, dps })
    }
  }

  const mergedMembers = [...bestByPlayer.values()]
    .map((pick) => pick.member)
    .filter((m) => (m.totalDamage ?? 0) > 0 || m.isSelf)

  const payload = anchor.payload
  if (!payload || typeof payload !== 'object') return anchor

  return {
    ...anchor,
    payload: {
      ...(payload as Record<string, unknown>),
      members: mergedMembers,
    },
  }
}

/** One representative parse per party clear when several tamers uploaded within the dedupe window. */
export function collapseCoUploadedParseRows(rows: PublicMeterParseRow[]): PublicMeterParseRow[] {
  return clusterCoUploadedParseRows(rows).map(mergeCoUploadedParseCluster)
}

export const DUAL_METER_INVALIDATE_REASON = 'dual_meter_superseded_v1'

function parseCompanionVersion(v: string | null | undefined): [number, number, number] | null {
  if (!v?.trim()) return null
  const m = v.trim().match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

/** Companion ≥0.1.69 includes the multi-meter attribution fix. */
export function isDualMeterFixedCompanionVersion(appVersion: string | null | undefined): boolean {
  const p = parseCompanionVersion(appVersion)
  if (!p) return false
  const [maj, min, patch] = p
  if (maj > 0) return true
  if (min > 1) return true
  return patch >= 69
}

function damagingMemberCount(row: PublicMeterParseRow): number {
  return partyMembersFromPayload(row.payload).filter((m) => (m.totalDamage ?? 0) > 0).length
}

function selfUploadStats(row: PublicMeterParseRow): {
  playerKey: string
  dps: number
} | null {
  const members = partyMembersFromPayload(row.payload)
  const self = members.find((m) => m.isSelf === true)
  if (!self) return null
  const playerKey = normalizePlayerKey(self)
  if (!playerKey) return null
  return { playerKey, dps: memberDpsInRow(self, row, members) }
}

/**
 * Co-uploads superseded by a fuller or more accurate sibling upload (dual-meter bug before 0.1.69).
 * Keeps the parse with the most complete party; drops thin uploads with missing peers or swapped self DPS.
 */
function markSupersededInClusters(
  clusters: PublicMeterParseRow[][],
  superseded: Set<string>,
): void {
  for (const cluster of clusters) {
    if (cluster.length <= 1) continue
    if (cluster.every((row) => isDualMeterFixedCompanionVersion(row.app_version))) continue

    const wouldDrop = new Set<string>()

    const stats = cluster.map((row) => ({
      id: row.id,
      memberCount: partyMembersFromPayload(row.payload).length,
      damagingCount: damagingMemberCount(row),
      self: selfUploadStats(row),
    }))

    const maxMembers = Math.max(...stats.map((s) => s.memberCount))
    const maxDamaging = Math.max(...stats.map((s) => s.damagingCount))

    for (const s of stats) {
      let drop = false

      if (s.memberCount < maxMembers && s.damagingCount <= maxDamaging) {
        drop = true
      }

      if (s.self && s.self.dps > 0) {
        for (const other of stats) {
          if (other.id === s.id || !other.self) continue
          if (other.self.playerKey === s.self.playerKey) continue
          const lo = Math.min(s.self.dps, other.self.dps)
          const hi = Math.max(s.self.dps, other.self.dps)
          if (hi > 0 && lo / hi >= 0.94) {
            if (s.memberCount < other.memberCount) drop = true
            if (s.memberCount === other.memberCount && s.damagingCount < other.damagingCount) {
              drop = true
            }
          }
        }
      }

      if (drop) wouldDrop.add(s.id)
    }

    const remaining = stats.filter((s) => !wouldDrop.has(s.id))
    if (remaining.length > 1) {
      const bestMembers = Math.max(...remaining.map((s) => s.memberCount))
      for (const s of remaining) {
        if (s.memberCount < bestMembers) wouldDrop.add(s.id)
      }
    }

    if (wouldDrop.size > 0) {
      for (const row of cluster) superseded.add(row.id)
    }
  }
}

export function supersededCoUploadParseIds(rows: PublicMeterParseRow[]): Set<string> {
  const superseded = new Set<string>()
  markSupersededInClusters(clusterCoUploadedParseRows(rows, CO_UPLOAD_SUPERSESSION_MS), superseded)
  return superseded
}

export function ineligibleLeaderboardParseIds(rows: PublicMeterParseRow[]): Set<string> {
  const drop = supersededCoUploadParseIds(rows)
  for (const row of rows) {
    const dungeon = dungeonFromPayload(row.payload)
    if (dungeon?.leaderboardEligible === false) drop.add(row.id)
    const members = partyMembersFromPayload(row.payload)
    if (members.length && isBrokenMeterPartyParse(row.payload, members)) drop.add(row.id)
  }
  return drop
}

export function filterLeaderboardHistoryByScopeParses<T extends { parseId: string }>(
  history: T[],
  scopeParses: PublicMeterParseRow[],
): T[] {
  const drop = ineligibleLeaderboardParseIds(scopeParses)
  if (!drop.size) return history
  return history.filter((entry) => !drop.has(entry.parseId))
}

export function excludeSupersededCoUploadParses(rows: PublicMeterParseRow[]): PublicMeterParseRow[] {
  const drop = supersededCoUploadParseIds(rows)
  if (!drop.size) return rows
  return rows.filter((row) => !drop.has(row.id))
}
