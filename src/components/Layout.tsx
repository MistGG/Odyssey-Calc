import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useSignedInMeterProfile } from '../hooks/useSignedInMeterProfile'
import { meterPlayerProfilePath } from '../lib/meterPlayerProfile'
import { NavMenuGroup } from './NavMenuGroup'
import { DigitalWorldBackdrop } from './DigitalWorldBackdrop'
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
  const digimonActive = pathname === '/digimon' || pathname.startsWith('/digimon/')
  const toolsActive = pathname.startsWith('/lab') || pathname.startsWith('/gear')
  const tierActive = pathname.startsWith('/tier-list') || pathname.startsWith('/changes')
  const guidesActive =
    pathname.startsWith('/guidebook') ||
    pathname.startsWith('/guides') ||
    pathname.startsWith('/patch-notes') ||
    pathname.startsWith('/dungeons')
  const promoActive = pathname === '/promo' || pathname.startsWith('/promo/')
  const shopActive =
    pathname.startsWith('/meter/shop') || pathname === '/meter/rewards'
  const meterActive =
    (pathname === '/meter' || pathname.startsWith('/meter/')) && !shopActive

  return (
    <div className="layout app-shell">
      <DigitalWorldBackdrop />
      <header className="header header--compact header--calm">
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
              <NavLink
                to="/promo"
                className={
                  promoActive
                    ? 'nav-link nav-link-promo nav-link-promo--active'
                    : 'nav-link nav-link-promo'
                }
              >
                Promo
                <span className="nav-link-promo__badge">New</span>
              </NavLink>

              <NavLink
                to="/digimon"
                className={digimonActive ? navLinkClass(true) : navLinkClass(false)}
              >
                Digimon
              </NavLink>

              <NavMenuGroup
                triggerLabel="Tools"
                menuLabel="Tools menu"
                groupClassName={toolsActive ? 'nav-menu--active' : undefined}
                items={[
                  { to: '/lab', label: 'Lab' },
                  { to: '/lab/rotation', label: 'Rotation analysis' },
                  { to: '/gear', label: 'Gear' },
                ]}
              />

              <NavMenuGroup
                triggerLabel="Tier List"
                menuLabel="Tier list menu"
                groupClassName={tierActive ? 'nav-menu--active' : undefined}
                items={[
                  { to: '/tier-list', label: 'Tier List' },
                  { to: '/changes', label: 'Changes' },
                ]}
              />

              <NavMenuGroup
                triggerLabel="Guides"
                menuLabel="Guides menu"
                groupClassName={guidesActive ? 'nav-menu--active' : undefined}
                items={[
                  {
                    to: '/guidebook',
                    label: 'Guidebook',
                    isActive: (p) => p === '/guidebook' || p.startsWith('/guidebook/'),
                  },
                  {
                    to: '/guides',
                    label: 'Community Guides',
                    isActive: (p) => p === '/guides' || p.startsWith('/guides/'),
                  },
                  {
                    to: '/patch-notes',
                    label: 'Patch Notes',
                    isActive: (p) => p === '/patch-notes' || p.startsWith('/patch-notes/'),
                  },
                  { to: '/dungeons', label: 'Dungeons' },
                ]}
              />

              <NavLink
                to="/meter"
                className={meterActive ? navLinkClass(true) : navLinkClass(false)}
              >
                Meter
              </NavLink>

              <NavMenuGroup
                triggerLabel="Shop"
                menuLabel="Shop menu"
                groupClassName={shopActive ? 'nav-menu--active' : undefined}
                items={[
                  {
                    to: '/meter/shop/bar-themes/common',
                    label: 'Theme shop',
                    end: false,
                    isActive: (p) => p.startsWith('/meter/shop'),
                  },
                  {
                    to: '/meter/rewards',
                    label: 'My rewards',
                    end: true,
                  },
                ]}
              />

              <NavLink to="/companion" className={({ isActive }) => navLinkClass(isActive)}>
                Companion
              </NavLink>
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
                Sign in
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
