import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { ForumTeaserTvPopup } from './ForumTeaserTvPopup'
import { NavMenuGroup } from './NavMenuGroup'

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
      <header className="header header--compact">
        <Link to="/" className="brand brand--compact">
          <img
            className="brand-logo"
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt=""
            width={36}
            height={36}
            decoding="async"
          />
          <span className="brand-text">Odyssey Calc</span>
        </Link>

        <div className="header__row">
          <div className="nav-scroll">
          <nav className="nav nav--primary" aria-label="Main">
            <NavLink to="/" end className={browseActive ? navLinkClass(true) : navLinkClass(false)}>
              Browse
            </NavLink>

            <NavMenuGroup
              triggerLabel="Lab"
              menuLabel="Lab menu"
              items={[
                { to: '/lab', label: 'Lab' },
                { to: '/gear', label: 'Gear' },
              ]}
            />

            <NavMenuGroup
              triggerLabel="Tier List"
              menuLabel="Tier list menu"
              items={[
                { to: '/tier-list', label: 'Tier List' },
                { to: '/changes', label: 'Changes' },
              ]}
            />

            <NavLink
              to="/meter"
              className={({ isActive }) =>
                navLinkClass(isActive || pathname.startsWith('/meter'))
              }
            >
              Meter
            </NavLink>

            <NavMenuGroup
              triggerLabel={
                <>
                  <span className="nav-link-event__badge">ON</span>
                  Event
                </>
              }
              menuLabel="Event menu"
              groupClassName="nav-menu--event"
              triggerClassName="nav-link-event nav-link--feat"
              items={[
                { to: '/event', label: 'Event' },
                { to: '/teasers', label: 'Teasers', className: 'nav-link-teasers' },
              ]}
            />

            <NavLink
              to="/companion"
              className={({ isActive }) =>
                `nav-link-companion nav-link--feat${isActive ? ' nav-link-companion--active' : ''}`
              }
            >
              <span className="nav-link-companion__badge">App</span>
              Companion
            </NavLink>

            <a
              className="nav-link-official"
              href="https://thedigitalodyssey.com/"
              target="_blank"
              rel="noreferrer noopener"
            >
              Official Site
            </a>
          </nav>
          </div>

          <div className="header__end">
            {showAccountNav ? (
              <div
                className="nav-user-cluster nav-user-cluster--compact"
                role="group"
                aria-label="Signed in account"
              >
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
          </div>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
      <ForumTeaserTvPopup />
    </div>
  )
}
