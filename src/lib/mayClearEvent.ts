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
  /** One-time meter theme shop points for a valid event parse upload. */
  prizeShopPoints: 100,
} as const

export const EVENT_ANNOUNCEMENT_NOTE = 'A dungeon will be selected on May 29!'

/** Event page announcement image (forum teaser section). */
export const EVENT_TEASER_IMAGE_URL = 'https://i.imgur.com/5ZCqkPy.png'

export const MAY_CLEAR_EVENT_ROLES = METER_ROLE_BUCKETS.map((id) => ({
  id,
  label: METER_ROLE_BUCKET_LABELS[id],
  prize: MAY_CLEAR_EVENT.prizeCrownsPerRole,
}))

export const MAY_CLEAR_TOTAL_CROWNS =
  MAY_CLEAR_EVENT.prizeCrownsPerRole * MAY_CLEAR_EVENT_ROLES.length
