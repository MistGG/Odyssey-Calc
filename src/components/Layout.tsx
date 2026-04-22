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
          <Link to="/lab">DPS lab</Link>
        </nav>
      </header>
      <main className="main">
        <Outlet />
      </main>
      <footer className="footer">
        <span>
          Wiki API (
          <a
            href="https://thedigitalodyssey.com/api/wiki/digimon"
            target="_blank"
            rel="noreferrer"
          >
            <code>/api/wiki/digimon</code>
          </a>
          ) — local dev uses a Vite proxy for the API. Portraits load from
          <code> /models/&#123;model_id&#125;l.png </code> on the site (override with{' '}
          <code>VITE_WIKI_SITE_ORIGIN</code> or <code>VITE_WIKI_DIGIMON_IMAGE_TEMPLATE</code>).
        </span>
      </footer>
    </div>
  )
}
