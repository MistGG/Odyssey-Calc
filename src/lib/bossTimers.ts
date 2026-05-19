import type { SupabaseClient } from '@supabase/supabase-js'
import { WIKI_API_BASE, WIKI_SITE_ORIGIN } from '../config/env'
import { fetchJson } from '../api/http'

export const NEPTUNEMON_BOSS_ID = 'neptunemon'
export const NEPTUNEMON_MONSTER_ID = 'm4vc8mv'
const DEVICE_KEY = 'odyssey-calc-boss-timer-device-id-v1'
const PENDING_SPAWN_KEY = 'odyssey-calc-neptunemon-pending-spawn-v1'

export type BossTimerEvent = 'spawn' | 'death'

export type BossSchedule = {
  bossId: typeof NEPTUNEMON_BOSS_ID
  anchorUtcMs: number
  aliveWindowMs: number
  respawnWaitMs: number
  updatedAtMs: number
}

export type BossReward = {
  key: string
  itemId: string
  itemName: string
  iconId: string
  min: number
  max: number
  rateLabel: string
}

export type BossInfo = {
  name: string
  modelId: string
  mapName: string
  rewards: BossReward[]
}

type RemoteScheduleRow = {
  boss_id?: unknown
  anchor_utc_ms?: unknown
  alive_window_ms?: unknown
  respawn_wait_ms?: unknown
  updated_at_ms?: unknown
}

type MonsterDrop = {
  item_id?: unknown
  item_name?: unknown
  item_icon_id?: unknown
  quantity?: unknown
  drop_type?: unknown
}

type RaidReward = {
  item_id?: unknown
  item_name?: unknown
  item_icon_id?: unknown
  min?: unknown
  max?: unknown
  rate_permil?: unknown
}

type RaidBand = {
  rewards?: unknown
}

type MonsterPayload = {
  name?: unknown
  model_id?: unknown
  locations?: unknown
  drops?: unknown
  raid_rankings?: unknown
}

export function getDefaultBossSchedule(): BossSchedule {
  return {
    bossId: NEPTUNEMON_BOSS_ID,
    anchorUtcMs: Date.UTC(2026, 4, 17, 15, 49, 19),
    aliveWindowMs: 105_000,
    respawnWaitMs: 90 * 60_000,
    updatedAtMs: Date.UTC(2026, 4, 17, 15, 49, 19),
  }
}

export function bossPeriodMs(schedule: BossSchedule): number {
  return schedule.aliveWindowMs + schedule.respawnWaitMs
}

export function lastBossSpawnUtcMs(atMs: number, schedule: BossSchedule): number | null {
  const diff = atMs - schedule.anchorUtcMs
  if (diff < 0) return null
  return schedule.anchorUtcMs + Math.floor(diff / bossPeriodMs(schedule)) * bossPeriodMs(schedule)
}

export function nextBossSpawnUtcMs(atMs: number, schedule: BossSchedule): number {
  const diff = atMs - schedule.anchorUtcMs
  if (diff < 0) return schedule.anchorUtcMs
  return schedule.anchorUtcMs + (Math.floor(diff / bossPeriodMs(schedule)) + 1) * bossPeriodMs(schedule)
}

export function isBossAlive(atMs: number, schedule: BossSchedule): boolean {
  const last = lastBossSpawnUtcMs(atMs, schedule)
  return last !== null && atMs < last + schedule.aliveWindowMs
}

