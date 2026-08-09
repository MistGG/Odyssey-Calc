import { dpsToPercentile } from './meterParseScoreColor'
import { METER_ROLE_BUCKET_LABELS, type MeterRoleBucket } from './meterRoleBuckets'

/** Progression-style labels (not competitive letter ranks). */
export const PLAYER_TIER_IDS = [
  'Seasoned',
  'Veteran',
  'Champion',
  'Rookie',
  'In-Training',
  'Fresh',
] as const
export type PlayerTierId = (typeof PLAYER_TIER_IDS)[number]

/** @deprecated Use PLAYER_TIER_IDS */
export const PLAYER_TIER_LETTERS = PLAYER_TIER_IDS
/** @deprecated Use PlayerTierId */
export type PlayerTierLetter = PlayerTierId

export type PlayerTierEntryInput = {
  playerKey: string
  displayName: string
  dps: number
  roleBucket: MeterRoleBucket
  dungeonId: string
  difficultyId: number
  digimonId: string
  digimonName: string
  createdAt: string
}

export type PlayerTierScoreBreakdown = {
  quality: number
  breadth: number
  consistency: number
  prestige: number
}

export type PlayerTierHofCounts = {
  hard: number
  normal: number
}

export type PlayerTierRow = {
  playerKey: string
  displayName: string
  tier: PlayerTierId
  score: number
  mainRole: MeterRoleBucket
  mainRoleLabel: string
  clearCount: number
  dungeonCount: number
  /** Hard + Normal induction total (uncapped). */
  hofCount: number
  hofHardCount: number
  hofNormalCount: number
  topDigimonId: string
  topDigimonName: string
  breakdown: PlayerTierScoreBreakdown
  /** Average of best-scope parse percentiles used for quality. */
  avgBestPercentile: number
}

export type PlayerTierSnapshot = {
  version: 2
  generatedAt: string
  cycleId: string
  cycleLabel: string
  windowStart: string
  windowEnd: string | null
  minClears: number
  playerCount: number
  rankedCount: number
  byTier: Record<PlayerTierId, PlayerTierRow[]>
  players: PlayerTierRow[]
}

export const PLAYER_TIER_MIN_CLEARS = 3
/** Distinct dungeons with a blue+ (≥50) clear for full breadth score. */
export const PLAYER_TIER_BREADTH_TARGET = 6
/** Hard inductions contributing to prestige (additive with Normal). */
export const PLAYER_TIER_HOF_HARD_CAP = 5
/** Normal inductions contributing to prestige (additive with Hard). */
export const PLAYER_TIER_HOF_NORMAL_CAP = 10
/** @deprecated Prestige uses Hard+Normal additive caps. */
export const PLAYER_TIER_HOF_CAP = PLAYER_TIER_HOF_HARD_CAP
/** @deprecated Prestige uses Hard + Normal. */
export const PLAYER_TIER_HOF_HARD_ONLY = false

/** Prestige-led mix; remaining 40% keeps prior quality/breadth/consistency ratios. */
const PRESTIGE_WEIGHT = 0.6
const NON_PRESTIGE = 1 - PRESTIGE_WEIGHT
const WEIGHTS = {
  quality: (50 / 90) * NON_PRESTIGE,
  breadth: (25 / 90) * NON_PRESTIGE,
  consistency: (15 / 90) * NON_PRESTIGE,
  prestige: PRESTIGE_WEIGHT,
} as const

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2
  }
  return sorted[mid]!
}

/** Additive prestige: min(1, hard/5 + normal/10). */
export function playerTierPrestigeFromHof(hard: number, normal: number): number {
  return clamp01(
    Math.min(PLAYER_TIER_HOF_HARD_CAP, Math.max(0, hard)) / PLAYER_TIER_HOF_HARD_CAP +
      Math.min(PLAYER_TIER_HOF_NORMAL_CAP, Math.max(0, normal)) / PLAYER_TIER_HOF_NORMAL_CAP,
  )
}

export function playerTierFromScore(
  score: number,
  clearCount: number,
  minClears = PLAYER_TIER_MIN_CLEARS,
): PlayerTierId {
  if (clearCount < minClears) return 'Fresh'
  if (score >= 85) return 'Seasoned'
  if (score >= 70) return 'Veteran'
  if (score >= 55) return 'Champion'
  if (score >= 40) return 'Rookie'
  if (score >= 25) return 'In-Training'
  return 'Fresh'
}

