import type { SupabaseClient } from '@supabase/supabase-js'

import {
  dungeonFromPayload,
  isLeaderboardEligibleDungeonParsePayload,
  partyMembersFromPayload,
} from './meterParsePayload'
import { dpsToPercentile } from './meterParseScoreColor'
import {
  digimonIdToBucket,
  memberDpsInParse,
  memberRoleBucket,
  METER_ROLE_BUCKETS,
  type MeterRoleBucket,
} from './meterRoleBuckets'
import type { PublicMeterParseRow } from './meterPublicStats'
import { selfTamerFromMember } from './meterPlayerProfile'

export const NORMAL_DIFFICULTY_ID = 2
export const HARD_DIFFICULTY_ID = 3

/** Shop points per Olympus-cycle Hall of Fame record break. */
export const OLYMPUS_HOF_RECORD_BREAK_POINTS = 2

export type MeterPointGrant = {
  grantKey: string
  points: number
}

export type OlympusHofBreakForGrant = {
  parseId: string
  dungeonId: string
  difficultyId: number
  roleBucket: string
}

/** Per-role DPS pools — matches public leaderboard gold coloring. */
export type HardDungeonRolePools = Record<MeterRoleBucket, number[]>

export type ComputeMeterPointGrantsOptions = {
  /** Backfill only: award `daily:YYYY-MM-DD` for every UTC day with an eligible parse. */
  includeHistoricalDaily?: boolean
  /** Wiki digimon id → role; needed to attribute self DPS to a leaderboard role bucket. */
  digimonRoleById?: Map<string, string>
  /** Inclusive cycle window start (ISO). Score milestones use the live cycle board. */
  windowStart?: string | null
  /** Exclusive cycle window end (ISO); omit for the live cycle. */
  windowEnd?: string | null
}

function emptyRolePools(): HardDungeonRolePools {
  return {
    melee: [],
    ranged: [],
    caster: [],
    hybrid: [],
    tank: [],
    healer: [],
  }
}

function isMeterRoleBucket(value: string | null | undefined): value is MeterRoleBucket {
  return Boolean(value && (METER_ROLE_BUCKETS as readonly string[]).includes(value))
}

function parseInLeaderboardWindow(
  createdAt: string,
  windowStart?: string | null,
  windowEnd?: string | null,
): boolean {
  if (!windowStart && !windowEnd) return true
  const t = new Date(createdAt).getTime()
  if (!Number.isFinite(t)) return false
  if (windowStart) {
    const start = new Date(windowStart).getTime()
    if (Number.isFinite(start) && t < start) return false
  }
  if (windowEnd) {
    const end = new Date(windowEnd).getTime()
    // Cycle endsAt is exclusive (matches meterLeaderboardCycleWindow / RPC filters).
    if (Number.isFinite(end) && t >= end) return false
  }
  return true
}

function utcDateKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export function todayUtcKey(): string {
  return utcDateKey(new Date().toISOString())
}

type LeaderboardSummaryShape = {
  eligible?: boolean
  members?: Array<{
    playerKey?: string
    dps?: number
    roleBucket?: string
    digimonId?: string
  }>
}

function summaryFromRow(row: PublicMeterParseRow): LeaderboardSummaryShape | null {
  const raw = row.leaderboard_summary
  if (!raw || typeof raw !== 'object') return null
  return raw as LeaderboardSummaryShape
}

function normalizeTamerKey(raw: string): string {
  return raw.trim().toLowerCase()
}

function parseDifficultyId(row: PublicMeterParseRow): number | null {
  const dungeon = dungeonFromPayload(row.payload)
  const id = row.difficulty_id ?? dungeon?.difficultyId
  return typeof id === 'number' && Number.isFinite(id) ? id : null
}

function isNormalOrHardDifficulty(difficultyId: number | null): boolean {
  return difficultyId === NORMAL_DIFFICULTY_ID || difficultyId === HARD_DIFFICULTY_ID
}

