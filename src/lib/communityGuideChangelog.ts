import type { SupabaseClient } from '@supabase/supabase-js'
import { formatCommunityGuideError } from './communityGuides'

export type CommunityGuideChangelogEntry = {
  id: string
  guide_id: string
  editor_id: string | null
  editor_name: string
  summary: string
  created_at: string
}

function normalizeChangelogEntry(row: Record<string, unknown>): CommunityGuideChangelogEntry {
  return {
    id: String(row.id),
    guide_id: String(row.guide_id),
    editor_id: row.editor_id == null ? null : String(row.editor_id),
    editor_name: String(row.editor_name ?? 'Player'),
    summary: String(row.summary ?? ''),
    created_at: String(row.created_at),
  }
}

function isMissingChangelogError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('community_guide_changelog') ||
    lower.includes('42p01') ||
    (lower.includes('relation') && lower.includes('does not exist'))
  )
}

export async function fetchCommunityGuideChangelog(
  supabase: SupabaseClient,
  guideId: string,
): Promise<CommunityGuideChangelogEntry[]> {
  const { data, error } = await supabase
    .from('community_guide_changelog')
    .select('*')
    .eq('guide_id', guideId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    if (isMissingChangelogError(error.message)) return []
    throw new Error(formatCommunityGuideError(error.message))
  }
  return (data ?? []).map((row) => normalizeChangelogEntry(row as Record<string, unknown>))
}

export async function appendCommunityGuideChangelog(
  supabase: SupabaseClient,
  input: {
    guideId: string
    editorId: string
    editorName: string
    summary: string
  },
): Promise<CommunityGuideChangelogEntry | null> {
  const summary = input.summary.trim().slice(0, 280)
  if (!summary) return null

  const { data, error } = await supabase
    .from('community_guide_changelog')
    .insert({
      guide_id: input.guideId,
      editor_id: input.editorId,
      editor_name: input.editorName.trim().slice(0, 64) || 'Player',
      summary,
    })
    .select('*')
    .single()

  if (error) {
    if (isMissingChangelogError(error.message)) return null
    throw new Error(formatCommunityGuideError(error.message))
  }
  return normalizeChangelogEntry(data as Record<string, unknown>)
}
