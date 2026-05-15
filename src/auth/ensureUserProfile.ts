import type { SupabaseClient, User } from '@supabase/supabase-js'

export function displayNameFromUserMetadata(user: User): string | null {
  const raw = user.user_metadata?.display_name
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed || null
}

function fallbackDisplayName(user: User): string {
  return displayNameFromUserMetadata(user) || 'Player'
}

/**
 * Ensure a `profiles` row exists for the signed-in user.
 * Inserts when missing; fills `display_name` only if the row has none.
 * Safe to call on every sign-in / session refresh (companion app may have created the row already).
 */
export async function ensureUserProfile(
  supabase: SupabaseClient,
  user: User,
  preferredName?: string,
): Promise<{ error: string | null }> {
  const name = (preferredName?.trim() || fallbackDisplayName(user)).slice(0, 64)

  const { data: existing, error: readErr } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle()

  if (readErr) {
    return { error: readErr.message }
  }

  if (!existing) {
    const { error: insertErr } = await supabase.from('profiles').insert({
      id: user.id,
      display_name: name,
    })
    return { error: insertErr?.message ?? null }
  }

  const current =
    typeof existing.display_name === 'string' ? existing.display_name.trim() : ''
  if (!current && name) {
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ display_name: name })
      .eq('id', user.id)
    return { error: updateErr?.message ?? null }
  }

  return { error: null }
}