function selfFromPayloadRow(row: PublicMeterParseRow): string | null {
  if (!row.payload) return null
  const selves: string[] = []
  for (const member of partyMembersFromPayload(row.payload)) {
    const self = selfTamerFromMember(member)
    if (self) selves.push(self.playerKey)
  }
  // Multiple isSelf on one owned row is peer-merge contamination — do not trust it.
  return selves.length === 1 ? selves[0]! : null
}

/** Resolve the uploader's tamer key from payloads, stored account key, or summary membership. */
export function resolveSelfPlayerKey(
  myParses: PublicMeterParseRow[],
  confirmedPlayerKey?: string | null,
): string | null {
  const stored = confirmedPlayerKey?.trim()
  if (stored) return normalizeTamerKey(stored)

  for (const row of myParses) {
    const fromPayload = selfFromPayloadRow(row)
    if (fromPayload) return fromPayload
  }

  return null
}

function rowHasSelfParticipation(
  row: PublicMeterParseRow,
  selfPlayerKey: string | null,
): boolean {
  if (row.payload && isLeaderboardEligibleDungeonParsePayload(row.payload)) {
    const members = partyMembersFromPayload(row.payload)
    if (selfPlayerKey) {
      if (
        members.some(
          (m) =>
            normalizeTamerKey(m.tamerName?.trim() || m.displayLabel?.trim() || '') ===
            selfPlayerKey,
        )
      ) {
        return true
      }
    } else {
      const selfCount = members.filter((m) => m.isSelf).length
      // Sole isSelf is trustworthy; multi-isSelf is peer-merge contamination.
      if (selfCount === 1) return true
    }
  }

  if (!selfPlayerKey) return false
  const summary = summaryFromRow(row)
  if (summary?.eligible !== true) return false
  return (summary.members ?? []).some(
    (m) => normalizeTamerKey(m.playerKey ?? '') === selfPlayerKey && (Number(m.dps) || 0) > 0,
  )
}

function isEligibleDailyParse(row: PublicMeterParseRow, selfPlayerKey?: string | null): boolean {
  if (!isNormalOrHardDifficulty(parseDifficultyId(row))) return false
  return rowHasSelfParticipation(row, selfPlayerKey ?? null)
}

function isEligibleHardParse(row: PublicMeterParseRow, selfPlayerKey?: string | null): boolean {
  if (parseDifficultyId(row) !== HARD_DIFFICULTY_ID) return false
  return rowHasSelfParticipation(row, selfPlayerKey ?? null)
}

/** Self DPS + role bucket for one parse (matches leaderboard attribution). */
export function selfRoleDpsInParse(
  row: PublicMeterParseRow,
  selfPlayerKey?: string | null,
  digimonRoleById?: Map<string, string>,
): { dps: number; roleBucket: MeterRoleBucket } | null {
  const key = selfPlayerKey ?? selfFromPayloadRow(row)
  const roles = digimonRoleById ?? new Map<string, string>()

  if (row.payload) {
    const members = partyMembersFromPayload(row.payload)
    let best: { dps: number; roleBucket: MeterRoleBucket } | null = null
    for (const member of members) {
      const memberKey = normalizeTamerKey(
        member.tamerName?.trim() || member.displayLabel?.trim() || '',
      )
      if (key) {
        if (memberKey !== key) continue
      } else if (!member.isSelf) {
        continue
      }
      const dps = memberDpsInParse(member, row.payload, row.duration_sec, members, roles)
      const roleBucket = memberRoleBucket(member, roles)
      if (dps > 0 && roleBucket && (!best || dps > best.dps)) {
        best = { dps, roleBucket }
      }
    }
    if (best) return best
  }

  const summary = summaryFromRow(row)
  if (!summary?.members?.length || !key) return null
  let best: { dps: number; roleBucket: MeterRoleBucket } | null = null
  for (const member of summary.members) {
    if (normalizeTamerKey(member.playerKey ?? '') !== key) continue
    const dps = Number(member.dps) || 0
    if (dps <= 0) continue
    const fromSummary = isMeterRoleBucket(member.roleBucket) ? member.roleBucket : null
    const fromDigimon = member.digimonId?.trim()
      ? digimonIdToBucket(member.digimonId.trim(), roles)
      : null
    const roleBucket = fromSummary ?? fromDigimon
    if (!roleBucket) continue
    if (!best || dps > best.dps) best = { dps, roleBucket }
  }
  return best
}

