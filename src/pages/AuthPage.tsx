import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { safeReturnTo } from '../lib/safeReturnTo'

const OFFICIAL_GAME_URL = 'https://thedigitalodyssey.com/'
const LOGO_URL = `${import.meta.env.BASE_URL}logo.png`

function AuthDisclaimer() {
  return (
    <p className="auth-disclaimer">
      Fan-made site only. This login is for Odyssey Calc (tier list, meter, companion). It is not
      the official{' '}
      <a href={OFFICIAL_GAME_URL} target="_blank" rel="noreferrer noopener">
        Digital Odyssey
      </a>{' '}
      game website.
    </p>
  )
}

function AuthPageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <div className="auth-page">
        <header className="auth-brand">
          <img className="auth-brand__logo" src={LOGO_URL} alt="" width={52} height={52} decoding="async" />
          <div className="auth-brand__text">
            <p className="auth-brand__eyebrow">Odyssey Calc</p>
            <h1 className="auth-brand__title">Fan tools account</h1>
            <p className="auth-brand__tagline">Tier list · DPS meter · Companion</p>
          </div>
        </header>
        <div className="auth-card">{children}</div>
        <p className="auth-back">
          <Link to="/tier-list">Back to tier list</Link>
        </p>
      </div>
    </div>
  )
}

type Tab = 'login' | 'signup'

export function AuthPage() {
  const { supabase, user, signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const returnTo = safeReturnTo(searchParams.get('returnTo'))
  const [tab, setTab] = useState<Tab>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  if (user) {
    navigate(returnTo, { replace: true })
    return null
  }

  if (!supabase) {
    return (
      <AuthPageLayout>
        <div className="auth-corner auth-corner--tl" aria-hidden />
        <div className="auth-corner auth-corner--br" aria-hidden />
        <AuthDisclaimer />
        <p className="auth-hint">
          {import.meta.env.DEV ? (
            <>
              Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in{' '}
              <code>.env.local</code>, then restart <code>npm run dev</code>.
            </>
          ) : (
            <>
              This site build does not include Supabase credentials. Add repository secrets{' '}
              <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, then redeploy.
            </>
          )}
        </p>
      </AuthPageLayout>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setBusy(true)

    if (tab === 'login') {
      const { error: err } = await signIn(email, password)
      setBusy(false)
      if (err) {
        setError(err)
      } else {
        navigate(returnTo, { replace: true })
      }
    } else {
      if (!displayName.trim()) {
        setBusy(false)
        setError('Display name is required.')
        return
      }
      const { error: err } = await signUp(email, password, displayName)
      setBusy(false)
      if (err) {
        setError(
          /rate limit|too many requests|429/i.test(err)
            ? 'Too many sign-up emails sent recently. Wait about an hour and try again, or ask an admin to confirm your account manually.'
            : err,
        )
      } else {
        setSuccess('Account created! Check your email to confirm your address, then sign in.')
        setTab('login')
        setPassword('')
        setDisplayName('')
      }
    }
  }

  return (
    <AuthPageLayout>
      <div className="auth-corner auth-corner--tl" aria-hidden />
      <div className="auth-corner auth-corner--br" aria-hidden />
      <AuthDisclaimer />

      <div className="auth-tabs" role="tablist" aria-label="Sign in or create account">
        <button
          type="button"
          role="tab"
          className={`auth-tab${tab === 'login' ? ' auth-tab--active' : ''}`}
          aria-selected={tab === 'login'}
          onClick={() => {
            setTab('login')
            setError(null)
            setSuccess(null)
          }}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          className={`auth-tab${tab === 'signup' ? ' auth-tab--active' : ''}`}
          aria-selected={tab === 'signup'}
          onClick={() => {
            setTab('signup')
            setError(null)
            setSuccess(null)
          }}
        >
          Create account
        </button>
      </div>

      {success ? <p className="auth-success">{success}</p> : null}

      <form className="auth-form" onSubmit={(e) => void handleSubmit(e)}>
        {tab === 'signup' ? (
          <label className="auth-field">
            <span className="auth-label">Display name</span>
            <input
              type="text"
              autoComplete="nickname"
              maxLength={64}
              placeholder="Public name on tier list & meter"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              disabled={busy}
            />
            <span className="auth-field-hint muted">
              Shown on community tier list and meter. Not your in-game tamer name.
            </span>
          </label>
        ) : null}

        <label className="auth-field">
          <span className="auth-label">Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={busy}
          />
        </label>

        <label className="auth-field">
          <span className="auth-label">Password</span>
          <input
            type="password"
            autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={busy}
          />
          {tab === 'signup' ? (
            <span className="auth-field-hint muted">Choose a password for odyssey-calc.com only.</span>
          ) : null}
        </label>

        {error ? <p className="auth-error">{error}</p> : null}

        <button type="submit" className="auth-submit-btn" disabled={busy}>
          {busy
            ? tab === 'login'
              ? 'Signing in…'
              : 'Creating account…'
            : tab === 'login'
              ? 'Sign in'
              : 'Create account'}
        </button>
      </form>
    </AuthPageLayout>
  )
}
