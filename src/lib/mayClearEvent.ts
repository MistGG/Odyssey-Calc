import { METER_ROLE_BUCKET_LABELS, METER_ROLE_BUCKETS } from './meterRoleBuckets'

/** May 29–Jun 5 community clear event — update dungeon hints when the target instance changes. */
export const MAY_CLEAR_EVENT = {
  eventTitle: 'Dungeon Clear Challenge',
  eventDateLabel: 'Thursday, May 29 – June 5, 2026',
  eventDateIso: '2026-05-29',
  eventDateEndIso: '2026-06-05',
  difficultyLabel: 'Hard',
  /** Wiki `difficulty_id` for meter leaderboards (3 = Hard). */
  difficultyId: 3,
  prizeCrownsPerRole: 200,
  /** Meter theme shop points for each role winner (#1 Best DPS). */
  prizeShopPointsPerRole: 100,
} as const

export const EVENT_ANNOUNCEMENT_NOTE = 'A dungeon will be selected on May 29!'

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