function rolePoolsFromPublicRows(
  publicRows: PublicMeterParseRow[],
  digimonRoleById: Map<string, string>,
): HardDungeonRolePools {
  const pools = emptyRolePools()
  for (const row of publicRows) {
    const members = partyMembersFromPayload(row.payload)
    for (const member of members) {
      const bucket = memberRoleBucket(member, digimonRoleById)
      if (!bucket) continue
      const dps = memberDpsInParse(
        member,
        row.payload,
        row.duration_sec,
        members,
        digimonRoleById,
      )
      if (dps > 0) pools[bucket].push(dps)
    }
  }
  return pools
}

/** Per-role DPS pools from precomputed leaderboard stats (same buckets as board gold). */
export function rolePoolsFromPrecomputed(
  stats: { sortedDpsByBucket: Record<MeterRoleBucket, number[]> } | null | undefined,
): HardDungeonRolePools | null {
  if (!stats) return null
  const pools = emptyRolePools()
  let any = false
  for (const bucket of METER_ROLE_BUCKETS) {
    for (const dps of stats.sortedDpsByBucket[bucket] ?? []) {
      if (dps > 0) {
        pools[bucket].push(dps)
        any = true
      }
    }
  }
  return any ? pools : null
}

export type BestParseScoreOptions = {
  digimonRoleById?: Map<string, string>
  windowStart?: string | null
  windowEnd?: string | null
}

/**
 * Best parse score for a Hard dungeon using per-role precomputed pools.
 * Matches public leaderboard coloring: score within the self member's role bucket,
 * optionally restricted to the live cycle window.
 */
export function bestParseScoreForHardDungeonWithRolePools(
  myParses: PublicMeterParseRow[],
  rolePools: HardDungeonRolePools,
  dungeonId: string,
  selfPlayerKey?: string | null,
  options?: BestParseScoreOptions,
): number {
  const did = dungeonId.trim()
  const selfKey = selfPlayerKey ?? resolveSelfPlayerKey(myParses, null)
  const roles = options?.digimonRoleById ?? new Map<string, string>()
  let bestScore = 0
  for (const row of myParses) {
    const d = row.dungeon_id?.trim() || dungeonFromPayload(row.payload)?.dungeonId?.trim() || ''
    if (d !== did || !isEligibleHardParse(row, selfKey)) continue
    if (!parseInLeaderboardWindow(row.created_at, options?.windowStart, options?.windowEnd)) {
      continue
    }
    const self = selfRoleDpsInParse(row, selfKey, roles)
    if (!self) continue
    const score = dpsToPercentile(self.dps, rolePools[self.roleBucket] ?? [])
    if (score > bestScore) bestScore = score
  }
  return bestScore
}

/** Best parse score for a Hard dungeon — per-role pools built from public parse rows. */
export function bestParseScoreForHardDungeon(
  myParses: PublicMeterParseRow[],
  publicRows: PublicMeterParseRow[],
  dungeonId: string,
  selfPlayerKey?: string | null,
  options?: BestParseScoreOptions,
): number {
  const did = dungeonId.trim()
  const roles = options?.digimonRoleById ?? new Map<string, string>()
  const rolePools = rolePoolsFromPublicRows(
    publicRows.filter((r) => {
      const d = r.dungeon_id?.trim() || dungeonFromPayload(r.payload)?.dungeonId?.trim() || ''
      return d === did && parseDifficultyId(r) === HARD_DIFFICULTY_ID
    }),
    roles,
  )
  return bestParseScoreForHardDungeonWithRolePools(
    myParses,
    rolePools,
    dungeonId,
    selfPlayerKey,
    options,
  )
}

export function olympusHofPointGrantKey(breakEntry: OlympusHofBreakForGrant): string {
  const dungeonId = breakEntry.dungeonId.trim()
  const roleBucket = breakEntry.roleBucket.trim().toLowerCase()
  return `olympus_hof:${breakEntry.parseId}:${dungeonId}:${breakEntry.difficultyId}:${roleBucket}`
}

