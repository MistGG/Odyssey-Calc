import { Link } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'

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
      <PageHeader
        className="companion-page-header"
        kicker="Windows desktop app"
        title="Odyssey Companion"
        lead="Overlays for Digimon Odyssey: DPS meter, fight timelines, dungeon reference, and boss spawn timers. Runs on top of the game while you play."
        actions={
          <a
            className="companion-cta companion-cta--primary"
            href={COMPANION_RELEASES_URL}
            target="_blank"
            rel="noreferrer noopener"
          >
            Download from GitHub
          </a>
        }
      />
      <p className="companion-page__disclaimer muted">
        Third-party Windows app from GitHub (MistGG/Odyssey-Companion). Not the official game
        installer or Digital Odyssey login. Auto-updates from GitHub releases.
      </p>

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
          DPS parses in-game → website statistics
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
    </div>
  )
}
