import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

function navLinkClass(isActive: boolean, extra = '') {
  return `nav-link${extra ? ` ${extra}` : ''}${isActive ? ' nav-link--active' : ''}`
}

export function Layout() {
  const { user, authReady, signOut, profileDisplayName, profileReady } = useAuth()
  const { pathname } = useLocation()

  const navUserLabel = profileDisplayName?.trim() || 'Account'
  const navUserInitial = navUserLabel.charAt(0).toUpperCase() || '?'
  const showAccountNav = authReady && user && profileReady
  const browseActive = pathname === '/' || pathname.startsWith('/digimon/')

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
        <nav className="nav" aria-label="Main">
          <NavLink to="/" end className={browseActive ? navLinkClass(true) : navLinkClass(false)}>
            Browse
          </NavLink>
          <NavLink to="/lab" className={({ isActive }) => navLinkClass(isActive)}>
            Lab
          </NavLink>
          <NavLink to="/gear" className={({ isActive }) => navLinkClass(isActive)}>
            Gear
          </NavLink>
          <NavLink to="/tier-list" className={({ isActive }) => navLinkClass(isActive)}>
            Tier List
          </NavLink>
          <NavLink to="/changes" className={({ isActive }) => navLinkClass(isActive)}>
            Changes
          </NavLink>
          <NavLink to="/meter-parses" className={({ isActive }) => navLinkClass(isActive)}>
            Meter
          </NavLink>
          <NavLink
            to="/companion"
            className={({ isActive }) =>
              `nav-link-companion${isActive ? ' nav-link-companion--active' : ''}`
            }
          >
            <span className="nav-link-companion__badge">App</span>
            Companion
          </NavLink>
          {showAccountNav ? (
            <div className="nav-user-cluster" role="group" aria-label="Signed in account">
              <span className="nav-user-pill">
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
            <NavLink to="/auth" className={({ isActive }) => navLinkClass(isActive, 'nav-sign-in')}>
              Sign in
            </NavLink>
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