export function computeOlympusHofPointGrants(
  breaks: OlympusHofBreakForGrant[],
): MeterPointGrant[] {
  const grants: MeterPointGrant[] = []
  const seen = new Set<string>()
  for (const breakEntry of breaks) {
    if (!breakEntry.parseId.trim() || !breakEntry.dungeonId.trim() || !breakEntry.roleBucket.trim()) {
      continue
    }
    const grantKey = olympusHofPointGrantKey(breakEntry)
    if (seen.has(grantKey)) continue
    seen.add(grantKey)
    grants.push({ grantKey, points: OLYMPUS_HOF_RECORD_BREAK_POINTS })
  }
  return grants
}

export function computeMeterPointGrants(
  myParses: PublicMeterParseRow[],
  publicRowsByDungeon: Map<string, PublicMeterParseRow[]>,
  hardDungeonRolePools?: Map<string, HardDungeonRolePools>,
  confirmedPlayerKey?: string | null,
  options?: ComputeMeterPointGrantsOptions,
  olympusHofBreaks?: OlympusHofBreakForGrant[],
): MeterPointGrant[] {
  const grants: MeterPointGrant[] = []
  const firstClearDungeons = new Set<string>()
  const dailyDates = new Set<string>()
  let dailyGrantedToday = false
  const today = todayUtcKey()
  const selfPlayerKey = resolveSelfPlayerKey(myParses, confirmedPlayerKey)
  const scoreOpts: BestParseScoreOptions = {
    digimonRoleById: options?.digimonRoleById,
    windowStart: options?.windowStart,
    windowEnd: options?.windowEnd,
  }

  for (const row of myParses) {
    const dungeonId =
      row.dungeon_id?.trim() || dungeonFromPayload(row.payload)?.dungeonId?.trim() || ''

    if (isEligibleDailyParse(row, selfPlayerKey)) {
      const day = utcDateKey(row.created_at)
      if (options?.includeHistoricalDaily) {
        dailyDates.add(day)
      } else if (!dailyGrantedToday && day === today) {
        grants.push({ grantKey: `daily:${today}`, points: 1 })
        dailyGrantedToday = true
      }
    }

    if (!dungeonId || !isEligibleHardParse(row, selfPlayerKey)) continue

    if (!firstClearDungeons.has(dungeonId)) {
      firstClearDungeons.add(dungeonId)
      grants.push({ grantKey: `first_clear:${dungeonId}`, points: 2 })
    }
  }

  if (options?.includeHistoricalDaily) {
    for (const day of dailyDates) {
      grants.push({ grantKey: `daily:${day}`, points: 1 })
    }
  }

  for (const dungeonId of firstClearDungeons) {
    const rolePools = hardDungeonRolePools?.get(dungeonId)
    const publicRows = publicRowsByDungeon.get(dungeonId)
    let score = 0
    if (rolePools) {
      score = bestParseScoreForHardDungeonWithRolePools(
        myParses,
        rolePools,
        dungeonId,
        selfPlayerKey,
        scoreOpts,
      )
    } else if (publicRows?.length && options?.digimonRoleById?.size) {
      // Fallback only when we have real public rows + role map (never invent 100s from an empty pool).
      score = bestParseScoreForHardDungeon(
        myParses,
        publicRows,
        dungeonId,
        selfPlayerKey,
        scoreOpts,
      )
    }
    if (score >= 90) grants.push({ grantKey: `score90:${dungeonId}`, points: 3 })
    if (score >= 99) grants.push({ grantKey: `score99:${dungeonId}`, points: 4 })
    if (score >= 100) grants.push({ grantKey: `score100:${dungeonId}`, points: 10 })
  }

  return [...grants, ...computeOlympusHofPointGrants(olympusHofBreaks ?? [])]
}

export function hasConfirmedTamerFromParses(myParses: PublicMeterParseRow[]): boolean {
  for (const row of myParses) {
    if (selfFromPayloadRow(row)) return true
  }
  return false
}

export function confirmedPlayerKeyFromParses(myParses: PublicMeterParseRow[]): string | null {
  return resolveSelfPlayerKey(myParses, null)
}

