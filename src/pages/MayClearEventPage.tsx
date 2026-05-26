import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { ForumTeaserEventEmbed } from '../components/ForumTeaserEventEmbed'
import { mayClearEventSharePageUrl } from '../lib/eventShare'
import {
  EVENT_ANNOUNCEMENT_NOTE,
  MAY_CLEAR_EVENT,
  MAY_CLEAR_EVENT_ROLES,
  MAY_CLEAR_TOTAL_CROWNS,
  MAY_CLEAR_TOTAL_SHOP_POINTS,
} from '../lib/mayClearEvent'

export function MayClearEventPage() {
  const [shareCopied, setShareCopied] = useState(false)
  const shareUrl = mayClearEventSharePageUrl()

  const copyShareLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setShareCopied(true)
      window.setTimeout(() => setShareCopied(false), 2000)
    } catch {
      setShareCopied(false)
    }
  }, [shareUrl])

  return (
    <div className="event-page event-page--with-teaser">
      <header className="event-hero">
        <div className="event-hero__glow" aria-hidden />
        <p className="event-hero__eyebrow">Community event</p>
        <h1 className="event-hero__title">{MAY_CLEAR_EVENT.eventTitle}</h1>
        <p className="event-hero__lead">
          Visit this page starting May 29 to see which dungeon is selected for the Hard challenge.
          The event runs through June 5.
        </p>
        <div className="event-hero__meta">
          <span className="event-pill event-pill--date">{MAY_CLEAR_EVENT.eventDateLabel}</span>
          <span className="event-pill event-pill--diff">{MAY_CLEAR_EVENT.difficultyLabel}</span>
        </div>
        <div className="event-hero__actions">
          <Link className="event-cta event-cta--primary" to="/meter">
            Visit Meter page
          </Link>
          <a
            className="event-cta event-cta--ghost"
            href="https://github.com/MistGG/Odyssey-Companion/releases/latest"
            target="_blank"
            rel="noreferrer noopener"
          >
            Get Odyssey Companion
          </a>
          <button type="button" className="event-cta event-cta--ghost" onClick={copyShareLink}>
            {shareCopied ? 'Link copied!' : 'Share'}
          </button>
        </div>
      </header>

      <section className="event-panel" aria-labelledby="event-prizes-heading">
        <h2 id="event-prizes-heading" className="event-section-title">
          Prizes
        </h2>
        <p className="event-section-lead muted">
          <strong>{MAY_CLEAR_EVENT.prizeCrownsPerRole} crowns</strong> and{' '}
          <strong>{MAY_CLEAR_EVENT.prizeShopPointsPerRole} meter shop points</strong> for the top player in
          each role.{' '}
          <strong>{MAY_CLEAR_TOTAL_CROWNS.toLocaleString()} crowns</strong> and{' '}
          <strong>{MAY_CLEAR_TOTAL_SHOP_POINTS.toLocaleString()} shop points</strong> total across{' '}
          {MAY_CLEAR_EVENT_ROLES.length} roles.
        </p>
        <ul className="event-prize-grid">
          {MAY_CLEAR_EVENT_ROLES.map((role) => (
            <li key={role.id} className="event-prize-card">
              <span className="event-prize-card__role">{role.label}</span>
              <span className="event-prize-card__amount">{role.prizeCrowns} crowns</span>
              <span className="event-prize-card__bonus">
                + {role.prizeShopPoints} shop points
              </span>
              <span className="event-prize-card__hint muted">Top parse · Best DPS</span>
            </li>
          ))}
        </ul>
        <p className="event-section-foot muted">
          Shop points are for the <Link to="/meter/rewards">meter theme shop</Link>.
        </p>
      </section>

      <section className="event-panel event-panel--teaser" aria-label="Event announcement">
        <p className="event-placeholder-note" role="note">
          {EVENT_ANNOUNCEMENT_NOTE}
        </p>
        <ForumTeaserEventEmbed />
      </section>

      <section className="event-panel" aria-labelledby="event-rules-heading">
        <h2 id="event-rules-heading" className="event-section-title">
          How it works
        </h2>
        <ol className="event-steps">
          <li>
            Run the announced dungeon during <strong>{MAY_CLEAR_EVENT.eventDateLabel}</strong>.
          </li>
          <li>
            Use <strong>Odyssey Companion</strong> to record the party run and upload a{' '}
            <strong>dungeon party</strong> parse to the cloud.
          </li>
          <li>
            Leaderboards on <Link to="/meter">Meter</Link> rank players by role (Melee, Ranged, Caster,
            Hybrid, Tank, Healer) for that dungeon and difficulty.
          </li>
          <li>
            The <strong>#1 player in each role</strong> by Best DPS wins{' '}
            <strong>{MAY_CLEAR_EVENT.prizeCrownsPerRole} crowns</strong> and{' '}
            <strong>{MAY_CLEAR_EVENT.prizeShopPointsPerRole} meter shop points</strong>.
          </li>
        </ol>
      </section>

      <section className="event-panel event-panel--note" aria-labelledby="event-note-heading">
        <h2 id="event-note-heading" className="event-section-title">
          Notes
        </h2>
        <ul className="event-notes muted">
          <li>Event is community-run via Odyssey Calc.</li>
          <li>Uploads must be valid dungeon party parses.</li>
          <li>Broken meter sessions may be excluded from rankings.</li>
          <li>Exploits that are deemed as such by devs and patched will invalidate parses.</li>
        </ul>
      </section>
    </div>
  )
}
