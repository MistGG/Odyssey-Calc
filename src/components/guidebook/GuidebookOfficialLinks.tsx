import {
  OFFICIAL_HEROES_GUIDE_URL,
  OFFICIAL_ZERO_TO_HERO_GUIDE_URL,
} from '../../lib/guidebookProgression'

const LINKS = [
  {
    title: 'Official Guide',
    description: 'Digital Odyssey guide for new heroes: tamer basics and core systems.',
    href: OFFICIAL_HEROES_GUIDE_URL,
  },
  {
    title: 'Zero to Hero Guide',
    description: 'Step-by-step progression from a fresh account through mid game.',
    href: OFFICIAL_ZERO_TO_HERO_GUIDE_URL,
  },
] as const

export function GuidebookOfficialLinks() {
  return (
    <section className="guidebook-official" aria-label="Official guides">
      <ul className="guidebook-official__grid">
        {LINKS.map((link) => (
          <li key={link.href}>
            <a className="guidebook-official__card" href={link.href} target="_blank" rel="noreferrer">
              <span className="guidebook-official__card-title">{link.title}</span>
              <span className="guidebook-official__card-desc">{link.description}</span>
              <span className="guidebook-official__card-cta">Open guide ↗</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
