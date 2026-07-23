import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveAppSiteOrigin } from '../config/site'
import { formatCommunityGuideError } from './communityGuides'

export type CommunityGuideCollaborator = {
  id: string
  guide_id: string
  user_id: string | null
  display_name: string
  role: 'editor'
  status: 'pending' | 'accepted' | 'revoked'
  invite_token: string | null
  invited_by: string
  created_at: string
  accepted_at: string | null
}

export type CommunityGuideInvitePreview = {
  id: string
  guide_id: string
  guide_title: string
  guide_slug: string
  author_name: string
  status: string
  invitee_display_name: string
}

function normalizeCollaborator(row: Record<string, unknown>): CommunityGuideCollaborator {
  return {
    id: String(row.id),
    guide_id: String(row.guide_id),
    user_id: row.user_id == null ? null : String(row.user_id),
    display_name: String(row.display_name ?? ''),
    role: 'editor',
    status:
      row.status === 'accepted' || row.status === 'revoked' ? row.status : 'pending',
    invite_token: row.invite_token == null ? null : String(row.invite_token),
    invited_by: String(row.invited_by),
    created_at: String(row.created_at),
    accepted_at: row.accepted_at == null ? null : String(row.accepted_at),
  }
}

export function communityGuideInviteUrl(token: string): string {
  const path = `/guides/invite/${encodeURIComponent(token)}`
  return `${resolveAppSiteOrigin()}#${path}`
}

export async function copyCommunityGuideInviteLink(token: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(communityGuideInviteUrl(token))
    return true
  } catch {
    return false
  }
}

function isMissingCollaboratorsError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('community_guide_collaborators') ||
    lower.includes('create_community_guide_invite') ||
    lower.includes('accept_community_guide_invite') ||
    lower.includes('get_community_guide_invite') ||
    lower.includes('42p01') ||
    lower.includes('42883')
  )
}

export async function fetchCommunityGuideCollaborators(
  supabase: SupabaseClient,
  guideId: string,
): Promise<CommunityGuideCollaborator[]> {
  const { data, error } = await supabase
    .from('community_guide_collaborators')
    .select('*')
    .eq('guide_id', guideId)
    .in('status', ['pending', 'accepted'])
    .order('created_at', { ascending: true })

  if (error) {
    if (isMissingCollaboratorsError(error.message)) return []
    throw new Error(formatCommunityGuideError(error.message))
  }
  return (data ?? []).map((row) => normalizeCollaborator(row as Record<string, unknown>))
}

export async function fetchAcceptedCommunityGuideCollaborators(
  supabase: SupabaseClient,
  guideId: string,
): Promise<CommunityGuideCollaborator[]> {
  const { data, error } = await supabase
    .from('community_guide_collaborators')
    .select('*')
    .eq('guide_id', guideId)
    .eq('status', 'accepted')
    .order('accepted_at', { ascending: true })

  if (error) {
    if (isMissingCollaboratorsError(error.message)) return []
    throw new Error(formatCommunityGuideError(error.message))
  }
  return (data ?? []).map((row) => normalizeCollaborator(row as Record<string, unknown>))
}

export async function fetchCollaboratingGuideIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('community_guide_collaborators')
    .select('guide_id')
    .eq('user_id', userId)
    .eq('status', 'accepted')

  if (error) {
    if (isMissingCollaboratorsError(error.message)) return []
    throw new Error(formatCommunityGuideError(error.message))
  }
  return (data ?? []).map((row) => String((row as { guide_id: string }).guide_id))
}

export async function createCommunityGuideInvite(
  supabase: SupabaseClient,
  guideId: string,
  displayName?: string | null,
): Promise<CommunityGuideCollaborator> {
  const { data, error } = await supabase.rpc('create_community_guide_invite', {
    p_guide_id: guideId,
    p_display_name: displayName?.trim() || null,
  })

  if (error) {
    if (isMissingCollaboratorsError(error.message)) {
      throw new Error(
        'Collaborator invites are not available yet — the database migration may still be pending.',
      )
    }
    throw new Error(formatCommunityGuideError(error.message))
  }
  return normalizeCollaborator(data as Record<string, unknown>)
}

export async function revokeCommunityGuideCollaborator(
  supabase: SupabaseClient,
  collaboratorId: string,
): Promise<void> {
  const { error } = await supabase
    .from('community_guide_collaborators')
    .update({ status: 'revoked', invite_token: null })
    .eq('id', collaboratorId)

  if (error) throw new Error(formatCommunityGuideError(error.message))
}

export async function leaveCommunityGuideCollaboration(
  supabase: SupabaseClient,
  collaboratorId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('community_guide_collaborators')
    .update({ status: 'revoked', invite_token: null })
    .eq('id', collaboratorId)
    .eq('user_id', userId)

  if (error) throw new Error(formatCommunityGuideError(error.message))
}

export async function fetchCommunityGuideInvitePreview(
  supabase: SupabaseClient,
  token: string,
): Promise<CommunityGuideInvitePreview | null> {
  const { data, error } = await supabase.rpc('get_community_guide_invite', {
    p_token: token,
  })

  if (error) {
    if (isMissingCollaboratorsError(error.message)) {
      throw new Error(
        'Collaborator invites are not available yet — the database migration may still be pending.',
      )
    }
    throw new Error(formatCommunityGuideError(error.message))
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  const record = row as Record<string, unknown>
  return {
    id: String(record.id),
    guide_id: String(record.guide_id),
    guide_title: String(record.guide_title),
    guide_slug: String(record.guide_slug),
    author_name: String(record.author_name),
    status: String(record.status),
    invitee_display_name: String(record.invitee_display_name ?? ''),
  }
}

export async function acceptCommunityGuideInvite(
  supabase: SupabaseClient,
  token: string,
): Promise<CommunityGuideCollaborator> {
  const { data, error } = await supabase.rpc('accept_community_guide_invite', {
    p_token: token,
  })

  if (error) {
    if (isMissingCollaboratorsError(error.message)) {
      throw new Error(
        'Collaborator invites are not available yet — the database migration may still be pending.',
      )
    }
    throw new Error(formatCommunityGuideError(error.message))
  }
  return normalizeCollaborator(data as Record<string, unknown>)
}
