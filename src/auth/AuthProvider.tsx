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
    if (!supabase || !user?.id) {
      setProfileDisplayName(null)
      return
    }
    const uid = user.id
    let cancelled = false
    void supabase
      .from('profiles')
      .select('display_name')
      .eq('id', uid)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data) {
          setProfileDisplayName(null)
          return
        }
        const row = data as { display_name?: string | null }
        const trimmed = typeof row.display_name === 'string' ? row.display_name.trim() : ''
        setProfileDisplayName(trimmed || null)
      })
    return () => {
      cancelled = true
    }
  }, [supabase, user?.id])

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

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
  }, [supabase])

  const value = useMemo(
    () => ({ supabase, user, profileDisplayName, authReady, signIn, signOut }),
    [supabase, user, profileDisplayName, authReady, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
