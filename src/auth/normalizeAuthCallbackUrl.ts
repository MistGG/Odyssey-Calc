const PASSWORD_RECOVERY_FLAG = 'odyssey-password-recovery'

export function markPasswordRecovery(): void {
  try {
    sessionStorage.setItem(PASSWORD_RECOVERY_FLAG, '1')
  } catch {
    /* private mode / quota */
  }
}

/**
 * Hash-router + Supabase implicit recovery links often produce:
 *   https://site/#/some-route#access_token=...&type=recovery
 * Browsers keep that whole fragment, so supabase-js cannot parse tokens and
 * React Router stays on /some-route. Rewrite to a single auth hash first.
 */
export function normalizeAuthCallbackUrl(): void {
  if (typeof window === 'undefined') return

  const rawHash = window.location.hash
  if (!rawHash || rawHash === '#') return

  const body = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash
  const secondHash = body.indexOf('#')
  const authQuery =
    secondHash >= 0
      ? body.slice(secondHash + 1)
      : body.includes('access_token=') || body.includes('refresh_token=')
        ? body
        : ''

  if (!authQuery) return

  const params = new URLSearchParams(authQuery)
  const type = params.get('type')
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  if (!accessToken || !refreshToken) return

  if (type === 'recovery') markPasswordRecovery()

  // Always flatten to a single supabase-parseable hash when tokens are present.
  const next = `${window.location.pathname}${window.location.search}#${authQuery}`
  if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== next) {
    window.history.replaceState(window.history.state, document.title, next)
  }
}
