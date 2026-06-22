import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useSignedInMeterProfile } from '../hooks/useSignedInMeterProfile'
import { meterPlayerProfilePath } from '../lib/meterPlayerProfile'
import { NavMenuGroup } from './NavMenuGroup'
import { SiteFanFooter } from './SiteFanNotice'

function navLinkClass(isActive: boolean, extra = '') {
  return `nav-link${extra ? ` ${extra}` : ''}${isActive ? ' nav-link--active' : ''}`
}

export function Layout() {
  const { user, authReady, signOut, profileDisplayName, profileReady } = useAuth()
  const { identities: meterIdentities } = useSignedInMeterProfile()
  const { pathname } = useLocation()

  const navUserLabel = profileDisplayName?.trim() || 'Account'
  const navUserInitial = navUserLabel.charAt(0).toUpperCase() || '?'
  const showAccountNav = authReady && user && profileReady
  const meterProfileItems = meterIdentities.map((id) => ({
    to: meterPlayerProfilePath(id.playerKey),
    label: id.displayName,
    state: { ownProfile: true, displayName: id.displayName },
    isActive: (p: string) => p === meterPlayerProfilePath(id.playerKey),
  }))
  const singleMeterProfile = meterProfileItems.length === 1 ? meterProfileItems[0] : null
  const multipleMeterProfiles = meterProfileItems.length > 1
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

            <NavLink to="/dungeons" className={({ isActive }) => navLinkClass(isActive)}>
              Dungeons
            </NavLink>

            <NavLink
              to="/guidebook"
              className={({ isActive }) => navLinkClass(isActive, 'nav-link-guidebook')}
            >
              Guidebook
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

            <NavLink
              to="/event"
              className={({ isActive }) =>
                `nav-link-event nav-link--feat${isActive ? ' nav-link-event--active' : ''}`
              }
            >
              <span className="nav-link-event__badge">ON</span>
              Event
            </NavLink>

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
                className={`nav-user-cluster nav-user-cluster--compact${
                  multipleMeterProfiles ? ' nav-user-cluster--multi-profile' : ''
                }`}
                role="group"
                aria-label="Signed in account"
              >
                {multipleMeterProfiles ? (
                  <NavMenuGroup
                    triggerLabel={
                      <>
                        <span className="nav-user-avatar" aria-hidden>
                          {navUserInitial}
                        </span>
                        <span className="nav-user-name">{navUserLabel}</span>
                      </>
                    }
                    menuLabel="Your tamer profiles"
                    groupClassName="nav-user-profiles-menu"
                    triggerClassName="nav-user-pill-trigger"
                    items={meterProfileItems}
                  />
                ) : singleMeterProfile ? (
                  <Link
                    to={singleMeterProfile.to}
                    state={singleMeterProfile.state}
                    className="nav-user-pill nav-user-pill--link"
                    title="Your meter profile"
                  >
                    <span className="nav-user-avatar" aria-hidden>
                      {navUserInitial}
                    </span>
                    <span className="nav-user-name">{navUserLabel}</span>
                  </Link>
                ) : (
                  <span className="nav-user-pill">
                    <span className="nav-user-avatar" aria-hidden>
                      {navUserInitial}
                    </span>
                    <span className="nav-user-name">{navUserLabel}</span>
                  </span>
                )}
                <button type="button" className="nav-sign-out" onClick={() => void signOut()}>
                  Sign out
                </button>
              </div>
            ) : authReady ? (
              <NavLink
                to="/auth"
                className={({ isActive }) => navLinkClass(isActive, 'nav-sign-in')}
                title="Sign in to your Odyssey-Calc account (not the official game)"
              >
                Signin to Odyssey-Calc account
              </NavLink>
            ) : null}
          </div>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
      <SiteFanFooter />
    </div>
  )
}
