import type { SupabaseClient, User } from '@supabase/supabase-js'

export type AuthContextValue = {
  supabase: SupabaseClient | null
  user: User | null
  /** From `profiles.display_name` (set at sign-up in Odyssey Companion); null until loaded or if missing. */
  profileDisplayName: string | null
  authReady: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}
