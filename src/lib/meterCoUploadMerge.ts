import {
  dungeonFromPayload,
  isBrokenMeterPartyParse,
  partyMembersFromPayload,
} from './meterParsePayload'
import type { PublicMeterParseRow } from './meterPublicStats'

/**
 * @deprecated Peer meters of one clear are unique instances; clustering is unused.
 * Kept for scripts that still inspect historical dual-meter windows.
 */
export const CO_UPLOAD_SUPERSESSION_MS = 30 * 60 * 1000

export const DUAL_METER_INVALIDATE_REASON = 'dual_meter_superseded_v1'

/** @deprecated No longer groups peer uploads — each parse is its own instance. */
export function clusterCoUploadedParseRows(
  rows: PublicMeterParseRow[],
  _windowMs?: number,
): PublicMeterParseRow[][] {
  return rows
    .filter((row) => partyMembersFromPayload(row.payload).length > 0)
    .map((row) => [row])
}

/**
 * @deprecated Peer kit stitching removed. Returns rows unchanged (newest first).
 */
export function mergeCoUploadedParseCluster(cluster: PublicMeterParseRow[]): PublicMeterParseRow {
  return cluster[0]!
}

/** Each upload is a unique instance — do not stitch peer meters of one clear. */
export function collapseCoUploadedParseRows(rows: PublicMeterParseRow[]): PublicMeterParseRow[] {
  return [...rows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
}

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

/**
 * Cross-player co-upload supersession disabled. Historical dual-meter cleanup stays
 * in `scripts/invalidate-dual-meter-uploads.mjs`.
 */
export function supersededCoUploadParseIds(_rows: PublicMeterParseRow[]): Set<string> {
  return new Set()
}

export function ineligibleLeaderboardParseIds(rows: PublicMeterParseRow[]): Set<string> {
  const drop = new Set<string>()
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
  return rows
}
