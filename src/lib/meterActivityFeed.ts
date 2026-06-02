import {
  dungeonFromPayload,
  partyMembersFromPayload,
} from './meterParsePayload'
import { collapseCoUploadedParseRows, excludeSupersededCoUploadParses } from './meterCoUploadMerge'
import { dpsToPercentile } from './meterParseScoreColor'
import type { MeterPublicAggregates, PublicMeterParseRow } from './meterPublicStats'
import { meterScopeKey } from './meterParseCache'
import {
  memberDpsInParse,
  memberRoleBucket,
  memberTopDigimonUsed,
  METER_ROLE_BUCKET_LABELS,
  normalizePlayerKey,
  playerDisplayName,
  type MeterRoleBucket,
} from './meterRoleBuckets'

export const METER_ACTIVITY_FEED_LIMIT = 40

export type MeterActivityFeedMember = {
  playerKey: string
  tamerName: string
  roleBucket: MeterRoleBucket
  roleLabel: string
  dps: number
  digimonId: string
  digimonName: string
  iconId: string | null
  portraitUrl?: string
}

export type MeterActivityFeedItem = {
  parseId: string
  createdAt: string
  dungeonId: string
  dungeonName: string
  difficultyId: number
  difficultyLabel: string
  durationSec: number
  partySize: number
  members: MeterActivityFeedMember[]
}

export function formatActivityTimeAgo(iso: string, nowMs = Date.now()): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const sec = Math.max(0, Math.floor((nowMs - then) / 1000))
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function difficultyLabelFromRow(row: PublicMeterParseRow): string {
  const dungeon = dungeonFromPayload(row.payload)
  const fromRow = row.difficulty?.trim() || dungeon?.difficulty?.trim()
  if (fromRow) return fromRow
  const id = row.difficulty_id ?? dungeon?.difficultyId
  if (id === 3) return 'Hard'
  if (id === 2) return 'Normal'
  return ''
}

export function buildMeterActivityFeedItems(
  rows: PublicMeterParseRow[],
  digimonRoleById: Map<string, string>,
): MeterActivityFeedItem[] {
  const items: MeterActivityFeedItem[] = []
  const mergedRows = collapseCoUploadedParseRows(excludeSupersededCoUploadParses(rows))

  for (const row of mergedRows) {
    const members = partyMembersFromPayload(row.payload)
    if (!members.length) continue

    const dungeon = dungeonFromPayload(row.payload)
    const dungeonId = row.dungeon_id?.trim() || dungeon?.dungeonId?.trim() || ''
    const difficultyId = row.difficulty_id ?? dungeon?.difficultyId ?? 0
    if (!dungeonId || difficultyId < 2) continue

    const durationSec = row.duration_sec ?? 0
    const feedMembers: MeterActivityFeedMember[] = []

    for (const member of members) {
      const topDigimon = memberTopDigimonUsed(member)
      const digimonId = topDigimon?.digimonId ?? member.currentDigimonId?.trim() ?? ''
      const roleBucket = memberRoleBucket(member, digimonRoleById)
      const tamerName =
        member.tamerName?.trim() ||
        member.memberKey?.trim() ||
        playerDisplayName(member)
      feedMembers.push({
        playerKey: normalizePlayerKey(member),
        tamerName,
        roleBucket: roleBucket ?? 'melee',
        roleLabel: roleBucket ? METER_ROLE_BUCKET_LABELS[roleBucket] : '—',
        dps: memberDpsInParse(member, row.payload, durationSec, members),
        digimonId,
        digimonName: topDigimon?.digimonName ?? member.currentDigimonName?.trim() ?? 'Unknown',
        iconId: topDigimon?.iconId ?? member.portraitIconId ?? null,
        portraitUrl: topDigimon?.portraitUrl ?? member.portraitUrl,
      })
    }

    feedMembers.sort((a, b) => b.dps - a.dps)

    items.push({
      parseId: row.id,
      createdAt: row.created_at,
      dungeonId,
      dungeonName: row.dungeon_name?.trim() || dungeon?.dungeonName?.trim() || dungeonId,
      difficultyId,
      difficultyLabel: difficultyLabelFromRow(row),
      durationSec,
      partySize: feedMembers.length,
      members: feedMembers,
    })
  }

  return items
}

export function uniqueActivityFeedScopes(items: MeterActivityFeedItem[]): Array<{
  dungeonId: string
  difficultyId: number
}> {
  const seen = new Set<string>()
  const scopes: Array<{ dungeonId: string; difficultyId: number }> = []
  for (const item of items) {
    const key = meterScopeKey(item.dungeonId, item.difficultyId)
    if (seen.has(key)) continue
    seen.add(key)
    scopes.push({ dungeonId: item.dungeonId, difficultyId: item.difficultyId })
  }
  return scopes
}

export type ActivityFeedScopePools = Map<string, Record<MeterRoleBucket, number[]>>

export function scopePoolsFromPrecomputedStats(
  scopes: Array<{ dungeonId: string; difficultyId: number }>,
  statsByScope: Map<string, MeterPublicAggregates | null>,
): ActivityFeedScopePools {
  const pools: ActivityFeedScopePools = new Map()
  for (const scope of scopes) {
    const key = meterScopeKey(scope.dungeonId, scope.difficultyId)
    const stats = statsByScope.get(key)
    if (stats) pools.set(key, stats.sortedDpsByBucket)
  }
  return pools
}

export function memberParsePercentile(
  member: MeterActivityFeedMember,
  item: MeterActivityFeedItem,
  poolsByScope: ActivityFeedScopePools,
): number | null {
  if (member.roleLabel === '—') return null
  const pool = poolsByScope.get(meterScopeKey(item.dungeonId, item.difficultyId))?.[member.roleBucket]
  if (!pool?.length) return null
  return dpsToPercentile(member.dps, pool)
}
