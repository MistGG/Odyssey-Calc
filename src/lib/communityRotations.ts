import type { SupabaseClient } from '@supabase/supabase-js'

export type CommunityRotation = {
  id: string
  digimon_id: string
  user_id: string
  author_name: string
  skill_ids: string[]
  filler_ids: string[]
  full_cycles: number
  comparable_dps: number
  sim_revision: number
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  updated_at: string
}

/** Fetch the single best approved rotation per digimon. Returns a map keyed by digimon_id. */
export async function fetchApprovedRotations(
  supabase: SupabaseClient,
): Promise<Map<string, CommunityRotation>> {
  const { data, error } = await supabase
    .from('community_rotations')
    .select('*')
    .eq('status', 'approved')
    .order('comparable_dps', { ascending: false })

  if (error || !data) return new Map()

  // Keep only the highest-DPS approved rotation per digimon
  const map = new Map<string, CommunityRotation>()
  for (const row of data as CommunityRotation[]) {
    if (!map.has(row.digimon_id)) {
      map.set(row.digimon_id, row)
    }
  }
  return map
}

export type SubmitRotationInput = {
  digimonId: string
  authorName: string
  skillIds: string[]
  fillerIds: string[]
  fullCycles: number
  comparableDps: number
  simRevision: number
}

export type SubmitRotationResult =
  | { status: 'submitted'; id: string }
  | { status: 'not_better' }
  | { status: 'error'; message: string }

/**
 * Submit a community rotation. Auto-approved when the submitted DPS beats the current
 * best approved rotation for this digimon (or there is none). Otherwise pending.
 */
export async function submitCommunityRotation(
  supabase: SupabaseClient,
  userId: string,
  input: SubmitRotationInput,
): Promise<SubmitRotationResult> {
  const { digimonId, authorName, skillIds, fillerIds, fullCycles, comparableDps, simRevision } =
    input

  // Check existing best approved DPS for this digimon
  const { data: existing } = await supabase
    .from('community_rotations')
    .select('comparable_dps, id')
    .eq('digimon_id', digimonId)
    .eq('status', 'approved')
    .order('comparable_dps', { ascending: false })
    .limit(1)
    .maybeSingle()

  const existingBestDps: number = (existing as { comparable_dps: number } | null)?.comparable_dps ?? 0

  // Must beat existing approved rotation by at least 0.1 DPS to be worth submitting
  if (comparableDps <= existingBestDps + 0.1) {
    return { status: 'not_better' }
  }

  // Upsert (user can only have one pending/approved row per digimon — see unique index)
  const row = {
    digimon_id: digimonId,
    user_id: userId,
    author_name: authorName,
    skill_ids: skillIds,
    filler_ids: fillerIds,
    full_cycles: fullCycles,
    comparable_dps: comparableDps,
    sim_revision: simRevision,
    // Auto-approve: if it beats the current best, mark approved immediately
    status: 'approved' as const,
  }

  const { data: inserted, error } = await supabase
    .from('community_rotations')
    .upsert(row, { onConflict: 'user_id,digimon_id' })
    .select('id')
    .single()

  if (error) return { status: 'error', message: error.message }
  return { status: 'submitted', id: (inserted as { id: string }).id }
}
