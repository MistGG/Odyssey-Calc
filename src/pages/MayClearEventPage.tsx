import { useCallback, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EventExamonBackdrop } from '../components/EventExamonBackdrop'
import { EventExamonTeaser } from '../components/EventExamonTeaser'
import { MayClearEventLeaderboards } from '../components/MayClearEventLeaderboards'
import { useMayClearEventDungeon } from '../hooks/useMayClearEventDungeon'
import { useMayClearEventEnded } from '../hooks/useMayClearEventEnded'
import { mayClearEventSharePageUrl } from '../lib/eventShare'
import {
  areMayClearEventLeaderboardsLive,
  EVENT_DELAY_NOTICE,
  isMayClearEventDungeonAnnounced,
  isMayClearEventScheduleAnnounced,
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
  const previewLeaderboards = searchParams.get('previewLeaderboards') === '1'
  const eventEnded = useMayClearEventEnded(previewEnded)
  const dungeonAnnounced = isMayClearEventDungeonAnnounced()
  const scheduleAnnounced = isMayClearEventScheduleAnnounced()
  const leaderboardsLive = areMayClearEventLeaderboardsLive()
  const eventDungeon = useMayClearEventDungeon()
  const activeDungeon = eventDungeon ?? mayClearEventDungeonFallback()
  const showLeaderboards = shouldShowMayClearEventLeaderboards(activeDungeon, {
    previewLeaderboards,
  })

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
    <div className="event-examon">
      <EventExamonBackdrop />
      <div
        className={`event-page event-page--examon${showLeaderboards ? ' event-page--with-leaderboards' : ''} event-page--with-teaser`}
      >
        <header className="event-examon-hero">
          <div className="event-examon-hero__main">
            <div className="event-examon-hero__copy">
              <p className="event-examon-hero__eyebrow">
                <span className="event-examon-hero__sigil" aria-hidden />
                {MAY_CLEAR_EVENT.eventThemeLabel}
              </p>
              <h1 className="event-examon-hero__title">{MAY_CLEAR_EVENT.eventTitle}</h1>
              {dungeonAnnounced && activeDungeon ? (
                <p className="event-examon-hero__dungeon">
                  <span className="event-examon-hero__dungeon-name">{activeDungeon.dungeonName}</span>
                  <span className="event-examon-hero__dungeon-diff">{MAY_CLEAR_EVENT.difficultyLabel}</span>
                </p>
              ) : null}
              <p className="event-examon-hero__lead">
              {eventEnded && activeDungeon ? (
                <>The raid is over. Final standings and draw winners are locked in below.</>
              ) : !scheduleAnnounced && dungeonAnnounced && activeDungeon ? (
                <>
                  Featured dungeon: <strong>{activeDungeon.dungeonName}</strong> on{' '}
                  <strong>{MAY_CLEAR_EVENT.difficultyLabel}</strong>. The event is{' '}
                  <strong>delayed</strong>. Dates will be posted here once Hard goes live in-game.
                </>
              ) : dungeonAnnounced && activeDungeon && (leaderboardsLive || showLeaderboards) ? (
                <>
                  Clear <strong>{activeDungeon.dungeonName}</strong> on{' '}
                  <strong>{MAY_CLEAR_EVENT.difficultyLabel}</strong>, upload with Odyssey Companion,
                  and climb the role leaderboards
                  {scheduleAnnounced ? (
                    <>
                      {' '}
                      before <strong>{MAY_CLEAR_EVENT.eventEndUtcLabel}</strong>
                    </>
                  ) : null}
                  .
                </>
              ) : dungeonAnnounced && activeDungeon ? (
                <>
                  Featured dungeon: <strong>{activeDungeon.dungeonName}</strong> ·{' '}
                  <strong>{MAY_CLEAR_EVENT.difficultyLabel}</strong>. Leaderboards unlock once Hard
                  goes live in-game.
                </>
              ) : (
                <>
                  A community clear challenge. The dungeon reveal drops here before the window opens.
                </>
              )}
            </p>
            <div className="event-examon-hero__meta">
              <span
                className={`event-pill event-pill--date${scheduleAnnounced ? '' : ' event-pill--tbd'}`}
              >
                {MAY_CLEAR_EVENT.eventWindowLabel}
              </span>
              {dungeonAnnounced && activeDungeon ? (
                <span className="event-pill event-pill--dungeon">{activeDungeon.dungeonName}</span>
              ) : null}
              <span className="event-pill event-pill--diff">{MAY_CLEAR_EVENT.difficultyLabel}</span>
            </div>
            <div className="event-examon-hero__actions">
              <Link
                className="event-cta event-cta--primary"
                to="/meter"
                state={mayClearEventMeterNavState(activeDungeon?.dungeonId)}
              >
                Open Meter
              </Link>
              <Link className="event-cta event-cta--ghost" to="/companion">
                Get Companion
              </Link>
              <button type="button" className="event-cta event-cta--ghost" onClick={copyShareLink}>
                {shareCopied ? 'Copied!' : 'Share link'}
              </button>
            </div>
            </div>
            <EventExamonTeaser />
          </div>
        </header>

        {(dungeonAnnounced && activeDungeon && !eventEnded && !scheduleAnnounced) ||
        (dungeonAnnounced && activeDungeon && !leaderboardsLive && !eventEnded && !showLeaderboards) ? (
          <section className="event-panel event-panel--note event-panel--examon" aria-label="Event delay notice">
            <p className="event-placeholder-note" role="note">
              {EVENT_DELAY_NOTICE}
            </p>
          </section>
        ) : null}

        {showLeaderboards ? <MayClearEventLeaderboards dungeon={activeDungeon} /> : null}

        <div className="event-examon-grid">
          <section className="event-panel event-panel--examon event-panel--prizes" aria-labelledby="event-prizes-heading">
            <div className="event-panel__badge">Prize pool</div>
            <h2 id="event-prizes-heading" className="event-section-title">
              Role champions
            </h2>
            <p className="event-section-lead muted">
              Top DPS per role wins <strong>{MAY_CLEAR_EVENT.prizeCrownsPerRole} crowns</strong> +{' '}
              <strong>{MAY_CLEAR_EVENT.prizeShopPointsPerRole} shop points</strong>.{' '}
              <strong>{MAY_CLEAR_TOTAL_CROWNS.toLocaleString()} crowns</strong> and{' '}
              <strong>{MAY_CLEAR_TOTAL_SHOP_POINTS.toLocaleString()} shop points</strong> on the line.
            </p>
            <ul className="event-prize-grid">
              {MAY_CLEAR_EVENT_ROLES.map((role) => (
                <li key={role.id} className={`event-prize-card event-prize-card--role event-prize-card--${role.id}`}>
                  <span className="event-prize-card__role">{role.label}</span>
                  <span className="event-prize-card__amount">{role.prizeCrowns}</span>
                  <span className="event-prize-card__unit">crowns</span>
                  <span className="event-prize-card__bonus">+ {role.prizeShopPoints} shop pts</span>
                </li>
              ))}
            </ul>
            <p className="event-section-foot muted">
              Spend shop points in the <Link to="/meter/rewards">meter theme shop</Link>.
            </p>
          </section>

          <section
            className="event-panel event-panel--examon event-panel--participation"
            aria-labelledby="event-participation-heading"
          >
            <div className="event-panel__badge event-panel__badge--violet">Lucky draw</div>
            <h2 id="event-participation-heading" className="event-section-title">
              Participation raffle
            </h2>
            <p className="event-section-lead muted">
              One random winner per role wins{' '}
              <strong>{MAY_CLEAR_EVENT.participationPrizeCrownsPerRole} crowns + {MAY_CLEAR_EVENT.participationShopPointsAll} shop points</strong>{' '}
              each (
              <strong>{MAY_CLEAR_PARTICIPATION_TOTAL_CROWNS.toLocaleString()} crowns</strong> total in
              the draw).
            </p>
            <ul className="event-prize-grid event-prize-grid--compact">
              {MAY_CLEAR_PARTICIPATION_ROLES.map((role) => (
                <li
                  key={role.id}
                  className="event-prize-card event-prize-card--participation event-prize-card--draw"
                >
                  <span className="event-prize-card__role">{role.label}</span>
                  <span className="event-prize-card__amount">{role.prizeCrowns}</span>
                  <span className="event-prize-card__unit">crowns</span>
                  <span className="event-prize-card__bonus">+ {role.prizeShopPoints} shop pts</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="event-panel event-panel--examon" aria-labelledby="event-rules-heading">
          <h2 id="event-rules-heading" className="event-section-title">
            How to compete
          </h2>
          <ol className="event-steps event-steps--examon">
            <li>
              {dungeonAnnounced && activeDungeon ? (
                scheduleAnnounced ? (
                  <>
                    Run <strong>{activeDungeon.dungeonName}</strong> on{' '}
                    <strong>{MAY_CLEAR_EVENT.difficultyLabel}</strong> during{' '}
                    <strong>{MAY_CLEAR_EVENT.eventWindowLabel}</strong>.
                  </>
                ) : (
                  <>
                    Run <strong>{activeDungeon.dungeonName}</strong> on{' '}
                    <strong>{MAY_CLEAR_EVENT.difficultyLabel}</strong> during the announced event
                    window (dates TBD).
                  </>
                )
              ) : (
                <>
                  Run the announced dungeon on <strong>{MAY_CLEAR_EVENT.difficultyLabel}</strong> during
                  the event window.
                </>
              )}
            </li>
            <li>
              Record with <Link to="/companion">Odyssey Companion</Link> and upload a party parse.
            </li>
            <li>Climb the role boards: Melee, Ranged, Caster, Hybrid, Tank, Healer.</li>
            <li>
              #1 in each role takes <strong>{MAY_CLEAR_EVENT.prizeCrownsPerRole} crowns</strong> +{' '}
              <strong>{MAY_CLEAR_EVENT.prizeShopPointsPerRole} shop points</strong>.
            </li>
          </ol>
        </section>

        <section className="event-panel event-panel--examon event-panel--note" aria-labelledby="event-note-heading">
          <h2 id="event-note-heading" className="event-section-title">
            Rules
          </h2>
          <ul className="event-notes muted">
            <li>Community-run via Odyssey Calc, not an official game page.</li>
            <li>Valid dungeon party parses only; broken sessions may be excluded.</li>
            <li>Role Champions are not eligible for the lucky draw.</li>
            {scheduleAnnounced ? (
              <li>
                Only uploads from <strong>{MAY_CLEAR_EVENT.eventWindowLabel}</strong> count (opens{' '}
                <strong>June 25, 2026 00:00 UTC</strong>; closes{' '}
                <strong>{MAY_CLEAR_EVENT.eventEndUtcLabel}</strong>).
              </li>
            ) : null}
            {!leaderboardsLive ? (
              <>
                <li>
                  Dragon Dimension <strong>Hard</strong> isn&apos;t live yet. Boards open when it is.
                </li>
                {!scheduleAnnounced ? (
                  <li>Event dates are TBD and will be announced here.</li>
                ) : (
                  <li>Event may extend if Hard is still unavailable at window end.</li>
                )}
              </>
            ) : null}
            <li>Exploits patched by devs can void affected parses.</li>
          </ul>
        </section>
      </div>
    </div>
  )
}
