import { dungeonFromPayload, partyMembersFromPayload } from './meterParsePayload'
import type { MeterPartyMemberStored } from './meterParsePayload'
import {
  PARTY_UPLOAD_CLUSTER_MS,
  PARTY_UPLOAD_MIN_PLAYER_OVERLAP,
} from './meterHallOfFame'
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
export function clusterCoUploadedParseRows(rows: PublicMeterParseRow[]): PublicMeterParseRow[][] {
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
      if (time - anchorTime > PARTY_UPLOAD_CLUSTER_MS) continue
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
