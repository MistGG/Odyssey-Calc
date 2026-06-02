import type { SupabaseClient } from '@supabase/supabase-js'
import type { TierListCache } from './tierList'

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
      },
      { onConflict: 'singleton' },
    )
  } catch {
    /* non-fatal */
  }
}
