import type { SupabaseClient, User } from '@supabase/supabase-js'

export type AuthContextValue = {
  supabase: SupabaseClient | null
  user: User | null
  /** From `profiles.display_name`; null until loaded or if missing. */
  profileDisplayName: string | null
  /** False while the profile row for the current user is still loading. */
  profileReady: boolean
  authReady: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}
