import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth'

/** When a recovery session is active, always show the set-password form. */
export function PasswordRecoveryRedirect() {
  const { passwordRecovery } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => {
    if (!passwordRecovery) return
    if (pathname === '/auth') return
    navigate('/auth', { replace: true })
  }, [navigate, passwordRecovery, pathname])

  return null
}
