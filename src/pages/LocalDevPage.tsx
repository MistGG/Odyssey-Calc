import { Link } from 'react-router-dom'

/**
 * Visible at /#/local — how to run the calculator on your machine with the wiki API proxy.
 */
export function LocalDevPage() {
  const dev = import.meta.env.DEV
  return (
    <div className="browse local-dev-page">
      <h1>Run locally</h1>
      <p className="muted">
        Odyssey Calc reads Digimon data from the Digital Odyssey wiki API. In{' '}
        <strong>development</strong>, Vite proxies <code>/api/wiki</code> so your browser never hits CORS.
        Production builds use a configurable API base instead.
      </p>

      {dev ? (
        <p className="local-dev-banner local-dev-banner-on">
          You are on <strong>localhost</strong> — wiki calls go through the Vite dev proxy.
        </p>
      ) : (
        <p className="local-dev-banner local-dev-banner-off">
          This preview is served from static hosting. To use the wiki proxy below, clone the repo and run{' '}
          <code>npm run dev</code>.
        </p>
      )}

      <section className="section">
        <h2>Quick start</h2>
        <ol className="local-dev-steps">
          <li>
            Clone the repo and install: <code>npm ci</code>
          </li>
          <li>
            Start the dev server: <code>npm run dev</code>
          </li>
          <li>
            Open the URL shown in the terminal (often{' '}
            <a href="http://localhost:5173/">http://localhost:5173/</a>).
          </li>
        </ol>
      </section>

      <section className="section">
        <h2>Wiki API proxy (dev)</h2>
        <p>
          <code>vite.config.ts</code> proxies <code>/api/wiki/*</code> to{' '}
          <code>thedigitalodyssey.com</code>. The app defaults to <code>WIKI_API_BASE = /api/wiki</code> when{' '}
          <code>import.meta.env.DEV</code> is true — see <code>src/config/env.ts</code>.
        </p>
      </section>

      <section className="section">
        <h2>Production / GitHub Pages</h2>
        <p>
          Deployment sets <code>VITE_BASE_PATH</code> and <code>VITE_WIKI_API_BASE</code> in CI (see{' '}
          <code>.github/workflows/deploy-pages.yml</code>). Hash routing (<code>/#/…</code>) avoids server
          rewrite issues on static hosts.
        </p>
      </section>

      <p className="lab-cta">
        <Link to="/">← Browse Digimon</Link>
      </p>
    </div>
  )
}
