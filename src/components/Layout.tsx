import { Link, Outlet } from 'react-router-dom'

export function Layout() {
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
