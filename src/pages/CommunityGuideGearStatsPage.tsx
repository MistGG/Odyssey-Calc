import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { GearStatsGuidePanel } from '../components/communityGuides/GearStatsGuidePanel'
import { pinnedCommunityGuide } from '../lib/communityGuidePinned'
import {
  communityGuideShareUrl,
  copyCommunityGuideShareLink,
} from '../lib/communityGuides'

export function CommunityGuideGearStatsPage() {
  const guide = pinnedCommunityGuide('gear-stats')
  const [shareCopied, setShareCopied] = useState(false)
  const [shareLinkVisible, setShareLinkVisible] = useState(false)

  const shareUrl = useMemo(
    () => (guide ? communityGuideShareUrl(guide.slug) : ''),
    [guide],
  )

  const onCopyShareLink = useCallback(async () => {
    if (!guide) return
    setShareLinkVisible(true)
    const ok = await copyCommunityGuideShareLink(guide.slug)
    if (ok) {
      setShareCopied(true)
      window.setTimeout(() => setShareCopied(false), 2000)
    }
  }, [guide])

  if (!guide) return null

  return (
    <article className="community-guides-page community-guides-detail community-guides-detail--pinned">
      <div className="community-guides-detail__shell">
        <div className="community-guides-detail__toolbar">
          <Link to="/guides" className="community-guides-detail__back">
            ← All guides
          </Link>
          <div className="community-guides-detail__toolbar-actions">
            <button
              type="button"
              className="community-guides-btn community-guides-btn--ghost community-guides-detail__tool"
              onClick={() => void onCopyShareLink()}
            >
              {shareCopied ? 'Link copied' : 'Copy share link'}
            </button>
          </div>
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

        {shareLinkVisible ? (
          <div className="community-guides-detail__share">
            <span className="community-guides-detail__share-label">Share link</span>
            <a href={shareUrl} className="community-guides-detail__share-url">
              {shareUrl}
            </a>
          </div>
        ) : null}

        <section className="community-guides-detail__content" aria-label="Gear stats reference">
          <GearStatsGuidePanel />
        </section>
      </div>
    </article>
  )
}
