import { Link } from 'react-router-dom'

const PATHS = [
  {
    id: 'tools',
    label: 'Tools',
    title: 'Lab & gear',
    summary: 'Theorycraft DPS and gear for Digimon Odyssey.',
    to: '/lab',
    go: 'Open Lab',
  },
  {
    id: 'tier',
    label: 'Tier List',
    title: 'Role rankings',
    summary: 'DPS, tank, and healer tiers, plus published changes.',
    to: '/tier-list',
    go: 'Open Tier List',
  },
  {
    id: 'guides',
    label: 'Guides',
    title: 'Progression & guides',
    summary: 'Progression guide, player guides, patch notes, and dungeon loot.',
    to: '/guidebook',
    go: 'Open Guidebook',
  },
  {
    id: 'meter',
    label: 'Meter',
    title: 'Leaderboards & parses',
    summary: 'Compare clears, browse Hall of Fame, and review your uploads.',
    to: '/meter',
    go: 'Open Meter',
  },
  {
    id: 'companion',
    label: 'Companion',
    title: 'Desktop overlays',
    summary: 'In-game DPS meter, timelines, dungeons, and boss timers for Windows.',
    to: '/companion',
    go: 'Get Companion',
  },
] as const

export function HomePage() {
  return (
    <div className="home-page">
      <div className="home-page__inner">
        <section className="home-hero" aria-labelledby="home-brand-title">
          <div className="home-hero__brand">
            <img
              className="home-hero__logo"
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt=""
              width={68}
              height={68}
              decoding="async"
            />
            <h1 id="home-brand-title" className="home-hero__title">
              Odyssey Calc
            </h1>
          </div>
          <p className="home-hero__lead">
            Unofficial fan tools for Digimon Odyssey: digimon data, theorycrafting, meter, and
            guides in one place.
          </p>
          <div className="home-hero__ctas">
            <Link className="home-cta home-cta--primary" to="/digimon">
              Digimon
            </Link>
            <Link className="home-cta" to="/meter">
              Meter
            </Link>
            <Link className="home-cta" to="/companion">
              Companion
            </Link>
          </div>
        </section>

        <section className="home-paths" aria-label="Explore Odyssey Calc">
          {PATHS.map((path) => (
            <Link key={path.id} className="home-path" to={path.to}>
              <span className="home-path__label">{path.label}</span>
              <div className="home-path__copy">
                <h2 className="home-path__title">{path.title}</h2>
                <p className="home-path__summary">{path.summary}</p>
              </div>
              <span className="home-path__go">{path.go}</span>
            </Link>
          ))}
        </section>
      </div>
    </div>
  )
}
