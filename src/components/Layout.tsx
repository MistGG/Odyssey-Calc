import { Link, Outlet } from 'react-router-dom'

export function Layout() {
  return (
    <div className="layout app-shell">
      <div className="app-shell-bg" aria-hidden="true" />
      <header className="header">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-text">Odyssey Calc</span>
        </Link>
        <nav className="nav">
          <Link to="/">Browse</Link>
          <Link to="/lab">Lab</Link>
          <Link to="/tier-list">Tier list</Link>
          <Link to="/local">Local</Link>
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
      {import.meta.env.DEV && (
        <div className="dev-local-strip" role="status">
          <span>
            Local dev · wiki API proxied at <code>/api/wiki</code>
          </span>
          <Link to="/local">Run locally guide</Link>
        </div>
      )}
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
