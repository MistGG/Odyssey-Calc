import { useCallback, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MayClearEventLeaderboards } from '../components/MayClearEventLeaderboards'
import { useMayClearEventDungeon } from '../hooks/useMayClearEventDungeon'
import { useMayClearEventEnded } from '../hooks/useMayClearEventEnded'
import { mayClearEventSharePageUrl } from '../lib/eventShare'
import {
  areMayClearEventLeaderboardsLive,
  EVENT_DELAY_NOTICE,
  isMayClearEventDungeonAnnounced,
  mayClearEventDungeonFallback,
  shouldShowMayClearEventLeaderboards,
  MAY_CLEAR_EVENT,
  MAY_CLEAR_EVENT_ROLES,
  MAY_CLEAR_PARTICIPATION_ROLES,
  MAY_CLEAR_PARTICIPATION_TOTAL_CROWNS,
  MAY_CLEAR_TOTAL_CROWNS,
  MAY_CLEAR_TOTAL_SHOP_POINTS,
  mayClearEventMeterNavState,
} from '../lib/mayClearEvent'

export function MayClearEventPage() {
  const [searchParams] = useSearchParams()
  const previewEnded = searchParams.get('previewEnded') === '1'
  const eventEnded = useMayClearEventEnded(previewEnded)
  const dungeonAnnounced = isMayClearEventDungeonAnnounced()
  const leaderboardsLive = areMayClearEventLeaderboardsLive()
  const eventDungeon = useMayClearEventDungeon()
  const activeDungeon = eventDungeon ?? mayClearEventDungeonFallback()
  const showLeaderboards = shouldShowMayClearEventLeaderboards(activeDungeon)

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
    <div
      className={`event-page${showLeaderboards ? ' event-page--with-leaderboards' : ''}`}
    >
      <header className="event-hero">
        <div className="event-hero__glow" aria-hidden />
        <p className="event-hero__eyebrow">Community event</p>
        <h1 className="event-hero__title">{MAY_CLEAR_EVENT.eventTitle}</h1>
        <p className="event-hero__lead">
          {eventEnded && activeDungeon ? (
            <>
              The <strong>{activeDungeon.dungeonName}</strong> clear challenge has ended. See final
              leaderboard and participation draw winners below.
            </>
          ) : dungeonAnnounced && activeDungeon && leaderboardsLive ? (
            <>
              Clear <strong>{activeDungeon.dungeonName}</strong> on{' '}
              <strong>{MAY_CLEAR_EVENT.difficultyLabel}</strong> during the event window (
              <strong>{MAY_CLEAR_EVENT.eventWindowLabel}</strong>) and upload a dungeon party parse
              with Odyssey Companion. Leaderboards below update from live Meter uploads.
            </>
          ) : dungeonAnnounced && activeDungeon ? (
            <>
              The featured dungeon is <strong>{activeDungeon.dungeonName}</strong> on{' '}
              <strong>{MAY_CLEAR_EVENT.difficultyLabel}</strong>. The event window is{' '}
              <strong>{MAY_CLEAR_EVENT.eventWindowLabel}</strong>.{' '}
              <strong>{MAY_CLEAR_EVENT.difficultyLabel}</strong> is not live in-game yet. Live
              leaderboards open once it is available.
            </>
          ) : (
            <>
              Visit this page to see which dungeon is selected for the{' '}
              <strong>{MAY_CLEAR_EVENT.difficultyLabel}</strong> challenge during the event window (
              <strong>{MAY_CLEAR_EVENT.eventWindowLabel}</strong>).
            </>
          )}
        </p>
        <div className="event-hero__meta">
          <span className="event-pill event-pill--date">{MAY_CLEAR_EVENT.eventWindowLabel}</span>
          {dungeonAnnounced && activeDungeon ? (
            <span className="event-pill event-pill--dungeon">{activeDungeon.dungeonName}</span>
          ) : null}
          <span className="event-pill event-pill--diff">{MAY_CLEAR_EVENT.difficultyLabel}</span>
        </div>
        <div className="event-hero__actions">
          <Link
            className="event-cta event-cta--primary"
            to="/meter"
            state={mayClearEventMeterNavState(activeDungeon?.dungeonId)}
          >
            Visit Meter page
          </Link>
          <Link className="event-cta event-cta--ghost" to="/companion">
            About Odyssey Companion
          </Link>
          <button type="button" className="event-cta event-cta--ghost" onClick={copyShareLink}>
            {shareCopied ? 'Link copied!' : 'Share'}
          </button>
        </div>
      </header>

      {dungeonAnnounced && activeDungeon && !leaderboardsLive && !eventEnded ? (
        <section className="event-panel event-panel--note" aria-label="Event delay notice">
          <p className="event-placeholder-note" role="note">
            {EVENT_DELAY_NOTICE}
          </p>
        </section>
      ) : null}

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

      <section className="event-panel" aria-labelledby="event-participation-heading">
        <h2 id="event-participation-heading" className="event-section-title">
          Participation draw
        </h2>
        <p className="event-section-lead muted">
          One random winner per role among all eligible event uploads.{' '}
          <strong>{MAY_CLEAR_EVENT.participationPrizeCrownsPerRole} crowns</strong> each for a total of{' '}
          <strong>{MAY_CLEAR_PARTICIPATION_TOTAL_CROWNS.toLocaleString()} crowns</strong>. Everyone who
          participates with at least one eligible upload earns{' '}
          <strong>{MAY_CLEAR_EVENT.participationShopPointsAll} meter shop points</strong>.
        </p>
        <ul className="event-prize-grid">
          {MAY_CLEAR_PARTICIPATION_ROLES.map((role) => (
            <li key={role.id} className="event-prize-card event-prize-card--participation">
              <span className="event-prize-card__role">{role.label}</span>
              <span className="event-prize-card__amount">{role.prizeCrowns} crowns</span>
              <span className="event-prize-card__hint muted">Random draw · any valid parse</span>
            </li>
          ))}
        </ul>
      </section>

      {showLeaderboards ? <MayClearEventLeaderboards dungeon={activeDungeon} /> : null}

      <section className="event-panel" aria-labelledby="event-rules-heading">
        <h2 id="event-rules-heading" className="event-section-title">
          How it works
        </h2>
        <ol className="event-steps">
          <li>
            {dungeonAnnounced && activeDungeon ? (
              <>
                Run <strong>{activeDungeon.dungeonName}</strong> on{' '}
                <strong>{MAY_CLEAR_EVENT.difficultyLabel}</strong> during the event window (
                <strong>{MAY_CLEAR_EVENT.eventWindowLabel}</strong>).
              </>
            ) : (
              <>
                Run the announced dungeon on <strong>{MAY_CLEAR_EVENT.difficultyLabel}</strong> during
                the event window (<strong>{MAY_CLEAR_EVENT.eventWindowLabel}</strong>).
              </>
            )}
          </li>
          <li>
            Use <Link to="/companion">Odyssey Companion</Link> to record the party run and upload a{' '}
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
          <li>
            A separate <strong>random participation draw</strong> picks one eligible player per role
            for <strong>{MAY_CLEAR_EVENT.participationPrizeCrownsPerRole} crowns</strong> (independent of
            leaderboard placement).
          </li>
          <li>
            Every player with at least one eligible event upload receives{' '}
            <strong>{MAY_CLEAR_EVENT.participationShopPointsAll} meter shop points</strong>.
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
          {!leaderboardsLive ? (
            <>
              <li>
                Dragon Dimension <strong>Hard</strong> is not available in-game yet. Ranked uploads and
                live leaderboards begin once Hard goes live.
              </li>
              <li>
                If Hard is still unavailable by <strong>{MAY_CLEAR_EVENT.eventWindowLabel}</strong>,
                the event will be delayed further.
              </li>
            </>
          ) : null}
          <li>Exploits that are deemed as such by devs and patched will invalidate parses.</li>
        </ul>
      </section>
    </div>
  )
}
