import type { CommunityRotation } from './communityRotations'
import { TIER_DPS_SIM_REVISION } from './dpsSim'
import type { SustainedDpsEntry } from './tierList'

/** Persisted sustained fight-length resims (cleared on tier list update / full cache clear). */
export const TIER_FIGHT_RESIM_CACHE_STORAGE_KEY = 'odysseyCalc.tierList.fightResimCache.v1'

export type TierFightResimCachedRow = {
  /** {@link SustainedDpsEntry.skillsSignature} when the row was computed; miss if entry changed. */
  sig: string
  dps: number
  dpsCategoryScores: NonNullable<SustainedDpsEntry['dpsCategoryScores']>
}

export type TierFightResimCacheRootV1 = {
  v: 1
  revision: string
  byParamKey: Record<string, Record<string, TierFightResimCachedRow>>
}

export function communityRotationsMapFingerprint(map: ReadonlyMap<string, CommunityRotation>): string {
  if (map.size === 0) return '0'
  let h = 5381
  for (const [id, r] of [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const chunk = `${id}\0${r.updated_at}\0${r.skill_ids.join(',')}`
    for (let i = 0; i < chunk.length; i += 1) {
      h = Math.imul(h, 33) + chunk.charCodeAt(i)
    }
  }
  return (h >>> 0).toString(36)
}

export function buildFightResimCacheRevision(args: {
  lastCheckedAt?: string
  queueLen: number
  cacheTotal: number
  communityFp: string
}): string {
  return [
    String(TIER_DPS_SIM_REVISION),
    args.lastCheckedAt ?? 'none',
    String(args.queueLen),
    String(args.cacheTotal),
    args.communityFp,
  ].join('#')
}

export function buildFightResimParamKey(args: {
  durationSec: number
  forceAutoCrit: boolean
  perfectAtClone: boolean
  autoAnimCancel: boolean
  targetEnemyAttributeTrim: string
}): string {
  return [
    String(args.durationSec),
    args.forceAutoCrit ? '1' : '0',
    args.perfectAtClone ? '1' : '0',
    args.autoAnimCancel ? '1' : '0',
    args.targetEnemyAttributeTrim,
  ].join('#')
}

export function clearTierFightDurationResimCacheStorage(): void {
  try {
    localStorage.removeItem(TIER_FIGHT_RESIM_CACHE_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function readTierFightDurationResimCacheRoot(): TierFightResimCacheRootV1 | null {
  try {
    const raw = localStorage.getItem(TIER_FIGHT_RESIM_CACHE_STORAGE_KEY)
    if (raw == null || raw.trim() === '') return null
    const parsed = JSON.parse(raw) as TierFightResimCacheRootV1
    if (parsed?.v !== 1 || typeof parsed.revision !== 'string' || typeof parsed.byParamKey !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

/** Max distinct fight-param buckets retained in memory + localStorage. */
export const MAX_FIGHT_RESIM_PARAM_KEYS = 4

/** Drop oldest param buckets when over the cap (insertion order via Object.keys). */
export function trimFightResimParamBuckets(
  root: TierFightResimCacheRootV1,
  preferKeepKey?: string,
): void {
  const keys = Object.keys(root.byParamKey)
  if (keys.length <= MAX_FIGHT_RESIM_PARAM_KEYS) return
  const keep = new Set<string>()
  if (preferKeepKey && root.byParamKey[preferKeepKey]) keep.add(preferKeepKey)
  for (let i = keys.length - 1; i >= 0 && keep.size < MAX_FIGHT_RESIM_PARAM_KEYS; i--) {
    keep.add(keys[i]!)
  }
  for (const key of keys) {
    if (!keep.has(key)) delete root.byParamKey[key]
  }
}

export function writeTierFightDurationResimCacheRoot(
  root: TierFightResimCacheRootV1,
  preferKeepKey?: string,
): void {
  try {
    trimFightResimParamBuckets(root, preferKeepKey)
    localStorage.setItem(TIER_FIGHT_RESIM_CACHE_STORAGE_KEY, JSON.stringify(root))
  } catch {
    /* ignore */
  }
}
