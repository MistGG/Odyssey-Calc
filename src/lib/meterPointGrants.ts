import type { SupabaseClient } from '@supabase/supabase-js'

import {
  dungeonFromPayload,
  isLeaderboardEligibleDungeonParsePayload,
  partyMembersFromPayload,
} from './meterParsePayload'
import { dpsToPercentile } from './meterParseScoreColor'
import { memberDpsInParse, METER_ROLE_BUCKETS } from './meterRoleBuckets'
import type { PublicMeterParseRow } from './meterPublicStats'
import { selfTamerFromMember } from './meterPlayerProfile'

export const HARD_DIFFICULTY_ID = 3

export type MeterPointGrant = {
  grantKey: string
  points: number
}

function utcDateKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function todayUtcKey(): string {
  return utcDateKey(new Date().toISOString())
}

type LeaderboardSummaryShape = {
  eligible?: boolean
  members?: Array<{ playerKey?: string; dps?: number }>
}

function summaryFromRow(row: PublicMeterParseRow): LeaderboardSummaryShape | null {
  const raw = row.leaderboard_summary
  if (!raw || typeof raw !== 'object') return null
  return raw as LeaderboardSummaryShape
}

function normalizeTamerKey(raw: string): string {
  return raw.trim().toLowerCase()
}

function resolveSelfPlayerKey(
  myParses: PublicMeterParseRow[],
  confirmedPlayerKey?: string | null,
): string | null {
  for (const row of myParses) {
    if (!row.payload) continue
    for (const member of partyMembersFromPayload(row.payload)) {
      const self = selfTamerFromMember(member)
      if (self) return self.playerKey
    }
  }
  const key = confirmedPlayerKey?.trim()
  return key ? normalizeTamerKey(key) : null
}

function isEligibleHardParse(row: PublicMeterParseRow, selfPlayerKey?: string | null): boolean {
  const dungeon = dungeonFromPayload(row.payload)
  const difficultyId = row.difficulty_id ?? dungeon?.difficultyId
  if (difficultyId !== HARD_DIFFICULTY_ID) return false

  if (row.payload && isLeaderboardEligibleDungeonParsePayload(row.payload)) {
    const members = partyMembersFromPayload(row.payload)
    if (members.length === 0) return false
    return members.some((m) => m.isSelf)
  }

  const summary = summaryFromRow(row)
  if (summary?.eligible === false) return false
  if (summary?.eligible !== true || !selfPlayerKey) return false
  return (summary.members ?? []).some(
    (m) => normalizeTamerKey(m.playerKey ?? '') === selfPlayerKey && (Number(m.dps) || 0) > 0,
  )
}

function selfDpsInParse(row: PublicMeterParseRow, selfPlayerKey?: string | null): number {
  if (row.payload) {
    const members = partyMembersFromPayload(row.payload)
    let best = 0
    for (const member of members) {
      if (!member.isSelf) continue
      const dps = memberDpsInParse(member, row.payload, row.duration_sec, members)
      if (dps > best) best = dps
    }
    return best
  }

  const summary = summaryFromRow(row)
  if (!summary?.members?.length || !selfPlayerKey) return 0
  let best = 0
  for (const member of summary.members) {
    const key = normalizeTamerKey(member.playerKey ?? '')
    if (key !== selfPlayerKey) continue
    best = Math.max(best, Number(member.dps) || 0)
  }
  return best
}

function poolDpsValues(publicRows: PublicMeterParseRow[]): number[] {
  const values: number[] = []
  for (const row of publicRows) {
    const members = partyMembersFromPayload(row.payload)
    for (const member of members) {
      const dps = memberDpsInParse(member, row.payload, row.duration_sec, members)
      if (dps > 0) values.push(dps)
    }
  }
  return values
}

export function poolDpsValuesFromPrecomputed(
  stats: { sortedDpsByBucket: Record<(typeof METER_ROLE_BUCKETS)[number], number[]> } | null | undefined,
): number[] {
  if (!stats) return []
  const values: number[] = []
  for (const bucket of METER_ROLE_BUCKETS) {
    for (const dps of stats.sortedDpsByBucket[bucket]) {
      if (dps > 0) values.push(dps)
    }
  }
  return values
}