export function formatCountdown(totalMs: number): string {
  const s = Math.ceil(Math.max(0, totalMs) / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m ${sec}s`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

export function itemIconUrl(iconId: string): string {
  return `${WIKI_SITE_ORIGIN}/game_icons/items/${iconId}.png`
}

export function monsterModelUrl(modelId: string): string | undefined {
  return modelId ? `${WIKI_SITE_ORIGIN}/models/${modelId}l.png` : undefined
}

function titleCase(value: string): string {
  const clean = value.replace(/[_-]+/g, ' ').trim()
  return clean ? clean.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Drop'
}

function formatDropRatePermille(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return 'Rate unknown'
  const pct = value / 100
  return `${pct.toLocaleString(undefined, { maximumFractionDigits: value % 100 === 0 ? 0 : 1 })}%`
}

function normalizeSchedule(raw: unknown): BossSchedule | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as RemoteScheduleRow
  const anchorUtcMs = Number(row.anchor_utc_ms)
  const aliveWindowMs = Number(row.alive_window_ms)
  const respawnWaitMs = Number(row.respawn_wait_ms)
  const updatedAtMs = Number(row.updated_at_ms)
  if (
    row.boss_id !== NEPTUNEMON_BOSS_ID ||
    !Number.isFinite(anchorUtcMs) ||
    !Number.isFinite(aliveWindowMs) ||
    !Number.isFinite(respawnWaitMs) ||
    !Number.isFinite(updatedAtMs)
  ) {
    return null
  }
  return {
    bossId: NEPTUNEMON_BOSS_ID,
    anchorUtcMs: Math.round(anchorUtcMs),
    aliveWindowMs: Math.round(aliveWindowMs),
    respawnWaitMs: Math.round(respawnWaitMs),
    updatedAtMs: Math.round(updatedAtMs),
  }
}

export async function fetchRemoteBossSchedule(client: SupabaseClient | null): Promise<BossSchedule | null> {
  if (!client) return null
  const { data, error } = await client
    .from('boss_schedules')
    .select('boss_id,anchor_utc_ms,alive_window_ms,respawn_wait_ms,updated_at_ms')
    .eq('boss_id', NEPTUNEMON_BOSS_ID)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return normalizeSchedule(data)
}

function readDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY)?.trim()
    if (existing) return existing.slice(0, 80)
    const next = crypto.randomUUID()
    localStorage.setItem(DEVICE_KEY, next)
    return next
  } catch {
    return 'restricted-storage'
  }
}

export function readPendingBossSpawnUtcMs(): number | null {
  try {
    const n = Number(localStorage.getItem(PENDING_SPAWN_KEY))
    return Number.isFinite(n) ? Math.round(n) : null
  } catch {
    return null
  }
}

export function writePendingBossSpawnUtcMs(spawnUtcMs: number): void {
  try {
    localStorage.setItem(PENDING_SPAWN_KEY, String(Math.round(spawnUtcMs)))
  } catch {
    /* storage can fail in restricted modes */
  }
}

export function clearPendingBossSpawnUtcMs(): void {
  try {
    localStorage.removeItem(PENDING_SPAWN_KEY)
  } catch {
    /* storage can fail in restricted modes */
  }
}

export async function submitBossTimerReport(
  client: SupabaseClient | null,
  schedule: BossSchedule,
  eventType: BossTimerEvent,
  observedUtcMs = Date.now(),
): Promise<void> {
  if (!client) throw new Error('Online timer sync is not configured.')
  const { data, error } = await client.functions.invoke('submit-boss-timer-report', {
    body: {
      bossId: NEPTUNEMON_BOSS_ID,
      eventType,
      observedUtcMs,
      anchorUtcMs: schedule.anchorUtcMs,
      aliveWindowMs: schedule.aliveWindowMs,
      respawnWaitMs: schedule.respawnWaitMs,
      clientUpdatedAtMs: schedule.updatedAtMs,
      deviceId: readDeviceId(),
    },
  })
  if (error) throw new Error(error.message)
  const response = data as { ok?: unknown; error?: unknown } | null
  if (!response?.ok) {
    throw new Error(typeof response?.error === 'string' ? response.error : 'Timer report was rejected.')
  }
}

function flattenMonsterRewards(monster: MonsterPayload): BossReward[] {
  const out: BossReward[] = []
  const drops = Array.isArray(monster.drops) ? (monster.drops as MonsterDrop[]) : []
  for (const [i, drop] of drops.entries()) {
    const itemId = String(drop.item_id ?? '')
    const itemName = String(drop.item_name ?? '')
    const iconId = String(drop.item_icon_id ?? '')
    if (!itemId || !itemName) continue
    const qty = Math.max(1, Math.round(Number(drop.quantity) || 1))
    out.push({
      key: `drop:${itemId}:${i}`,
      itemId,
      itemName,
      iconId,
      min: qty,
      max: qty,
      rateLabel: titleCase(String(drop.drop_type ?? 'Drop')),
    })
  }

  const bands = Array.isArray(monster.raid_rankings) ? (monster.raid_rankings as RaidBand[]) : []
  for (const [bandIndex, band] of bands.entries()) {
    const rewards = Array.isArray(band.rewards) ? (band.rewards as RaidReward[]) : []
    for (const [rewardIndex, reward] of rewards.entries()) {
      const itemId = String(reward.item_id ?? '')
      const itemName = String(reward.item_name ?? '')
      const iconId = String(reward.item_icon_id ?? '')
      if (!itemId || !itemName) continue
      out.push({
        key: `raid:${bandIndex}:${itemId}:${rewardIndex}`,
        itemId,
        itemName,
        iconId,
        min: Math.max(1, Math.round(Number(reward.min) || 1)),
        max: Math.max(1, Math.round(Number(reward.max) || 1)),
        rateLabel: formatDropRatePermille(Number(reward.rate_permil)),
      })
    }
  }
  return out
}

export async function fetchNeptunemonInfo(): Promise<BossInfo> {
  const params = new URLSearchParams({ id: NEPTUNEMON_MONSTER_ID })
  const monster = await fetchJson<MonsterPayload>(`${WIKI_API_BASE}/monsters?${params.toString()}`)
  const locations = Array.isArray(monster.locations) ? monster.locations : []
  const firstLocation = locations[0] as Record<string, unknown> | undefined
  return {
    name: String(monster.name ?? 'Neptunemon'),
    modelId: String(monster.model_id ?? ''),
    mapName: String(firstLocation?.map_name ?? 'Olympos Festival Island'),
    rewards: flattenMonsterRewards(monster),
  }
}