export function playerTierColor(tier: PlayerTierId): string {
  switch (tier) {
    case 'Seasoned':
      return '#e5cc80'
    case 'Veteran':
      return '#e268a8'
    case 'Champion':
      return '#a335ee'
    case 'Rookie':
      return '#0070ff'
    case 'In-Training':
      return '#1eff00'
    default:
      return '#888888'
  }
}

/** @deprecated Use playerTierColor */
export const playerTierLetterColor = playerTierColor

type ScopeKey = string

function scopeKey(dungeonId: string, difficultyId: number, role: MeterRoleBucket): ScopeKey {
  return `${dungeonId}|${difficultyId}|${role}`
}

function normalizeHofCounts(
  input: Record<string, number> | Record<string, PlayerTierHofCounts> | undefined,
  playerKey: string,
): PlayerTierHofCounts {
  const raw = input?.[playerKey]
  if (raw == null) return { hard: 0, normal: 0 }
  if (typeof raw === 'number') return { hard: Math.max(0, raw), normal: 0 }
  return {
    hard: Math.max(0, Number(raw.hard) || 0),
    normal: Math.max(0, Number(raw.normal) || 0),
  }
}

/**
 * Seasonal player tiers: HoF prestige-led score (Hard + Normal additive caps) with
 * quality, dungeon breadth, and consistency. Best role wins.
 */
