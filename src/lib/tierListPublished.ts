import type { TierListCache } from './tierList'
import type { TierListChangeHistoryRow, TierListUpdateSummary } from '../pages/tierList/tierListModel'

export const TIER_LIST_PUBLISHED_PATH = 'data/tier-list.json'
export const TIER_CHANGES_PUBLISHED_PATH = 'data/tier-changes.json'

export type TierListPublishedBundle = {
  version: 1
  generatedAt: string
  dpsSimRevision: number
  supportScoreRevision: number
  cache: TierListCache
}

export type TierChangesPublished = {
  version: 1
  runs: TierListChangeHistoryRow[]
}

export function useStaticTierPublishedData(): boolean {
  return import.meta.env.VITE_TIER_STATIC_DATA === 'true'
}

export function staticTierDataUrl(path: string): string {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')
  const rel = path.replace(/^\//, '')
  return `${base}${rel}`
}

export async function fetchTierListPublishedBundle(): Promise<TierListPublishedBundle | null> {
  const res = await fetch(staticTierDataUrl(TIER_LIST_PUBLISHED_PATH))
  if (!res.ok) return null
  const data: unknown = await res.json()
  if (!data || typeof data !== 'object') return null
  const o = data as TierListPublishedBundle
  if (o.version !== 1 || !o.cache?.entries) return null
  return o
}

export async function fetchTierChangesPublished(): Promise<TierChangesPublished> {
  const res = await fetch(staticTierDataUrl(TIER_CHANGES_PUBLISHED_PATH))
  if (!res.ok) return { version: 1, runs: [] }
  const data: unknown = await res.json()
  if (!data || typeof data !== 'object') return { version: 1, runs: [] }
  const o = data as TierChangesPublished
  if (o.version !== 1 || !Array.isArray(o.runs)) return { version: 1, runs: [] }
  return o
}

/** True when a run has DPS/tank/healer/status deltas or API field diffs worth recording. */
export function tierUpdateRunHasVisibleChanges(
  summary: TierListUpdateSummary,
  apiDiffCount: number,
  isFirstPublish: boolean,
): boolean {
  if (isFirstPublish) return true
  if (apiDiffCount > 0) return true
  return (
    summary.dpsUp.length > 0 ||
    summary.dpsDown.length > 0 ||
    summary.dpsNew.length > 0 ||
    summary.tankUp.length > 0 ||
    summary.tankDown.length > 0 ||
    summary.tankNew.length > 0 ||
    summary.healerUp.length > 0 ||
    summary.healerDown.length > 0 ||
    summary.healerNew.length > 0 ||
    summary.statusChanges.length > 0
  )
}
