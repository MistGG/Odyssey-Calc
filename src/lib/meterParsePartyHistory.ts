import {
  isBrokenMeterPartyParse,
  isMemberLeaderboardEligible,
  partyMembersFromPayload,
} from './meterParsePayload'
import type { SummaryLeaderboardEntry } from './meterLeaderboardSummary'
import { leaderboardEligibleParses, type PublicMeterParseRow } from './meterPublicStats'
import {
  memberDpsInParse,
  memberRoleBucket,
  memberTopDigimonUsed,
  METER_ROLE_BUCKET_LABELS,
  normalizePlayerKey,
  playerDisplayName,
} from './meterRoleBuckets'

/** Per-member rows from stored parse payloads (same eligibility as public leaderboard fallback). */
export function buildLeaderboardHistoryFromPublicParses(
  rows: PublicMeterParseRow[],
  digimonRoleById: Map<string, string>,
  dungeonId: string,
  difficultyId: number,
): SummaryLeaderboardEntry[] {
  const id = dungeonId.trim()
  const scoped = leaderboardEligibleParses(rows).filter(
    (row) => row.dungeon_id === id && row.difficulty_id === difficultyId,
  )
  const chronological = [...scoped].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )

  const out: SummaryLeaderboardEntry[] = []
  for (const row of chronological) {
    const members = partyMembersFromPayload(row.payload)
    if (isBrokenMeterPartyParse(row.payload, members)) continue

    for (const member of members) {
      if (!isMemberLeaderboardEligible(member, row.payload, row.duration_sec, members)) continue
      const roleBucket = memberRoleBucket(member, digimonRoleById)
      if (!roleBucket) continue
      const dps = memberDpsInParse(member, row.payload, row.duration_sec, members)
      if (dps <= 0) continue
      const topDg = memberTopDigimonUsed(member)
      out.push({
        roleBucket,
        roleLabel: METER_ROLE_BUCKET_LABELS[roleBucket],
        parseId: row.id,
        achievedAt: row.created_at,
        playerKey: normalizePlayerKey(member),
        displayName: playerDisplayName(member),
        dps,
        digimonId: topDg?.digimonId ?? '',
        digimonName: topDg?.digimonName ?? '',
        iconId: topDg?.iconId ?? null,
        portraitUrl: topDg?.portraitUrl,
      })
    }
  }
  return out
}
