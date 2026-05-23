import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { fetchDigimonDetail } from '../api/digimonService'
import { fetchApprovedRotations, type CommunityRotation } from './communityRotations'
import type { DigimonContentStatus } from './contentStatus'
import { TIER_DPS_SIM_REVISION } from './dpsSim'
import { diffTierApiSnapshot } from './tierApiSnapshotDiff'
import { buildSustainedDpsEntryForDigimon } from './tierListDigimonEntry'
import {
  TIER_SUPPORT_SCORE_REVISION,
  type SustainedDpsEntry,
  type TierListCache,
} from './tierList'
import type {
  TierChangeCause,
  TierListChangeHistoryRow,
  TierListUpdateSummary,
} from '../pages/tierList/tierListModel'
import {
  buildTierListUpdateSummary,
  fetchAllDigimonIndex,
  REQUEST_DELAY_MS,
  RATE_LIMIT_COOLDOWN_MS,
  sleep,
} from '../pages/tierList/tierListModel'
import {
  tierUpdateRunHasVisibleChanges,
  type TierChangesPublished,
  type TierListPublishedBundle,
} from './tierListPublished'

export type TierRefreshCauseFlags = {
  api: boolean
  tier: boolean
  other: boolean
}

function collapseTierRefreshCause(cause?: TierRefreshCauseFlags): TierChangeCause {
  if (!cause) return 'tier'
  if (cause.api) return 'api'
  return 'tier'
}

export type TierListGhaRebuildOptions = {
  onProgress?: (message: string) => void
  loadPrevious?: () => {
    bundle: TierListPublishedBundle | null
    changes: TierChangesPublished | null
  }
}

export type TierListGhaRebuildResult = {
  skipCommit: boolean
  skipReason?: string
  bundle: TierListPublishedBundle
  changes: TierChangesPublished
  newHistoryRow: TierListChangeHistoryRow | null
}

function logProgress(opts: TierListGhaRebuildOptions | undefined, message: string) {
  opts?.onProgress?.(message)
  console.log(`[tier-rebuild] ${message}`)
}

function isRateLimitError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return /429|rate/i.test(msg)
}

function nodeEnv(): Record<string, string | undefined> | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
}

function createSupabaseForRebuild(): SupabaseClient | null {
  const env = nodeEnv()
  const url = env?.SUPABASE_URL?.trim() || env?.VITE_SUPABASE_URL?.trim()
  const key = env?.SUPABASE_SERVICE_ROLE_KEY?.trim() || env?.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !key) return null
  return createClient(url, key)
}

