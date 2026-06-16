import { Link } from 'react-router-dom'
import { MeterProfileHallOfFameBadge, type MeterProfileHofBadgeVariant } from './MeterProfileHallOfFameBadge'
import { digimonPortraitUrl } from '../lib/digimonImage'
import { parseScoreColor, dpsToPercentile } from '../lib/meterPublicStats'
import type { PlayerFavoriteDigimon } from '../lib/meterPlayerProfile'

function formatInt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function tamerInitial(name: string): string {
  const ch = name.trim().charAt(0)
  return ch ? ch.toUpperCase() : '?'
}

export function MeterPlayerProfileCard({
  displayName,
  favoriteDigimon,
  peakDps,
  peakDpsPool,
  bestEntryCount,
  dungeonCount,
  loading,
  loadProgress,
  currentSeasonBadge,
  favoriteDigimonCycleLabel,
  statsCycleLabel,
  hallOfFameLoading,
  backTo,
}: {
  displayName: string
  favoriteDigimon: PlayerFavoriteDigimon | null
  peakDps: number
  peakDpsPool: number[]
  bestEntryCount: number
  dungeonCount: number
  loading: boolean
  loadProgress: { done: number; total: number } | null
  currentSeasonBadge: {
    variant: MeterProfileHofBadgeVariant
    recordCount: number
    cycleShortLabel: string
  } | null
  favoriteDigimonCycleLabel: string
  statsCycleLabel: string
  hallOfFameLoading: boolean
  backTo: { pathname: string; state?: unknown }
}) {
  const favoritePortrait = favoriteDigimon
    ? favoriteDigimon.portraitUrl?.trim() ||
      digimonPortraitUrl(
        favoriteDigimon.iconId ?? '',
        favoriteDigimon.digimonId,
        favoriteDigimon.digimonName,
      )
    : undefined

  const peakPct = peakDps > 0 ? dpsToPercentile(peakDps, peakDpsPool) : null
  const peakColor = peakPct != null ? parseScoreColor(peakPct) : undefined
  const progressPct =
    loadProgress && loadProgress.total > 0
      ? Math.round((loadProgress.done / loadProgress.total) * 100)
      : 0

  return (
    <article className="meter-profile-card meter-parses-meter-chrome">
      <div className="meter-profile-card__toolbar">
        <Link to={backTo} className="meter-profile-card__back">
          <span className="meter-profile-card__back-icon" aria-hidden>
            ←
          </span>
          Leaderboard
        </Link>
        <span className="meter-profile-card__badge">Public profile</span>
      </div>

      <div className={`meter-profile-card__body${loading ? ' meter-profile-card__body--loading' : ''}`}>
        <div className="meter-profile-card__hero">
          <div className="meter-profile-card__portrait-wrap">
            <div className="meter-profile-card__portrait-ring" aria-hidden>
              {favoritePortrait ? (
                <img className="meter-profile-card__portrait" src={favoritePortrait} alt="" />
              ) : (
                <span className="meter-profile-card__portrait-fallback">{tamerInitial(displayName)}</span>
              )}
            </div>
          </div>
        </div>

        <div className="meter-profile-card__identity">
          <p className="meter-profile-card__eyebrow">Tamer</p>
          <h2 className="meter-profile-card__name">{displayName}</h2>

          {!hallOfFameLoading && currentSeasonBadge && currentSeasonBadge.recordCount > 0 ? (
            <div className="meter-profile-card__hof-badges">
              <MeterProfileHallOfFameBadge
                variant={currentSeasonBadge.variant}
                recordCount={currentSeasonBadge.recordCount}
                cycleShortLabel={currentSeasonBadge.cycleShortLabel}
                scrollToRecordBreaks
              />
            </div>
          ) : null}
        </div>

        <div className="meter-profile-card__stats-wrap">
          <p className="meter-profile-card__stats-cycle">{statsCycleLabel}</p>
          <dl className="meter-profile-card__stats" aria-label={`${statsCycleLabel} stats`}>
          <div className="meter-profile-card__stat">
            <dt>Peak DPS</dt>
            <dd style={peakColor ? { color: peakColor } : undefined}>
              {loading && peakDps <= 0 ? '—' : formatInt(peakDps)}
            </dd>
          </div>
          <div className="meter-profile-card__stat">
            <dt>Best entries</dt>
            <dd>{loading && bestEntryCount === 0 ? '—' : bestEntryCount}</dd>
          </div>
          <div className="meter-profile-card__stat">
            <dt>Dungeons</dt>
            <dd>{loading && dungeonCount === 0 ? '—' : dungeonCount}</dd>
          </div>
        </dl>
        </div>

        <div className="meter-profile-card__favorite">
          <span className="meter-profile-card__favorite-label">Favorite digimon</span>
          {favoriteDigimon ? (
            <div className="meter-profile-card__favorite-body">
              {favoritePortrait ? (
                <img
                  className="meter-profile-card__favorite-icon"
                  src={favoritePortrait}
                  alt=""
                  width={32}
                  height={32}
                />
              ) : (
                <span className="meter-party-portrait meter-party-portrait--empty" aria-hidden />
              )}
              <div className="meter-profile-card__favorite-text">
                <span className="meter-profile-card__favorite-name">{favoriteDigimon.digimonName}</span>
                <span className="meter-profile-card__favorite-meta">
                  Top DPS in {favoriteDigimon.parseCount} parse
                  {favoriteDigimon.parseCount === 1 ? '' : 's'} · {favoriteDigimonCycleLabel}
                </span>
              </div>
            </div>
          ) : (
            <span className="meter-profile-card__favorite-empty">
              {loading ? 'Loading…' : 'No parse data yet'}
            </span>
          )}
        </div>
      </div>

      {loading && loadProgress ? (
        <div className="meter-profile-card__progress" role="status">
          <div className="meter-profile-card__progress-track" aria-hidden>
            <span
              className="meter-profile-card__progress-fill"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="meter-profile-card__progress-label">
            Loading dungeons {loadProgress.done}/{loadProgress.total}
          </span>
        </div>
      ) : null}
    </article>
  )
}
