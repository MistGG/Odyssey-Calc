import type { SupabaseClient } from '@supabase/supabase-js'
import { TIER_DPS_SIM_REVISION } from './dpsSim'
import type { TierSubmissionModifiers } from './tierSubmissionSim'

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
  force_auto_crit: boolean
  perfect_at_clone: boolean
  anim_cancel: boolean
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  updated_at: string
}

function normalizeCommunityRotation(row: CommunityRotation): CommunityRotation {
  return {
    ...row,
    force_auto_crit: row.force_auto_crit === true,
    perfect_at_clone: row.perfect_at_clone === true,
    anim_cancel: row.anim_cancel === true,
  }
}

export function communityRotationToTierModifiers(
  row: Pick<CommunityRotation, 'force_auto_crit' | 'perfect_at_clone' | 'anim_cancel'>,
): TierSubmissionModifiers {
  return {
    forceAutoCrit: row.force_auto_crit,
    perfectAtClone: row.perfect_at_clone,
    autoAttackAnimationCancel: row.anim_cancel,
  }
}

const TIER_SUBMIT_DPS_EPSILON = 0.1

function idsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((id, i) => id === b[i])
}

/** Approved row matches current tier sim revision (tier list + Lab auto use it). */
export function communityRotationUsableInLab(
  row: CommunityRotation | null | undefined,
  simRevision: number = TIER_DPS_SIM_REVISION,
): row is CommunityRotation {
  return row != null && row.status === 'approved' && row.sim_revision === simRevision
}

export function labRotationRowsFromSkillIds(
  skillIds: string[],
  validSkillIds: ReadonlySet<string>,
): { skillId: string }[] {
  return skillIds.filter((id) => validSkillIds.has(id)).map((skillId) => ({ skillId }))
}

export function communityRotationMatchesLabSubmission(
  row: CommunityRotation,
  skillIds: string[],
  fillerIds: string[],
  modifiers: TierSubmissionModifiers,
): boolean {
  return (
    row.force_auto_crit === (modifiers.forceAutoCrit === true) &&
    row.perfect_at_clone === (modifiers.perfectAtClone === true) &&
    row.anim_cancel === (modifiers.autoAttackAnimationCancel === true) &&
    idsEqual(row.skill_ids, skillIds) &&
    idsEqual(row.filler_ids, fillerIds)
  )
}

/** True when submit would return not_better (approved best already at or above this DPS). */
export function tierSubmissionAlreadyCovered(
  approvedBestDps: number,
  customDps: number,
): boolean {
  return customDps <= approvedBestDps + TIER_SUBMIT_DPS_EPSILON
}

/** Best approved community rotation for this digimon and Lab modifier set. */
export async function fetchBestApprovedRotation(
  supabase: SupabaseClient,
  digimonId: string,
  modifiers: TierSubmissionModifiers,
): Promise<CommunityRotation | null> {
  const forceAutoCrit = modifiers.forceAutoCrit === true
  const perfectAtClone = modifiers.perfectAtClone === true
  const animCancel = modifiers.autoAttackAnimationCancel === true

  const { data, error } = await supabase
    .from('community_rotations')
    .select('*')
    .eq('digimon_id', digimonId)
    .eq('status', 'approved')
    .eq('force_auto_crit', forceAutoCrit)
    .eq('perfect_at_clone', perfectAtClone)
    .eq('anim_cancel', animCancel)
    .order('comparable_dps', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return normalizeCommunityRotation(data as CommunityRotation)
}

const SUBMITTED_ROTATIONS_STORAGE_KEY = 'odyssey-tier-submitted-rotations-v1'

export function markRotationSubmitted(compareKey: string): void {
  if (!compareKey) return
  try {
    const raw = localStorage.getItem(SUBMITTED_ROTATIONS_STORAGE_KEY)
    const map: Record<string, true> = raw ? (JSON.parse(raw) as Record<string, true>) : {}
    map[compareKey] = true
    localStorage.setItem(SUBMITTED_ROTATIONS_STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* ignore quota / private mode */
  }
}

export function isRotationSubmittedLocally(compareKey: string): boolean {
  if (!compareKey) return false
  try {
    const raw = localStorage.getItem(SUBMITTED_ROTATIONS_STORAGE_KEY)
    if (!raw) return false
    const map = JSON.parse(raw) as Record<string, true>
    return map[compareKey] === true
  } catch {
    return false
  }
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
  for (const raw of data as CommunityRotation[]) {
    const row = normalizeCommunityRotation(raw)
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
  modifiers: TierSubmissionModifiers
}

export type SubmitRotationResult =
  | { status: 'submitted'; id: string }
  | { status: 'not_better' }
  | { status: 'error'; message: string }

/** User-facing text for Supabase errors on community_rotations. */
export function formatCommunityRotationError(message: string): string {
  const lower = message.toLowerCase()
  if (
    lower.includes('community_rotations') &&
    (lower.includes('schema cache') ||
      lower.includes('does not exist') ||
      lower.includes('relation') ||
      lower.includes('42p01'))
  ) {
    return 'Community rotations are not available right now. Try again later or contact the site maintainer.'
  }
  if (lower.includes('force_auto_crit') || lower.includes('perfect_at_clone') || lower.includes('anim_cancel')) {
    return 'This rotation could not be saved — the database schema is out of date.'
  }
  return message
}

/**
 * Submit a community rotation. Auto-approved when the submitted DPS beats the current
 * best approved rotation for this digimon (or there is none). Otherwise pending.
 */
export async function submitCommunityRotation(
  supabase: SupabaseClient,
  userId: string,
  input: SubmitRotationInput,
): Promise<SubmitRotationResult> {
  const { digimonId, authorName, skillIds, fillerIds, fullCycles, comparableDps, simRevision, modifiers } =
    input
  const forceAutoCrit = modifiers.forceAutoCrit === true
  const perfectAtClone = modifiers.perfectAtClone === true
  const animCancel = modifiers.autoAttackAnimationCancel === true

  // Check existing best approved DPS for this digimon with the same special modifiers
  const { data: existing } = await supabase
    .from('community_rotations')
    .select('comparable_dps, id')
    .eq('digimon_id', digimonId)
    .eq('status', 'approved')
    .eq('force_auto_crit', forceAutoCrit)
    .eq('perfect_at_clone', perfectAtClone)
    .eq('anim_cancel', animCancel)
    .order('comparable_dps', { ascending: false })
    .limit(1)
    .maybeSingle()

  const existingBestDps: number = (existing as { comparable_dps: number } | null)?.comparable_dps ?? 0

  if (tierSubmissionAlreadyCovered(existingBestDps, comparableDps)) {
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
    force_auto_crit: forceAutoCrit,
    perfect_at_clone: perfectAtClone,
    anim_cancel: animCancel,
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
