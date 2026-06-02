import type { SupabaseClient } from '@supabase/supabase-js'
import type { TierListCache } from './tierList'

const REBUILD_STALE_MS = 2 * 60 * 60 * 1000

export function isTierListRebuildActive(rebuildingAt: string | null | undefined): boolean {
  if (!rebuildingAt) return false
  const t = new Date(rebuildingAt).getTime()
  return Number.isFinite(t) && Date.now() - t < REBUILD_STALE_MS
}

export async function markTierListRebuildStarted(
  supabase: SupabaseClient,
  cache: TierListCache,
  total: number,
): Promise<void> {
  try {
    await supabase.from('tier_list_live').upsert(
      {
        singleton: true,
        cache,
        rebuilding_at: new Date().toISOString(),
        rebuild_done: 0,
        rebuild_total: total,
      },
      { onConflict: 'singleton' },
    )
  } catch {
    /* non-fatal */
  }
}

export async function markTierListRebuildProgress(
  supabase: SupabaseClient,
  done: number,
  total: number,
): Promise<void> {
  try {
    await supabase
      .from('tier_list_live')
      .update({ rebuild_done: done, rebuild_total: total })
      .eq('singleton', true)
  } catch {
    /* non-fatal */
  }
}

export async function publishTierListLiveSnapshot(
  supabase: SupabaseClient,
  cache: TierListCache,
): Promise<void> {
  try {
    await supabase.from('tier_list_live').upsert(
      {
        singleton: true,
        cache,
        updated_at: new Date().toISOString(),
        rebuilding_at: null,
        rebuild_done: null,
        rebuild_total: null,
      },
      { onConflict: 'singleton' },
    )
  } catch {
    /* non-fatal */
  }
}

export async function clearTierListRebuildFlag(supabase: SupabaseClient): Promise<void> {
  try {
    await supabase
      .from('tier_list_live')
      .update({
        rebuilding_at: null,
        rebuild_done: null,
        rebuild_total: null,
      })
      .eq('singleton', true)
  } catch {
    /* non-fatal */
  }
}
