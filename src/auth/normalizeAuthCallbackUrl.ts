export const PASSWORD_RECOVERY_FLAG = 'odyssey-password-recovery'
const RECOVERY_SESSION_KEY = 'odyssey-recovery-session'

export type AuthCallbackTokens = {
  access_token: string
  refresh_token: string
  type: string | null
}

export function markPasswordRecovery(): void {
  try {
    sessionStorage.setItem(PASSWORD_RECOVERY_FLAG, '1')
  } catch {
    /* private mode / quota */
  }
}

export function clearPasswordRecoveryFlag(): void {
  try {
    sessionStorage.removeItem(PASSWORD_RECOVERY_FLAG)
  } catch {
    /* private mode / quota */
  }
}

export function readPasswordRecoveryFlag(): boolean {
  try {
    return sessionStorage.getItem(PASSWORD_RECOVERY_FLAG) === '1'
  } catch {
    return false
  }
}

export function stashRecoverySession(tokens: AuthCallbackTokens): void {
  try {
    sessionStorage.setItem(
      RECOVERY_SESSION_KEY,
      JSON.stringify({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      }),
    )
  } catch {
    /* private mode / quota */
  }
}

export function peekStashedRecoverySession(): {
  access_token: string
  refresh_token: string
} | null {
  try {
    const raw = sessionStorage.getItem(RECOVERY_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      access_token?: unknown
      refresh_token?: unknown
    }
    if (
      typeof parsed.access_token !== 'string' ||
      !parsed.access_token ||
      typeof parsed.refresh_token !== 'string' ||
      !parsed.refresh_token
    ) {
      return null
    }
    return {
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
    }
  } catch {
    return null
  }
}

export function clearStashedRecoverySession(): void {
  try {
    sessionStorage.removeItem(RECOVERY_SESSION_KEY)
  } catch {
    /* private mode / quota */
  }
}

/** @deprecated use peek + clear after successful setSession */
export function takeStashedRecoverySession(): {
  access_token: string
  refresh_token: string
} | null {
  const session = peekStashedRecoverySession()
  if (session) clearStashedRecoverySession()
  return session
}

/** Pull implicit-flow auth tokens out of a (possibly double) hash fragment. */
export function extractAuthCallbackTokens(
  rawHash = typeof window !== 'undefined' ? window.location.hash : '',
): AuthCallbackTokens | null {
  if (!rawHash || rawHash === '#') return null

  const body = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash
  const secondHash = body.indexOf('#')
  const authQuery =
    secondHash >= 0
      ? body.slice(secondHash + 1)
      : body.includes('access_token=')
        ? body
        : ''

  if (!authQuery || !authQuery.includes('access_token=')) return null

  const params = new URLSearchParams(authQuery)
  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')
  if (!access_token || !refresh_token) return null

  return {
    access_token,
    refresh_token,
    type: params.get('type'),
  }
}

/**
 * HashRouter + Supabase implicit recovery links often produce:
 *   https://site/#/some-route#access_token=...&type=recovery
 * or:
 *   https://site/#access_token=...&type=recovery
 *
 * HashRouter treats `#access_token=...` as an unknown route and the app catch-all
 * replaces it with `#/`, wiping tokens before supabase-js can read them.
 *
 * Stash tokens, mark recovery, and rewrite to `#/auth` before React mounts.
 */
export function normalizeAuthCallbackUrl(): AuthCallbackTokens | null {
  if (typeof window === 'undefined') return null

  const tokens = extractAuthCallbackTokens()
  if (!tokens) return null

  if (tokens.type === 'recovery') {
    markPasswordRecovery()
    stashRecoverySession(tokens)
  }

  const next = `${window.location.pathname}${window.location.search}#/auth`
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (current !== next) {
    window.history.replaceState(window.history.state, document.title, next)
  }

  return tokens
}
