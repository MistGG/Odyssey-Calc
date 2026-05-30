import { METER_ROLE_BUCKET_LABELS, METER_ROLE_BUCKETS } from './meterRoleBuckets'

/**
 * Community clear event config.
 *
 * Set `leaderboardsLive` to true once Hard is available in-game and uploads should rank.
 */
export const MAY_CLEAR_EVENT = {
  eventTitle: 'Dungeon Clear Challenge',
  eventDateLabel: 'June 4 - June 11, 2026',
  eventDateIso: '2026-06-04',
  /** Hard cutoff for uploads: June 11, 2026, 04:00 UTC. */
  eventDateEndIso: '2026-06-11T04:00:00.000Z',
  eventEndUtcLabel: 'June 11, 2026, 04:00 UTC',
  difficultyLabel: 'Hard',
  /** Wiki `difficulty_id` for meter leaderboards (3 = Hard). */
  difficultyId: 3,
  /** Show the selected dungeon on the event page. */
  dungeonAnnounced: true,
  /** Live leaderboards off until Hard is live in-game. */
  leaderboardsLive: false,
  dungeonName: 'Dragon Dimension',
  /** Fallback wiki id when the list is unavailable or the name changes. */
  dungeonId: 'uc4j5ut',
  prizeCrownsPerRole: 200,
  /** Meter theme shop points for each role winner (#1 Best DPS). */
  prizeShopPointsPerRole: 100,
  /** Random participation draw: one winner per role (eligible uploads in that bucket). */
  participationPrizeCrownsPerRole: 50,
  /** Meter shop points for every player with at least one eligible event upload. */
  participationShopPointsAll: 25,
} as const

export type MayClearEventDungeon = {
  dungeonId: string
  dungeonName: string
}

export function isMayClearEventDungeonAnnounced(): boolean {
  return MAY_CLEAR_EVENT.dungeonAnnounced
}

export function areMayClearEventLeaderboardsLive(): boolean {
  return MAY_CLEAR_EVENT.leaderboardsLive
}

export function mayClearEventDungeonFallback(): MayClearEventDungeon | null {
  if (!MAY_CLEAR_EVENT.dungeonAnnounced) return null
  return {
    dungeonId: MAY_CLEAR_EVENT.dungeonId,
    dungeonName: MAY_CLEAR_EVENT.dungeonName,
  }
}

/** Live event leaderboards require Hard to be live and leaderboards enabled. */
export function shouldShowMayClearEventLeaderboards(
  dungeon: MayClearEventDungeon | null,
): dungeon is MayClearEventDungeon {
  return (
    MAY_CLEAR_EVENT.leaderboardsLive &&
    isMayClearEventDungeonAnnounced() &&
    dungeon != null
  )
}

/** Resolve event dungeon from wiki list by name; null until announced. */
export function resolveMayClearEventDungeon(
  wikiDungeons: { id: string; name: string }[],
): MayClearEventDungeon | null {
  if (!MAY_CLEAR_EVENT.dungeonAnnounced) return null
  const want = MAY_CLEAR_EVENT.dungeonName.trim().toLowerCase()
  const hit = wikiDungeons.find((d) => d.name.trim().toLowerCase() === want)
  if (hit) {
    return { dungeonId: hit.id, dungeonName: hit.name }
  }
  return {
    dungeonId: MAY_CLEAR_EVENT.dungeonId,
    dungeonName: MAY_CLEAR_EVENT.dungeonName,
  }
}

export const EVENT_DELAY_NOTICE =
  'Event delayed to June 4. Dragon Dimension Hard is not live in-game yet. Live leaderboards and ranked uploads open once Hard is available.'

export const EVENT_ANNOUNCEMENT_NOTE = MAY_CLEAR_EVENT.leaderboardsLive
  ? 'Live leaderboards update from valid Hard party uploads.'
  : EVENT_DELAY_NOTICE

export function mayClearEventMeterNavState(dungeonId?: string): {
  dungeonId?: string
  difficultyId: number
} {
  if (!MAY_CLEAR_EVENT.dungeonAnnounced) {
    return { difficultyId: MAY_CLEAR_EVENT.difficultyId }
  }
  return {
    dungeonId: dungeonId?.trim() || MAY_CLEAR_EVENT.dungeonId,
    difficultyId: MAY_CLEAR_EVENT.difficultyId,
  }
}

/** Event page announcement image (forum teaser section). */
export const EVENT_TEASER_IMAGE_URL = 'https://i.imgur.com/5ZCqkPy.png'

export const MAY_CLEAR_EVENT_ROLES = METER_ROLE_BUCKETS.map((id) => ({
  id,
  label: METER_ROLE_BUCKET_LABELS[id],
  prizeCrowns: MAY_CLEAR_EVENT.prizeCrownsPerRole,
  prizeShopPoints: MAY_CLEAR_EVENT.prizeShopPointsPerRole,
}))

export const MAY_CLEAR_TOTAL_CROWNS =
  MAY_CLEAR_EVENT.prizeCrownsPerRole * MAY_CLEAR_EVENT_ROLES.length

export const MAY_CLEAR_TOTAL_SHOP_POINTS =
  MAY_CLEAR_EVENT.prizeShopPointsPerRole * MAY_CLEAR_EVENT_ROLES.length

export const MAY_CLEAR_PARTICIPATION_ROLES = METER_ROLE_BUCKETS.map((id) => ({
  id,
  label: METER_ROLE_BUCKET_LABELS[id],
  prizeCrowns: MAY_CLEAR_EVENT.participationPrizeCrownsPerRole,
}))

export const MAY_CLEAR_PARTICIPATION_TOTAL_CROWNS =
  MAY_CLEAR_EVENT.participationPrizeCrownsPerRole * MAY_CLEAR_PARTICIPATION_ROLES.length
