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

function displayNameFromUserMetadata(user: User): string | null {
  const raw = user.user_metadata?.display_name
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed || null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => {
    const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
    const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()
    if (!url || !key) return null
    return createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  }, [])

  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [profileDisplayName, setProfileDisplayName] = useState<string | null>(null)
  const [profileReady, setProfileReady] = useState(false)

  useEffect(() => {
    if (!supabase) {
      const id = window.setTimeout(() => {
        setUser(null)
        setAuthReady(true)
      }, 0)
      return () => window.clearTimeout(id)
    }
    let cancelled = false
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setUser(data.session?.user ?? null)
        setAuthReady(true)
      }
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [supabase])

  useEffect(() => {
    if (!user?.id) {
      setProfileDisplayName(null)
      setProfileReady(true)
      return
    }
    const uid = user.id
    const cached = readCachedProfileName(uid)
    const fromMeta = displayNameFromUserMetadata(user)
    setProfileDisplayName(cached ?? fromMeta ?? null)
    setProfileReady(false)

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
          .eq('id', uid)
          .maybeSingle()
        if (cancelled) return
        if (error || !data) {
          setProfileDisplayName(fromMeta ?? cached ?? null)
          return
        }
        const row = data as { display_name?: string | null }
        const trimmed = typeof row.display_name === 'string' ? row.display_name.trim() : ''
        const name = trimmed || fromMeta || cached || null
        setProfileDisplayName(name)
        if (name) writeCachedProfileName(uid, name)
      } finally {
        if (!cancelled) setProfileReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [supabase, user])

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!supabase) return { error: 'Supabase is not configured.' }
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      return { error: error?.message ?? null }
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
        await supabase
          .from('profiles')
          .upsert({ id: data.user.id, display_name: name }, { onConflict: 'id' })
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
