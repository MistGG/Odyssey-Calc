import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'
import { AuthContext } from './authContext'
import {
  displayNameFromUserMetadata,
  ensureUserProfile,
} from './ensureUserProfile'
import { readPersistedAuthUser } from './readPersistedAuthUser'

const PROFILE_NAME_CACHE_PREFIX = 'odyssey-profile-display-name:'

function readCachedProfileName(userId: string): string | null {
  try {
    const name = sessionStorage.getItem(`${PROFILE_NAME_CACHE_PREFIX}${userId}`)?.trim()
    return name || null
  } catch {
    return null
  }
}

function writeCachedProfileName(userId: string, name: string): void {
  try {
    sessionStorage.setItem(`${PROFILE_NAME_CACHE_PREFIX}${userId}`, name)
  } catch {
    /* private mode / quota */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || ''

  const supabase = useMemo(() => {
    const url = supabaseUrl
    const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()
    if (!url || !key) return null
    return createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true },
      global: {
        headers: {
          'x-odyssey-client': 'odyssey-calc',
        },
      },
    })
  }, [supabaseUrl])

  const [user, setUser] = useState<User | null>(() => readPersistedAuthUser(supabaseUrl))
  // Sync storage read is enough for first-paint nav (Account vs Sign in). getSession
  // still validates/refreshes in the background.
  const [authReady, setAuthReady] = useState(true)
  const [profileDisplayName, setProfileDisplayName] = useState<string | null>(() => {
    const cachedUser = readPersistedAuthUser(supabaseUrl)
    if (!cachedUser?.id) return null
    return readCachedProfileName(cachedUser.id) ?? displayNameFromUserMetadata(cachedUser)
  })
  const [profileReady, setProfileReady] = useState(true)

  useEffect(() => {
    if (!supabase) {
      const id = window.setTimeout(() => {
        setUser(null)
        setAuthReady(true)
      }, 0)
      return () => window.clearTimeout(id)
    }
    let cancelled = false
    const adoptUser = (next: User | null) => {
      setUser((prev) => {
        // Keep a stable reference across token refresh / getSession so alt-tab
        // does not remount profile hooks that depend on `user`.
        if (prev?.id && next?.id && prev.id === next.id) return prev
        if (!prev && !next) return prev
        return next
      })
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        const sessionUser = data.session?.user ?? null
        adoptUser(sessionUser)
        setAuthReady(true)
        if (sessionUser) {
          void ensureUserProfile(supabase, sessionUser).then(({ error }) => {
            if (error && import.meta.env.DEV) {
              console.warn('[auth] ensureUserProfile (session):', error)
            }
          })
        }
      }
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      adoptUser(session?.user ?? null)
      setAuthReady(true)
      // Profile ensure on real sign-in / first session only — not every token refresh.
      const signedIn =
        session?.user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')
      if (signedIn && session.user) {
        void ensureUserProfile(supabase, session.user).then(({ error }) => {
          if (error && import.meta.env.DEV) {
            console.warn('[auth] ensureUserProfile:', error)
          }
        })
      }
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [supabase])

  const userId = user?.id ?? null

  useEffect(() => {
    if (!userId) {
      setProfileDisplayName(null)
      setProfileReady(true)
      return
    }
    const cached = readCachedProfileName(userId)
    const fromMeta = user ? displayNameFromUserMetadata(user) : null
    setProfileDisplayName((prev) => prev ?? cached ?? fromMeta ?? null)
    // Keep prior profileReady=true during refresh so the account pill does not
    // briefly fall back to "Sign in" while the profiles row loads.

    if (!supabase) {
      setProfileReady(true)
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', userId)
          .maybeSingle()
        if (cancelled) return
        if (error || !data) {
          setProfileDisplayName((prev) => prev ?? fromMeta ?? cached ?? null)
          return
        }
        const row = data as { display_name?: string | null }
        const trimmed = typeof row.display_name === 'string' ? row.display_name.trim() : ''
        const name = trimmed || fromMeta || cached || null
        setProfileDisplayName(name)
        if (name) writeCachedProfileName(userId, name)
      } finally {
        if (!cancelled) setProfileReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
    // userId only: same account must not re-fetch when the User object is replaced.
  }, [supabase, userId])

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!supabase) return { error: 'Supabase is not configured.' }
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (error) return { error: error.message }
      if (data.user) {
        const { error: profileErr } = await ensureUserProfile(supabase, data.user)
        if (profileErr) return { error: profileErr }
      }
      return { error: null }
    },
    [supabase],
  )

  const signUp = useCallback(
    async (email: string, password: string, displayName: string) => {
      if (!supabase) return { error: 'Supabase is not configured.' }
      const trimmedName = displayName.trim().slice(0, 64)
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: trimmedName || undefined } },
      })
      if (error) return { error: error.message }
      if (data.user) {
        const name = trimmedName || displayNameFromUserMetadata(data.user) || 'Player'
        writeCachedProfileName(data.user.id, name)
        setProfileDisplayName(name)
        // With email confirmation, signUp often has no session yet — RLS blocks client insert.
        // ensureUserProfile runs again on first sign-in / session (see onAuthStateChange).
        if (data.session?.user) {
          const { error: profileErr } = await ensureUserProfile(
            supabase,
            data.session.user,
            name,
          )
          if (profileErr) return { error: profileErr }
        }
      }
      return { error: null }
    },
    [supabase],
  )

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
  }, [supabase])

  const value = useMemo(
    () => ({
      supabase,
      user,
      profileDisplayName,
      profileReady,
      authReady,
      signIn,
      signUp,
      signOut,
    }),
    [supabase, user, profileDisplayName, profileReady, authReady, signIn, signUp, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
