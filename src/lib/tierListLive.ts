import type { SupabaseClient } from '@supabase/supabase-js'
import type { TierListCache } from './tierList'
import type {
  TierListChangeHistoryRow,
  TierListUpdateSummary,
} from '../pages/tierList/tierListModel'

export async function publishTierListLiveSnapshot(
  supabase: SupabaseClient,
  cache: TierListCache,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) {
      return { ok: false, error: 'Not signed in — cannot publish tier_list_live.' }
    }
    const { error } = await supabase.from('tier_list_live').upsert(
      {
        singleton: true,
        cache,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'singleton' },
    )
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}

export type TierRecomputeRunInsert = Pick<
  TierListChangeHistoryRow,
  | 'mode'
  | 'refreshedCount'
  | 'apiCount'
  | 'tierCount'
  | 'sampleDigimon'
  | 'apiDiffById'
  | 'apiDiffs'
  | 'summary'
>

function countSummaryChanges(summary: TierListUpdateSummary): number {
  return (
    summary.dpsUp.length +
    summary.dpsDown.length +
    summary.dpsNew.length +
    summary.tankUp.length +
    summary.tankDown.length +
    summary.tankNew.length +
    summary.healerUp.length +
    summary.healerDown.length +
    summary.healerNew.length +
    summary.statusChanges.length
  )
}

/** Persist a tier-list rebuild run for the Tier changes page (GitHub Actions worker). */
export async function publishTierRecomputeRun(
  supabase: SupabaseClient,
  row: TierRecomputeRunInsert,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) {
      return { ok: false, error: 'Not signed in — cannot record tier_recompute_runs.' }
    }
    const tierSummaryChanges = countSummaryChanges(row.summary)
    const status =
      row.tierCount + row.apiCount + tierSummaryChanges === 0 ? 'no_changes' : 'changed'

    const { data: syncRun } = await supabase
      .from('tier_sync_runs')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { error } = await supabase.from('tier_recompute_runs').insert({
      sync_run_id: syncRun?.id ?? null,
      status,
      mode: row.mode,
      total_count: row.refreshedCount,
      tier_count: row.tierCount,
      api_count: row.apiCount,
      tier_summary: row.summary,
      sample_digimon: row.sampleDigimon,
      api_diffs: row.apiDiffs ?? [],
      api_diff_by_id: row.apiDiffById ?? {},
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}