export async function runTierListGhaRebuild(
  opts?: TierListGhaRebuildOptions,
): Promise<TierListGhaRebuildResult> {
  const previous = opts?.loadPrevious?.() ?? { bundle: null, changes: null }
  const prevBundle = previous.bundle
  const prevChanges = previous.changes ?? { version: 1 as const, runs: [] }
  const isFirstPublish = prevBundle == null

  logProgress(opts, 'Fetching Digimon index…')
  const { all, signatures } = await fetchAllDigimonIndex()

  let communityRotations = new Map<string, CommunityRotation>()
  const supabase = createSupabaseForRebuild()
  if (supabase) {
    try {
      communityRotations = await fetchApprovedRotations(supabase)
      logProgress(opts, `Loaded ${communityRotations.size} approved community rotation(s).`)
    } catch (e) {
      logProgress(
        opts,
        `Community rotations unavailable (${e instanceof Error ? e.message : 'error'}); using auto planner.`,
      )
    }
  } else {
    logProgress(opts, 'Supabase not configured; using auto planner only.')
  }

  const entries: Record<string, SustainedDpsEntry> = {}
  const snapshotBefore: Record<
    string,
    { dps: number; tankScore?: number; healerScore?: number; status?: DigimonContentStatus }
  > = {}

  for (const [id, e] of Object.entries(prevBundle?.cache.entries ?? {})) {
    snapshotBefore[id] = {
      dps: e.dps,
      tankScore: e.tankScore,
      healerScore: e.healerScore,
      status: e.status,
    }
  }

  const refreshCauseById = new Map<string, TierRefreshCauseFlags>()
  const apiDiffById = new Map<string, string[]>()
  const refreshedIds = new Set<string>()

  const queue = [...all.map((d) => d.id)]
  const total = queue.length
  let backoffMs = 0
  let index = 0

  while (queue.length > 0) {
    const id = queue[0]!
    const done = total - queue.length
    const meta = all.find((d) => d.id === id)
    logProgress(opts, `Processing ${done + 1}/${total}: ${meta?.name ?? id}`)

    if (backoffMs > 0) {
      logProgress(opts, `Rate limit cooldown ${Math.ceil(backoffMs / 1000)}s…`)
      await sleep(backoffMs)
      backoffMs = 0
    }

    try {
      const detail = await fetchDigimonDetail(id)
      const prevApiSnapshot = prevBundle?.cache.entries[id]?.apiSnapshot
      const communityRotation = communityRotations.get(id) ?? null
      const entry = buildSustainedDpsEntryForDigimon(detail, communityRotation)
      entries[id] = entry
      refreshedIds.add(id)

      const apiDiffLines = diffTierApiSnapshot(prevApiSnapshot, entry.apiSnapshot!)
      if (apiDiffLines.length > 0) {
        apiDiffById.set(id, apiDiffLines)
      }

      const hadPrior = Boolean(prevBundle?.cache.entries[id])
      const apiChanged =
        !hadPrior ||
        Boolean(prevBundle && prevBundle.cache.listSignatures[id] !== signatures[id])
      refreshCauseById.set(id, {
        api: apiChanged || apiDiffLines.length > 0,
        tier: true,
        other: false,
      })

      queue.shift()
      index += 1
    } catch (e: unknown) {
      if (isRateLimitError(e)) {
        backoffMs = Math.max(backoffMs, RATE_LIMIT_COOLDOWN_MS)
        queue.shift()
        queue.push(id)
        logProgress(opts, `Rate limited on ${id}; requeued.`)
        continue
      }
      const msg = e instanceof Error ? e.message : 'unknown error'
      logProgress(opts, `Error on ${id}: ${msg}; requeued.`)
      queue.shift()
      queue.push(id)
      index += 1
    }

    await sleep(REQUEST_DELAY_MS)
  }

  const missing = all.filter((d) => !entries[d.id])
  if (missing.length > 0) {
    throw new Error(
      `Tier rebuild incomplete: ${missing.length} Digimon failed after retries (${missing
        .slice(0, 5)
        .map((d) => d.name)
        .join(', ')}…).`,
    )
  }

  const cache: TierListCache = {
    version: 3,
    total: all.length,
    queue: [],
    entries,
    listSignatures: signatures,
    lastCheckedAt: new Date().toISOString(),
  }

  const bundle: TierListPublishedBundle = {
    version: 1,
    generatedAt: new Date().toISOString(),
    dpsSimRevision: TIER_DPS_SIM_REVISION,
    supportScoreRevision: TIER_SUPPORT_SCORE_REVISION,
    cache,
  }

  const summary: TierListUpdateSummary = buildTierListUpdateSummary(
    'force',
    snapshotBefore,
    entries,
    refreshedIds,
  )

  let apiCount = 0
  let tierCount = 0
  const sampleDigimon: TierListChangeHistoryRow['sampleDigimon'] = []
  for (const id of refreshedIds) {
    const entry = entries[id]
    if (!entry) continue
    const rawCause = refreshCauseById.get(id)
    const cause = collapseTierRefreshCause(rawCause)
    if (cause === 'api') apiCount += 1
    if (rawCause?.tier || rawCause?.other || !rawCause || cause === 'tier') tierCount += 1
    if (sampleDigimon.length < 12) {
      sampleDigimon.push({ id, name: entry.name, cause })
    }
  }

  const compactApiDiffById: Record<string, string[]> = {}
  const compactApiDiffs: Array<{ id: string; name: string; lines: string[] }> = []
  let apiDiffBuckets = 0
  for (const [diffId, lines] of apiDiffById.entries()) {
    if (lines.length === 0) continue
    const clipped = lines.slice(0, 8)
    compactApiDiffById[diffId] = clipped
    compactApiDiffs.push({ id: diffId, name: entries[diffId]?.name ?? diffId, lines: clipped })
    apiDiffBuckets += 1
    if (apiDiffBuckets >= 60) break
  }

  const hasChanges = tierUpdateRunHasVisibleChanges(summary, apiDiffById.size, isFirstPublish)

  let newHistoryRow: TierListChangeHistoryRow | null = null
  let runs = [...prevChanges.runs]

  if (hasChanges) {
    newHistoryRow = {
      id: `${summary.finishedAt}-${Math.random().toString(36).slice(2, 8)}`,
      finishedAt: summary.finishedAt,
      mode: 'force',
      refreshedCount: refreshedIds.size,
      apiCount,
      tierCount,
      sampleDigimon,
      apiDiffById: compactApiDiffById,
      apiDiffs: compactApiDiffs,
      summary,
    }
    runs = [newHistoryRow, ...runs].slice(0, 120)
    logProgress(opts, 'Changes detected; changelog run will be appended.')
  } else {
    logProgress(opts, 'No visible changes vs previous publish; changelog will not be updated.')
  }

  const changes: TierChangesPublished = { version: 1, runs }

  if (!hasChanges && !isFirstPublish) {
    return {
      skipCommit: true,
      skipReason: 'no_visible_changes',
      bundle,
      changes: prevChanges,
      newHistoryRow: null,
    }
  }

  return {
    skipCommit: false,
    bundle,
    changes,
    newHistoryRow,
  }
}
