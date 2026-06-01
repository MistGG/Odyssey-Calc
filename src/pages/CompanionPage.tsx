import { Link } from 'react-router-dom'

const COMPANION_RELEASES_URL = 'https://github.com/MistGG/Odyssey-Companion/releases/latest'

const FEATURES = [
  {
    id: 'meter',
    icon: '◈',
    title: 'DPS meter',
    summary: 'Live damage and skill breakdown. Upload sessions to Meter on this site.',
  },
  {
    id: 'timeline',
    icon: '▷',
    title: 'Fight timeline',
    summary: 'See a timeline of boss skill uses.',
  },
  {
    id: 'dungeons',
    icon: '⬡',
    title: 'Dungeon browser',
    summary:
      'Find the latest dungeons, search by loot or boss name, and find drop rates for each instance.',
  },
  {
    id: 'timers',
    icon: '◷',
    title: 'Boss timers',
    summary: 'Spawn tracking with toast and sound alerts.',
  },
  {
    id: 'hotkeys',
    icon: '⌨',
    title: 'Global hotkeys',
    summary: 'Control overlays while the game is focused.',
  },
  {
    id: 'account',
    icon: '☁',
    title: 'Shared account',
    summary: 'Same login as Odyssey Calc for cloud meter history.',
  },
] as const

export function CompanionPage() {
  return (
    <div className="companion-page">
      <header className="companion-hero">
        <div className="companion-hero__glow" aria-hidden />
        <p className="companion-hero__eyebrow">Windows desktop app</p>
        <h1 className="companion-hero__title">Odyssey Companion</h1>
        <p className="companion-hero__lead">
          Overlays for Digimon Odyssey: DPS meter, fight timelines, dungeon reference, and boss spawn
          timers. Runs on top of the game while you play.
        </p>
        <div className="companion-hero__actions">
          <a
            className="companion-cta companion-cta--primary"
            href={COMPANION_RELEASES_URL}
            target="_blank"
            rel="noreferrer noopener"
          >
            Download companion from GitHub
          </a>
          <Link className="companion-cta companion-cta--ghost" to="/meter">
            View meter leaderboards
          </Link>
        </div>
        <p className="companion-hero__disclaimer">
          Third-party Windows app from GitHub (MistGG/Odyssey-Companion). Not the official game
          installer or Digital Odyssey login. Auto-updates from GitHub releases.
        </p>
      </header>

      <section className="companion-features" aria-labelledby="companion-features-heading">
        <h2 id="companion-features-heading" className="companion-section-title">
          Features
        </h2>
        <ul className="companion-feature-grid">
          {FEATURES.map((f) => (
            <li key={f.id} className="companion-feature-card">
              <span className="companion-feature-card__icon" aria-hidden>
                {f.icon}
              </span>
              <h3 className="companion-feature-card__title">{f.title}</h3>
              <p className="companion-feature-card__summary">{f.summary}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="companion-flow" aria-labelledby="companion-flow-heading">
        <h2 id="companion-flow-heading" className="companion-section-title">
          {'DPS parses ingame -> Website statistics'}
        </h2>
        <ol className="companion-flow__steps">
          <li>
            <span className="companion-flow__step-num">1</span>
            <div>
              <strong>Track</strong>
              <p className="muted">Run the meter overlay during a fight.</p>
            </div>
          </li>
          <li>
            <span className="companion-flow__step-num">2</span>
            <div>
              <strong>Upload</strong>
              <p className="muted">Sign in in Companion settings, then upload your session.</p>
            </div>
          </li>
          <li>
            <span className="companion-flow__step-num">3</span>
            <div>
              <strong>Review</strong>
              <p className="muted">
                Open <Link to="/meter/my-parses">My Parses</Link> here with the same account.
              </p>
            </div>
          </li>
        </ol>
      </section>

      <section className="companion-download" aria-labelledby="companion-download-heading">
        <div className="companion-download__card">
          <h2 id="companion-download-heading" className="companion-download__title">
            Get Odyssey Companion
          </h2>
          <p className="companion-download__text muted">
            Install from GitHub, then use the tray icon for settings, meter, timeline, dungeons, or
            boss timers.
          </p>
          <a
            className="companion-cta companion-cta--primary"
            href={COMPANION_RELEASES_URL}
            target="_blank"
            rel="noreferrer noopener"
          >
            Open releases on GitHub
          </a>
        </div>
      </section>
    </div>
  )
}
