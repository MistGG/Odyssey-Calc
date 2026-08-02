import { Navigate, useLocation } from 'react-router-dom'
import { readPasswordRecoveryFlag } from './normalizeAuthCallbackUrl'
import { useAuth } from './useAuth'

/** When a recovery session is active, always show the set-password form. */
export function PasswordRecoveryRedirect() {
  const { passwordRecovery } = useAuth()
  const { pathname } = useLocation()
  const inRecovery = passwordRecovery || readPasswordRecoveryFlag()

  if (!inRecovery || pathname === '/auth') return null
  return <Navigate to="/auth" replace />
}
