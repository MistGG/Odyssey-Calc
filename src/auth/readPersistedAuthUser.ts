import type { User } from '@supabase/supabase-js'

/**
 * Sync read of the persisted Supabase session user for first paint.
 * Avoids flashing "Sign in" while getSession() is still resolving.
 */
export function readPersistedAuthUser(supabaseUrl: string | undefined | null): User | null {
  if (typeof window === 'undefined') return null
  const url = supabaseUrl?.trim()
  if (!url) return null

  try {
    const host = new URL(url).hostname
    const projectRef = host.split('.')[0]?.trim()
    if (!projectRef) return null

    const raw = window.localStorage.getItem(`sb-${projectRef}-auth-token`)
    if (!raw) return null

    const parsed = JSON.parse(raw) as {
      user?: User | null
      currentSession?: { user?: User | null } | null
    }
    const user = parsed?.user ?? parsed?.currentSession?.user ?? null
    if (!user || typeof user !== 'object' || typeof user.id !== 'string' || !user.id) {
      return null
    }
    return user
  } catch {
    return null
  }
}
