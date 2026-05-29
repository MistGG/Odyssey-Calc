import { METER_ROLE_BUCKET_LABELS, METER_ROLE_BUCKETS } from './meterRoleBuckets'

/**
 * May 29-Jun 5 community clear event.
 *
 * Before deploy: set `dungeonAnnounced` to true and `dungeonName` to the wiki dungeon title.
 * Update `dungeonId` only as a fallback if the wiki list fails to load.
 */
export const MAY_CLEAR_EVENT = {
  eventTitle: 'Dungeon Clear Challenge',
  eventDateLabel: 'May 29 - June 5, 2026',
  eventDateIso: '2026-05-29',
  /** Hard cutoff for uploads (9:00 PM June 5 Arizona = 04:00 UTC June 6). */
  eventDateEndIso: '2026-06-06T04:00:00.000Z',
  eventEndUtcLabel: 'June 6, 2026, 04:00 UTC',
  difficultyLabel: 'Hard',
  /** Wiki `difficulty_id` for meter leaderboards (3 = Hard). */
  difficultyId: 3,
  /** Set true once the in-game event dungeon is announced (May 29). */
  dungeonAnnounced: false,
  /** Primary dungeon selector (matched against wiki dungeon list). Used when announced. */
  dungeonName: 'Army of Steel',
  /** Fallback wiki id when the list is unavailable or the name changes. */
  dungeonId: 'u1tl0czg',
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

export const EVENT_ANNOUNCEMENT_NOTE = MAY_CLEAR_EVENT.dungeonAnnounced
  ? 'Featured dungeon may be updated before the event goes live.'
  : 'A dungeon will be selected on May 29!'

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
