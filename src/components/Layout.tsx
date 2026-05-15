import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

export function Layout() {
  const { user, authReady, signOut, profileDisplayName } = useAuth()

  const navUserLabel =
    profileDisplayName?.trim() || user?.email?.split('@')[0] || 'Account'
  const navUserInitial = navUserLabel.charAt(0).toUpperCase() || '?'
  const navUserTitle = user?.email ?? undefined

  return (
    <div className="layout app-shell">
      <div className="app-shell-bg" aria-hidden="true" />
      <header className="header">
        <Link to="/" className="brand">
          <img
            className="brand-logo"
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt=""
            width={44}
            height={44}
            decoding="async"
          />
          <span className="brand-text">Odyssey Calc</span>
        </Link>
        <nav className="nav">
          <Link to="/">Browse</Link>
          <Link to="/lab">Lab</Link>
          <Link to="/gear">Gear</Link>
          <Link to="/tier-list">Tier list</Link>
          <Link to="/changes">Changes</Link>
          <Link to="/meter-parses">Meter</Link>
          {authReady && user ? (
            <div className="nav-user-cluster" role="group" aria-label="Signed in account">
              <span className="nav-user-pill" title={navUserTitle}>
                <span className="nav-user-avatar" aria-hidden>
                  {navUserInitial}
                </span>
                <span className="nav-user-name">{navUserLabel}</span>
              </span>
              <button type="button" className="nav-sign-out" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          ) : authReady ? (
            <Link to="/auth" className="nav-sign-in">
              Sign in
            </Link>
          ) : null}
          <a
            className="nav-link-official"
            href="https://thedigitalodyssey.com/"
            target="_blank"
            rel="noreferrer noopener"
          >
            Official Site
          </a>
        </nav>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
