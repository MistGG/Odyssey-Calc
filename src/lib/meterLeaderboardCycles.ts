/**
 * Leaderboard ranking cycles vs HoF seasons.
 *
 * Ranking windows (Part 1 / Part 2) only affect /meter leaderboard filters.
 * HoF, record breaks, Breaker themes, and season ranks stay on the parent
 * season (`hofSeasonId` / non-`rankingOnly` rows) — keep that in sync with
 * `meter_leaderboard_cycles` in Supabase.
 */
export type MeterLeaderboardCycle = {
  id: string
  label: string
  /** Inclusive UTC instant (full ISO). */
  startsAt: string
  /** Exclusive UTC instant for ranking; omit on the current live ranking window. */
  endsAt?: string | null
  /**
   * HoF / record-break window end. When set (including `null` = still live),
   * overrides `endsAt` for Hall of Fame. Use so Part 1 can close for rankings
   * while the Verdandi HoF season stays open.
   */
  hofEndsAt?: string | null
  /** Label for HoF / season UI when it should differ from the ranking label. */
  hofLabel?: string
  /**
   * Ranking-only part (e.g. Verdandi Part 2). Hidden from HoF season pickers;
   * HoF uses `hofSeasonId` instead.
   */
  rankingOnly?: boolean
  /** Parent HoF season id when `rankingOnly` (e.g. verdandi-2 → verdandi). */
  hofSeasonId?: string
  note?: string
  /** Party bar / rewards theme granted for HoF breaks in this season. */
  hofThemeId: 'hall-of-fame' | 'magia-hall-of-fame' | 'verdandi-hall-of-fame'
  hofThemeLabel: string
}

/**
 * June 15, 2026 5:30 PM Arizona (America/Phoenix, UTC−7) — Magia cycle start /
 * Olympus cycle end.
 */
export const MAGIA_CYCLE_START_UTC = '2026-06-16T00:30:00.000Z'

/**
 * July 23, 2026 00:00 Arizona (America/Phoenix, UTC−7) — Verdandi cycle start /
 * Magia cycle end. Magia includes all of July 22 Arizona.
 */
export const VERDANDI_CYCLE_START_UTC = '2026-07-23T07:00:00.000Z'

/**
 * August 8, 2026 1:00 PM Arizona (America/Phoenix, UTC−7) — Verdandi Part 2
 * leaderboard ranking window only (HoF season stays on `verdandi`).
 */
export const VERDANDI_2_CYCLE_START_UTC = '2026-08-08T20:00:00.000Z'

/** April 20, 2026 00:00 Arizona (America/Phoenix, UTC−7) — Olympus cycle start. */
export const OLYMPUS_CYCLE_START_UTC = '2026-04-20T07:00:00.000Z'

export const METER_LEADERBOARD_CYCLES: MeterLeaderboardCycle[] = [
  {
    id: 'olympus',
    label: 'Olympus Cycle: April 20th - June 15',
    startsAt: OLYMPUS_CYCLE_START_UTC,
    endsAt: MAGIA_CYCLE_START_UTC,
    hofThemeId: 'hall-of-fame',
    hofThemeLabel: 'Olympus Breaker',
  },
  {
    id: 'magia',
    label: 'Magia Cycle: June 15 - July 22',
    startsAt: MAGIA_CYCLE_START_UTC,
    endsAt: VERDANDI_CYCLE_START_UTC,
    hofThemeId: 'magia-hall-of-fame',
    hofThemeLabel: 'Magia Breaker',
  },
  {
    id: 'verdandi',
    label: 'Verdandi Cycle Part 1: July 23 - August 8',
    hofLabel: 'Verdandi Cycle: July 23 - Current',
    startsAt: VERDANDI_CYCLE_START_UTC,
    endsAt: VERDANDI_2_CYCLE_START_UTC,
    /** Ranking Part 1 closed; HoF / ranks / Breaker stay on the open season. */
    hofEndsAt: null,
    hofThemeId: 'verdandi-hall-of-fame',
    hofThemeLabel: 'Verdandi Breaker',
  },
  {
    id: 'verdandi-2',
    label: 'Verdandi Cycle Part 2: August 8 - Current',
    startsAt: VERDANDI_2_CYCLE_START_UTC,
    rankingOnly: true,
    hofSeasonId: 'verdandi',
    hofThemeId: 'verdandi-hall-of-fame',
    hofThemeLabel: 'Verdandi Breaker',
  },
]

