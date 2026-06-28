import { Link } from 'react-router-dom'
import { GearStatsGuidePanel } from '../components/communityGuides/GearStatsGuidePanel'
import { pinnedCommunityGuide } from '../lib/communityGuidePinned'

export function CommunityGuideGearStatsPage() {
  const guide = pinnedCommunityGuide('gear-stats')
  if (!guide) return null

  return (
    <article className="community-guides-page community-guides-detail community-guides-detail--pinned">
      <div className="community-guides-detail__shell">
        <div className="community-guides-detail__toolbar">
          <Link to="/guides" className="community-guides-detail__back">
            ← All guides
          </Link>
        </div>

        <header className="community-guides-detail__header">
          <div className="community-guides-detail__pinned-row">
            <span className="community-guides-pinned-badge">Pinned</span>
          </div>
          <h1 className="community-guides-detail__title">{guide.title}</h1>
          <p className="community-guides-detail__byline">
            by <span className="community-guides-detail__author-name">{guide.authorName}</span>
            <span className="community-guides-detail__byline-sep" aria-hidden>
              ·
            </span>
            <span>Always up-to-date</span>
          </p>
          <p className="community-guides-detail__pinned-lead muted">{guide.description}</p>
        </header>

        <section className="community-guides-detail__content" aria-label="Gear stats reference">
          <GearStatsGuidePanel />
        </section>
      </div>
    </article>
  )
}
