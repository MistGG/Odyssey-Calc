/**
 * Leaderboard ranking cycles. Edit when a new cycle starts: set `endsAt` on the
 * outgoing cycle and add a new live entry without `endsAt`.
 *
 * Also insert/update the matching row in `meter_leaderboard_cycles` (Supabase) and
 * call `refresh_meter_hof_cycle_summary` for the outgoing cycle when it ends.
 *
 * Windows filter meter_leaderboard_entries.created_at on the server (bounded RPC
 * rows only — no full parse payloads).
 */
export type MeterLeaderboardCycle = {
  id: string
  label: string
  /** Inclusive UTC instant (full ISO). */
  startsAt: string
  /** Exclusive UTC instant; omit on the current live cycle. */
  endsAt?: string | null
  note?: string
  /** Party bar / rewards theme granted for HoF breaks in this cycle. */
  hofThemeId: 'hall-of-fame' | 'magia-hall-of-fame'
  hofThemeLabel: string
}

/**
 * June 15, 2026 5:30 PM Arizona (America/Phoenix, UTC−7) — Magia cycle start /
 * Olympus cycle end.
 */
export const MAGIA_CYCLE_START_UTC = '2026-06-16T00:30:00.000Z'

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
    label: 'Magia Cycle: June 15 - Current',
    startsAt: MAGIA_CYCLE_START_UTC,
    hofThemeId: 'magia-hall-of-fame',
    hofThemeLabel: 'Magia Breaker',
  },
]

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

export function meterLeaderboardCycleWindow(cycle: MeterLeaderboardCycle): {
  windowStart: string
  windowEnd: string | null
} {
  return {
    windowStart: cycle.startsAt,
    windowEnd: cycle.endsAt ?? null,
  }
}

/** Short cycle name for profile UI (e.g. "Magia Cycle" without date range). */
export function meterLeaderboardCycleShortLabel(cycle: MeterLeaderboardCycle): string {
  const short = cycle.label.split(':')[0]?.trim()
  return short || cycle.label
}