/** Live ranking window (Verdandi Part 2). */
export function isMeterLeaderboardCycleLive(cycle: MeterLeaderboardCycle): boolean {
  return cycle.endsAt == null || cycle.endsAt === ''
}

export function getDefaultMeterLeaderboardCycle(): MeterLeaderboardCycle {
  const live = METER_LEADERBOARD_CYCLES.find(isMeterLeaderboardCycleLive)
  return live ?? METER_LEADERBOARD_CYCLES[METER_LEADERBOARD_CYCLES.length - 1]!
}

export function getMeterLeaderboardCycle(id: string): MeterLeaderboardCycle | null {
  const trimmed = id.trim()
  if (!trimmed) return null
  return METER_LEADERBOARD_CYCLES.find((c) => c.id === trimmed) ?? null
}

/** Ranking window for /meter leaderboards. */
export function meterLeaderboardCycleWindow(cycle: MeterLeaderboardCycle): {
  windowStart: string
  windowEnd: string | null
} {
  return {
    windowStart: cycle.startsAt,
    windowEnd: cycle.endsAt ?? null,
  }
}

/** HoF seasons only — excludes ranking-only parts like verdandi-2. */
export function getMeterHofSeasonCycles(): MeterLeaderboardCycle[] {
  return METER_LEADERBOARD_CYCLES.filter((cycle) => !cycle.rankingOnly)
}

export function resolveMeterHofSeasonCycle(cycle: MeterLeaderboardCycle): MeterLeaderboardCycle {
  if (!cycle.hofSeasonId) return cycle
  return getMeterLeaderboardCycle(cycle.hofSeasonId) ?? cycle
}

export function getMeterHofSeasonCycle(id: string): MeterLeaderboardCycle | null {
  const cycle = getMeterLeaderboardCycle(id)
  if (!cycle) return null
  if (cycle.rankingOnly) return resolveMeterHofSeasonCycle(cycle)
  return cycle
}

export function meterHofSeasonWindow(cycle: MeterLeaderboardCycle): {
  windowStart: string
  windowEnd: string | null
} {
  const season = resolveMeterHofSeasonCycle(cycle)
  const windowEnd = season.hofEndsAt !== undefined ? season.hofEndsAt : (season.endsAt ?? null)
  return {
    windowStart: season.startsAt,
    windowEnd,
  }
}

export function isMeterHofSeasonLive(cycle: MeterLeaderboardCycle): boolean {
  const { windowEnd } = meterHofSeasonWindow(cycle)
  return windowEnd == null || windowEnd === ''
}

export function getDefaultMeterHofSeasonCycle(): MeterLeaderboardCycle {
  const seasons = getMeterHofSeasonCycles()
  const live = seasons.find(isMeterHofSeasonLive)
  return live ?? seasons[seasons.length - 1]!
}

export function meterHofSeasonLabel(cycle: MeterLeaderboardCycle): string {
  const season = resolveMeterHofSeasonCycle(cycle)
  return season.hofLabel?.trim() || season.label
}

/** Short cycle name for profile UI (e.g. "Magia Cycle" without date range). */
export function meterLeaderboardCycleShortLabel(cycle: MeterLeaderboardCycle): string {
  const label = cycle.rankingOnly ? meterHofSeasonLabel(cycle) : cycle.hofLabel?.trim() || cycle.label
  const short = label.split(':')[0]?.trim()
  return short || label
}