export async function fetchStoredConfirmedPlayerKey(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) return null

  const { data, error } = await supabase
    .from('meter_reward_accounts')
    .select('confirmed_player_key')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) return null
  const key = data?.confirmed_player_key
  return typeof key === 'string' && key.trim() ? normalizeTamerKey(key) : null
}

export async function persistConfirmedPlayerKey(
  supabase: SupabaseClient,
  playerKey: string | null,
): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) return

  const key = playerKey?.trim()
  if (!key) {
    await supabase
      .from('meter_reward_accounts')
      .update({
        confirmed_player_key: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
    return
  }

  await supabase.from('meter_reward_accounts').upsert({
    user_id: userId,
    confirmed_player_key: normalizeTamerKey(key),
    updated_at: new Date().toISOString(),
  })
}

export async function syncMeterPointGrants(
  supabase: SupabaseClient,
  grants: MeterPointGrant[],
): Promise<{ balance: number; error: string | null }> {
  const payload = grants.map((g) => ({ grant_key: g.grantKey, points: g.points }))
  const { data, error } = await supabase.rpc('meter_apply_point_grants', { p_grants: payload })
  if (error) return { balance: 0, error: error.message }
  const balance = typeof data?.balance === 'number' ? data.balance : Number(data?.balance ?? 0)
  return { balance, error: null }
}

/** Service-role backfill: insert grants without auth.uid() RPC. */
export async function insertMeterPointGrantsForUser(
  supabase: SupabaseClient,
  userId: string,
  grants: MeterPointGrant[],
): Promise<{ inserted: number; error: string | null }> {
  if (!grants.length) return { inserted: 0, error: null }

  const rows = grants.map((g) => ({
    user_id: userId,
    grant_key: g.grantKey,
    points: g.points,
  }))

  const { data, error } = await supabase
    .from('meter_point_grants')
    .upsert(rows, { onConflict: 'user_id,grant_key', ignoreDuplicates: true })
    .select('grant_key')

  if (error) return { inserted: 0, error: error.message }
  return { inserted: data?.length ?? 0, error: null }
}

export async function fetchMeterGrantKeys(supabase: SupabaseClient): Promise<Set<string>> {
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) return new Set()

  const { data, error } = await supabase
    .from('meter_point_grants')
    .select('grant_key')
    .eq('user_id', userId)

  if (error) return new Set()
  return new Set((data ?? []).map((r) => String(r.grant_key)))
}

export async function fetchMeterRewardsState(supabase: SupabaseClient): Promise<{
  balance: number
  ownedThemeIds: string[]
  equippedThemeId: string | null
  dailyCompletedToday: boolean
  error: string | null
}> {
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) {
    return {
      balance: 0,
      ownedThemeIds: [],
      equippedThemeId: null,
      dailyCompletedToday: false,
      error: null,
    }
  }

  const today = todayUtcKey()
  const [balRes, purchasesRes, accountRes, dailyRes] = await Promise.all([
    supabase.rpc('meter_wallet_balance', { p_user_id: userId }),
    supabase.from('meter_theme_purchases').select('theme_id'),
    supabase
      .from('meter_reward_accounts')
      .select('equipped_theme_id, confirmed_player_key')
      .maybeSingle(),
    supabase
      .from('meter_point_grants')
      .select('grant_key')
      .eq('grant_key', `daily:${today}`)
      .maybeSingle(),
  ])

  if (balRes.error) return { balance: 0, ownedThemeIds: [], equippedThemeId: null, dailyCompletedToday: false, error: balRes.error.message }
  if (purchasesRes.error) {
    return { balance: 0, ownedThemeIds: [], equippedThemeId: null, dailyCompletedToday: false, error: purchasesRes.error.message }
  }

  return {
    balance: Number(balRes.data ?? 0),
    ownedThemeIds: (purchasesRes.data ?? []).map((r) => String(r.theme_id)),
    equippedThemeId: accountRes.data?.equipped_theme_id?.trim() || null,
    dailyCompletedToday: Boolean(dailyRes.data),
    error: accountRes.error?.message ?? dailyRes.error?.message ?? null,
  }
}