/** Best parse score for a Hard dungeon using a precomputed DPS pool (no public payload download). */
export function bestParseScoreForHardDungeonWithPool(
  myParses: PublicMeterParseRow[],
  pool: number[],
  dungeonId: string,
  selfPlayerKey?: string | null,
): number {
  const did = dungeonId.trim()
  let myBest = 0
  for (const row of myParses) {
    const d = row.dungeon_id?.trim() || dungeonFromPayload(row.payload)?.dungeonId?.trim() || ''
    if (d !== did || !isEligibleHardParse(row, selfPlayerKey)) continue
    myBest = Math.max(myBest, selfDpsInParse(row, selfPlayerKey))
  }
  if (myBest <= 0) return 0
  return dpsToPercentile(myBest, pool)
}

/** Best parse score for a Hard dungeon — max self DPS across all uploads (any role/digimon), vs full pool. */
export function bestParseScoreForHardDungeon(
  myParses: PublicMeterParseRow[],
  publicRows: PublicMeterParseRow[],
  dungeonId: string,
): number {
  const did = dungeonId.trim()
  let myBest = 0
  for (const row of myParses) {
    const d = row.dungeon_id?.trim() || dungeonFromPayload(row.payload)?.dungeonId?.trim() || ''
    if (d !== did || !isEligibleHardParse(row)) continue
    myBest = Math.max(myBest, selfDpsInParse(row))
  }
  if (myBest <= 0) return 0
  const pool = poolDpsValues(
    publicRows.filter((r) => {
      const d = r.dungeon_id?.trim() || dungeonFromPayload(r.payload)?.dungeonId?.trim() || ''
      return d === did && (r.difficulty_id ?? dungeonFromPayload(r.payload)?.difficultyId) === HARD_DIFFICULTY_ID
    }),
  )
  return dpsToPercentile(myBest, pool)
}

export function computeMeterPointGrants(
  myParses: PublicMeterParseRow[],
  publicRowsByDungeon: Map<string, PublicMeterParseRow[]>,
  hardDungeonPools?: Map<string, number[]>,
  confirmedPlayerKey?: string | null,
): MeterPointGrant[] {
  const grants: MeterPointGrant[] = []
  const firstClearDungeons = new Set<string>()
  let dailyGranted = false
  const today = todayUtcKey()
  const selfPlayerKey = resolveSelfPlayerKey(myParses, confirmedPlayerKey)

  for (const row of myParses) {
    if (!isEligibleHardParse(row, selfPlayerKey)) continue
    const dungeonId =
      row.dungeon_id?.trim() || dungeonFromPayload(row.payload)?.dungeonId?.trim() || ''
    if (!dungeonId) continue

    if (!dailyGranted && utcDateKey(row.created_at) === today) {
      grants.push({ grantKey: `daily:${today}`, points: 1 })
      dailyGranted = true
    }

    if (!firstClearDungeons.has(dungeonId)) {
      firstClearDungeons.add(dungeonId)
      grants.push({ grantKey: `first_clear:${dungeonId}`, points: 2 })
    }
  }

  // Score tiers: one grant key per dungeon (not per role). DB unique (user_id, grant_key) prevents re-award.
  for (const dungeonId of firstClearDungeons) {
    const pool = hardDungeonPools?.get(dungeonId) ?? poolDpsValues(publicRowsByDungeon.get(dungeonId) ?? [])
    const score = hardDungeonPools?.has(dungeonId)
      ? bestParseScoreForHardDungeonWithPool(myParses, pool, dungeonId, selfPlayerKey)
      : bestParseScoreForHardDungeon(myParses, publicRowsByDungeon.get(dungeonId) ?? [], dungeonId)
    if (score >= 90) grants.push({ grantKey: `score90:${dungeonId}`, points: 3 })
    if (score >= 99) grants.push({ grantKey: `score99:${dungeonId}`, points: 4 })
    if (score >= 100) grants.push({ grantKey: `score100:${dungeonId}`, points: 10 })
  }

  return grants
}

export function hasConfirmedTamerFromParses(myParses: PublicMeterParseRow[]): boolean {
  for (const row of myParses) {
    const members = partyMembersFromPayload(row.payload)
    for (const member of members) {
      if (selfTamerFromMember(member)) return true
    }
  }
  return false
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
    supabase.from('meter_reward_accounts').select('equipped_theme_id').maybeSingle(),
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