export function computePlayerTierSnapshot(params: {
  cycleId: string
  cycleLabel: string
  windowStart: string
  windowEnd?: string | null
  entries: PlayerTierEntryInput[]
  hofCountsByPlayer: Record<string, number> | Record<string, PlayerTierHofCounts>
  minClears?: number
  generatedAt?: string
}): PlayerTierSnapshot {
  const minClears = params.minClears ?? PLAYER_TIER_MIN_CLEARS
  const eligible = params.entries.filter(
    (e) =>
      e.playerKey.trim() &&
      e.dungeonId.trim() &&
      e.difficultyId >= 2 &&
      Number.isFinite(e.dps) &&
      e.dps > 0,
  )

  const poolByScope = new Map<ScopeKey, number[]>()
  for (const e of eligible) {
    const key = scopeKey(e.dungeonId, e.difficultyId, e.roleBucket)
    const list = poolByScope.get(key)
    if (list) list.push(e.dps)
    else poolByScope.set(key, [e.dps])
  }

  type PlayerAccum = {
    displayName: string
    clears: PlayerTierEntryInput[]
    /** Best DPS per dungeon×diff×role */
    bestByScope: Map<ScopeKey, PlayerTierEntryInput>
  }

  const byPlayer = new Map<string, PlayerAccum>()
  for (const e of eligible) {
    const key = e.playerKey.trim().toLowerCase()
    let acc = byPlayer.get(key)
    if (!acc) {
      acc = { displayName: e.displayName, clears: [], bestByScope: new Map() }
      byPlayer.set(key, acc)
    }
    if (e.displayName.trim()) acc.displayName = e.displayName.trim()
    acc.clears.push(e)
    const sk = scopeKey(e.dungeonId, e.difficultyId, e.roleBucket)
    const prev = acc.bestByScope.get(sk)
    if (!prev || e.dps > prev.dps) acc.bestByScope.set(sk, e)
  }

  const players: PlayerTierRow[] = []

  for (const [playerKey, acc] of byPlayer) {
    const roleScores = new Map<
      MeterRoleBucket,
      {
        score: number
        breakdown: PlayerTierScoreBreakdown
        avgBest: number
        digimonId: string
        digimonName: string
        dungeonCount: number
      }
    >()

    const roles = new Set<MeterRoleBucket>()
    for (const e of acc.bestByScope.values()) roles.add(e.roleBucket)

    const hof = normalizeHofCounts(params.hofCountsByPlayer, playerKey)
    const prestige = playerTierPrestigeFromHof(hof.hard, hof.normal)

    for (const role of roles) {
      const roleBests = [...acc.bestByScope.values()].filter((e) => e.roleBucket === role)
      const roleClears = acc.clears.filter((e) => e.roleBucket === role)
      if (roleClears.length < minClears) continue

      const bestPercentiles: number[] = []
      const blueDungeons = new Set<string>()
      for (const best of roleBests) {
        const pool = poolByScope.get(scopeKey(best.dungeonId, best.difficultyId, role)) ?? [best.dps]
        const pct = dpsToPercentile(best.dps, pool)
        bestPercentiles.push(pct)
        if (pct >= 50) blueDungeons.add(best.dungeonId)
      }

      const allClearPercentiles = roleClears.map((c) => {
        const pool = poolByScope.get(scopeKey(c.dungeonId, c.difficultyId, role)) ?? [c.dps]
        return dpsToPercentile(c.dps, pool)
      })

      const avgBest = bestPercentiles.length
        ? bestPercentiles.reduce((s, n) => s + n, 0) / bestPercentiles.length
        : 0
      const quality = clamp01(avgBest / 100)
      const breadth = clamp01(blueDungeons.size / PLAYER_TIER_BREADTH_TARGET)
      const consistency = clamp01(median(allClearPercentiles) / 100)

      const score =
        100 *
        (quality * WEIGHTS.quality +
          breadth * WEIGHTS.breadth +
          consistency * WEIGHTS.consistency +
          prestige * WEIGHTS.prestige)

      const topDigimon = roleBests.reduce((a, b) => (b.dps > a.dps ? b : a), roleBests[0]!)

      roleScores.set(role, {
        score,
        breakdown: {
          quality: Math.round(quality * 100),
          breadth: Math.round(breadth * 100),
          consistency: Math.round(consistency * 100),
          prestige: Math.round(prestige * 100),
        },
        avgBest: Math.round(avgBest),
        digimonId: topDigimon.digimonId,
        digimonName: topDigimon.digimonName,
        dungeonCount: new Set(roleBests.map((e) => e.dungeonId)).size,
      })
    }

    let bestRole: MeterRoleBucket | null = null
    let bestMeta: (typeof roleScores extends Map<MeterRoleBucket, infer V> ? V : never) | null = null
    for (const [role, meta] of roleScores) {
      if (!bestMeta || meta.score > bestMeta.score) {
        bestRole = role
        bestMeta = meta
      }
    }

    const clearCount = acc.clears.length
    const hofCount = hof.hard + hof.normal

    if (!bestRole || !bestMeta) {
      players.push({
        playerKey,
        displayName: acc.displayName || playerKey,
        tier: 'Fresh',
        score: 0,
        mainRole: 'melee',
        mainRoleLabel: METER_ROLE_BUCKET_LABELS.melee,
        clearCount,
        dungeonCount: new Set(acc.clears.map((e) => e.dungeonId)).size,
        hofCount,
        hofHardCount: hof.hard,
        hofNormalCount: hof.normal,
        topDigimonId: acc.clears[0]?.digimonId ?? '',
        topDigimonName: acc.clears[0]?.digimonName ?? '',
        breakdown: { quality: 0, breadth: 0, consistency: 0, prestige: Math.round(prestige * 100) },
        avgBestPercentile: 0,
      })
      continue
    }

    const score = Math.round(bestMeta.score * 10) / 10
    players.push({
      playerKey,
      displayName: acc.displayName || playerKey,
      tier: playerTierFromScore(score, clearCount, minClears),
      score,
      mainRole: bestRole,
      mainRoleLabel: METER_ROLE_BUCKET_LABELS[bestRole],
      clearCount,
      dungeonCount: bestMeta.dungeonCount,
      hofCount,
      hofHardCount: hof.hard,
      hofNormalCount: hof.normal,
      topDigimonId: bestMeta.digimonId,
      topDigimonName: bestMeta.digimonName,
      breakdown: bestMeta.breakdown,
      avgBestPercentile: bestMeta.avgBest,
    })
  }

  players.sort((a, b) => {
    if (a.tier !== b.tier) {
      return PLAYER_TIER_IDS.indexOf(a.tier) - PLAYER_TIER_IDS.indexOf(b.tier)
    }
    return b.score - a.score || a.displayName.localeCompare(b.displayName)
  })

  const byTier = Object.fromEntries(PLAYER_TIER_IDS.map((t) => [t, [] as PlayerTierRow[]])) as Record<
    PlayerTierId,
    PlayerTierRow[]
  >
  for (const row of players) byTier[row.tier].push(row)

  return {
    version: 2,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    cycleId: params.cycleId,
    cycleLabel: params.cycleLabel,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd ?? null,
    minClears,
    playerCount: players.length,
    rankedCount: players.filter((p) => p.tier !== 'Fresh').length,
    byTier,
    players,
  }
}
