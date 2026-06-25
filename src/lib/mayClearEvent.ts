import { METER_ROLE_BUCKET_LABELS, METER_ROLE_BUCKETS } from './meterRoleBuckets'

/**
 * Community clear event config.
 *
 * When delayed: keep `scheduleAnnounced: false` and date fields null / TBD labels.
 * To go live: set scheduleAnnounced true, fill in dates, set leaderboardsLive when Hard is in-game.
 */
export const MAY_CLEAR_EVENT = {
  eventTitle: 'Dungeon Clear Challenge',
  /** Shown in hero eyebrow / theme chrome. */
  eventThemeLabel: 'Dragon Emperor · Examon',
  /** False while dates are not finalized (event cannot end automatically). */
  scheduleAnnounced: true,
  eventDateLabel: 'June 26, 2026',
  /** Display label for the full upload window (start through cutoff). */
  eventWindowLabel: 'June 26 – July 3, 2026 UTC',
  /** UTC calendar day the upload window opens (YYYY-MM-DD), or null while TBD. */
  eventDateIso: '2026-06-26',
  /** Hard cutoff for uploads (ISO instant, exclusive), or null while TBD. */
  eventDateEndIso: '2026-07-04T00:00:00.000Z',
  eventEndUtcLabel: 'July 4, 2026 00:00 UTC',
  difficultyLabel: 'Hard',
  /** Wiki `difficulty_id` for meter leaderboards (3 = Hard). */
  difficultyId: 3,
  /** Show the selected dungeon on the event page. */
  dungeonAnnounced: true,
  /** Live leaderboards for the announced upload window. */
  leaderboardsLive: true,
  dungeonName: 'Dragon Dimension',
  /** Fallback wiki id when the list is unavailable or the name changes. */
  dungeonId: 'uc4j5ut',
  prizeCrownsPerRole: 500,
  /** Meter theme shop points for each role winner (#1 Best DPS). */
  prizeShopPointsPerRole: 100,
  /** Random participation draw: one winner per role (eligible uploads in that bucket). */
  participationPrizeCrownsPerRole: 250,
  /** Meter shop points for every player with at least one eligible event upload. */
  participationShopPointsAll: 25,
} as const

export type MayClearEventDungeon = {
  dungeonId: string
  dungeonName: string
}

export type MayClearEventWindow = {
  windowStart: string
  windowEnd: string
}

export function isMayClearEventScheduleAnnounced(): boolean {
  return (
    MAY_CLEAR_EVENT.scheduleAnnounced &&
    Boolean(MAY_CLEAR_EVENT.eventDateIso?.trim()) &&
    Boolean(MAY_CLEAR_EVENT.eventDateEndIso?.trim())
  )
}

/** Upload window for leaderboard filtering; null while schedule is TBD. */
export function mayClearEventWindow(): MayClearEventWindow | null {
  if (!isMayClearEventScheduleAnnounced()) return null
  return {
    windowStart: `${MAY_CLEAR_EVENT.eventDateIso}T00:00:00.000Z`,
    windowEnd: MAY_CLEAR_EVENT.eventDateEndIso!,
  }
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

/** Live event leaderboards require Hard to be live and leaderboards enabled (or dev / preview). */
export function shouldShowMayClearEventLeaderboards(
  dungeon: MayClearEventDungeon | null,
  options?: { previewLeaderboards?: boolean },
): dungeon is MayClearEventDungeon {
  const show =
    MAY_CLEAR_EVENT.leaderboardsLive ||
    options?.previewLeaderboards === true ||
    import.meta.env.DEV
  return show && isMayClearEventDungeonAnnounced() && dungeon != null
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
  'Event schedule is announced. Uploads outside the posted UTC window do not count toward prizes.'

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

/** Bundled event teaser (sync via `npm run sync:event-examon-teaser`). */
export const EVENT_TEASER_IMAGE_PATH = '/event/examon-teaser.jpg'

/** Google Photos share link for re-syncing the teaser asset. */
export const EVENT_TEASER_GOOGLE_PHOTOS_URL =
  'https://photos.app.goo.gl/qoJ27xMNBFDvxUR46'

/** @deprecated Use EVENT_TEASER_IMAGE_PATH */
export const EVENT_TEASER_IMAGE_URL = EVENT_TEASER_IMAGE_PATH

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
  prizeShopPoints: MAY_CLEAR_EVENT.participationShopPointsAll,
}))

export const MAY_CLEAR_PARTICIPATION_TOTAL_CROWNS =
  MAY_CLEAR_EVENT.participationPrizeCrownsPerRole * MAY_CLEAR_PARTICIPATION_ROLES.length
