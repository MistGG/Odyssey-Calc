import type { SupabaseClient } from '@supabase/supabase-js'

/** Attach anonymous companion uploads (isSelf) to the signed-in account. */
export async function claimAnonymousMeterParsesForTamer(
  client: SupabaseClient,
  tamerName: string,
): Promise<{ claimed: number; error: string | null }> {
  const name = tamerName.trim()
  if (!name) return { claimed: 0, error: null }

  const { data, error } = await client.rpc('claim_anonymous_meter_parses_for_tamer', {
    p_tamer_name: name,
  })

  if (error) return { claimed: 0, error: error.message }

  const claimed = typeof data === 'number' ? data : Number(data) || 0
  return { claimed, error: null }
}

export function selfTamerNameFromParsePayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const members = (payload as { members?: unknown }).members
  if (!Array.isArray(members)) return null
  for (const raw of members) {
    if (!raw || typeof raw !== 'object') continue
    const member = raw as { isSelf?: boolean; tamerName?: string; displayLabel?: string }
    if (!member.isSelf) continue
    const name = member.tamerName?.trim() || member.displayLabel?.trim()
    if (name) return name
  }
  return null
}
