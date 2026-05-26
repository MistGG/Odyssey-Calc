import type { SupabaseClient } from '@supabase/supabase-js'

import {
  dungeonFromPayload,
  isLeaderboardEligibleDungeonParsePayload,
  partyMembersFromPayload,
} from './meterParsePayload'
import { dpsToPercentile } from './meterParseScoreColor'
import { memberDpsInParse } from './meterRoleBuckets'
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

function isEligibleHardParse(row: PublicMeterParseRow): boolean {
  const dungeon = dungeonFromPayload(row.payload)
  const difficultyId = row.difficulty_id ?? dungeon?.difficultyId
  if (difficultyId !== HARD_DIFFICULTY_ID) return false
  if (!isLeaderboardEligibleDungeonParsePayload(row.payload)) return false
  const members = partyMembersFromPayload(row.payload)
  if (members.length === 0) return false
  return members.some((m) => m.isSelf)
}

function selfDpsInParse(row: PublicMeterParseRow): number {
  const members = partyMembersFromPayload(row.payload)
  let best = 0
  for (const member of members) {
    if (!member.isSelf) continue
    const dps = memberDpsInParse(member, row.payload, row.duration_sec, members)
    if (dps > best) best = dps
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
): MeterPointGrant[] {
  const grants: MeterPointGrant[] = []
  const firstClearDungeons = new Set<string>()
  let dailyGranted = false
  const today = todayUtcKey()

  for (const row of myParses) {
    if (!isEligibleHardParse(row)) continue
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
    const pool = publicRowsByDungeon.get(dungeonId) ?? []
    const score = bestParseScoreForHardDungeon(myParses, pool, dungeonId)
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
