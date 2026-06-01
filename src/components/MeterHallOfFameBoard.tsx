import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { digimonPortraitUrl } from '../lib/digimonImage'
import { withInductionRanks, type MeterHallOfFameEntry } from '../lib/meterHallOfFame'
import { parseScoreColor } from '../lib/meterParseScoreColor'
import { meterPlayerProfilePath } from '../lib/meterPlayerProfile'
import {
  METER_ROLE_BUCKETS,
  METER_ROLE_BUCKET_LABELS,
  type MeterRoleBucket,
} from '../lib/meterRoleBuckets'

const GOLD = parseScoreColor(100)

function formatInt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function formatWhen(iso: string) {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function portraitForEntry(e: MeterHallOfFameEntry): string | undefined {
  if (e.portraitUrl?.trim()) return e.portraitUrl
  const iconId = e.iconId?.trim()
  if (iconId) return digimonPortraitUrl(iconId, e.digimonId, e.digimonName)
  return undefined
}

function roleClass(role: MeterRoleBucket): string {
  return `meter-hof-role-tag meter-hof-role-tag--${role}`
}

export function MeterHallOfFameBoard({
  dungeonName,
  difficultyLabel,
  dungeonId,
  difficultyId,
  goldByRole,
  loading,
  leaderboardHref,
}: {
  dungeonName: string
  difficultyLabel: string
  dungeonId: string
  difficultyId: number
  goldByRole: Record<MeterRoleBucket, MeterHallOfFameEntry[]>
  loading: boolean
  leaderboardHref: string
}) {
  const [roleFilter, setRoleFilter] = useState<MeterRoleBucket | 'all'>('all')

  const totalGold = useMemo(
    () => METER_ROLE_BUCKETS.reduce((n, b) => n + goldByRole[b].length, 0),
    [goldByRole],
  )

  const inductees = useMemo(() => {
    const pool =
      roleFilter === 'all'
        ? METER_ROLE_BUCKETS.flatMap((b) => goldByRole[b])
        : goldByRole[roleFilter]
    return withInductionRanks(pool)
  }, [goldByRole, roleFilter])

  const recordHolders = useMemo(() => {
    return METER_ROLE_BUCKETS.map((role) => {
      const entries = goldByRole[role]
      if (!entries.length) return null
      return entries.reduce((best, e) => (e.dps > best.dps ? e : best), entries[0]!)
    }).filter((e): e is MeterHallOfFameEntry => e != null)
  }, [goldByRole])

  const meterContext = { dungeonId, difficultyId }

  return (
    <div className="meter-hof-board">
      <header className="meter-hof-board__hero meter-parses-meter-chrome">
        <div className="meter-hof-board__hero-glow" aria-hidden />
        <div className="meter-hof-board__hero-inner">
          <p className="meter-hof-board__eyebrow">Hall of Fame</p>
          <h2 className="meter-hof-board__dungeon">
            {dungeonName}
            {difficultyLabel ? (
              <span className="meter-hof-board__dungeon-diff muted"> · {difficultyLabel}</span>
            ) : null}
          </h2>
          <p className="meter-hof-board__meta">
            <span className="meter-hof-board__stat">
              <strong style={{ color: GOLD }}>{loading ? '…' : formatInt(totalGold)}</strong> gold{' '}
              {totalGold === 1 ? 'parse' : 'parses'}
            </span>
          </p>
          <Link to={leaderboardHref} className="meter-hof-board__leaderboard-link">
            Current leaderboard →
          </Link>
        </div>
      </header>

      {recordHolders.length > 0 && !loading ? (
        <section
          className="meter-hof-podium meter-parses-meter-chrome"
          aria-label="Current record holders by role"
        >
          <h3 className="meter-hof-podium__title">Current Record Holders</h3>
          <ul className="meter-hof-podium__grid">
            {recordHolders.map((e) => {
              const portrait = portraitForEntry(e)
              return (
                <li key={e.roleBucket} className="meter-hof-podium__card">
                  <span className={roleClass(e.roleBucket)}>{e.roleLabel}</span>
                  <Link
                    to={meterPlayerProfilePath(e.playerKey)}
                    state={{ displayName: e.displayName, fromMeter: meterContext }}
                    className="meter-hof-podium__player"
                  >
                    {portrait ? (
                      <img className="meter-hof-podium__portrait" src={portrait} alt="" width={48} height={48} />
                    ) : (
                      <span className="meter-hof-podium__portrait meter-hof-podium__portrait--empty" aria-hidden />
                    )}
                    <span className="meter-hof-podium__name" style={{ color: GOLD }}>
                      {e.displayName}
                    </span>
                  </Link>
                  <span className="meter-hof-podium__digimon muted">
                    {e.digimonName.trim() || '\u00a0'}
                  </span>
                  <span className="meter-hof-podium__dps">{formatInt(e.dps)} DPS</span>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      <div className="meter-hof-board__filters" role="tablist" aria-label="Filter by role">
        <button
          type="button"
          role="tab"
          aria-selected={roleFilter === 'all'}
          className={`meter-hof-filter${roleFilter === 'all' ? ' meter-hof-filter--active' : ''}`}
          onClick={() => setRoleFilter('all')}
        >
          All roles
        </button>
        {METER_ROLE_BUCKETS.map((role) => (
          <button
            key={role}
            type="button"
            role="tab"
            aria-selected={roleFilter === role}
            className={`meter-hof-filter${roleFilter === role ? ' meter-hof-filter--active' : ''}`}
            onClick={() => setRoleFilter(role)}
          >
            {METER_ROLE_BUCKET_LABELS[role]}
            {goldByRole[role].length > 0 ? (
              <span className="meter-hof-filter__count">{goldByRole[role].length}</span>
            ) : null}
          </button>
        ))}
      </div>

      <section
        className={`meter-hof-table-wrap meter-parses-meter-chrome${roleFilter === 'all' ? ' meter-hof-table-wrap--all-roles' : ''}`}
        aria-label="Gold parse chronicle"
      >
        <div className="meter-hof-table__head">
          <span className="meter-hof-table__col meter-hof-table__col--rank">#</span>
          <span className="meter-hof-table__col meter-hof-table__col--player">Tamer</span>
          {roleFilter === 'all' ? (
            <span className="meter-hof-table__col meter-hof-table__col--role">Role</span>
          ) : null}
          <span className="meter-hof-table__col meter-hof-table__col--dps">DPS</span>
          <span className="meter-hof-table__col meter-hof-table__col--date">Inducted</span>
        </div>

        {loading ? (
          <p className="meter-hof-table__empty meter-parses-muted">Loading gold parses…</p>
        ) : inductees.length === 0 ? (
          <p className="meter-hof-table__empty meter-parses-muted">
            No gold parses yet for this dungeon. Be the first on the{' '}
            <Link to={leaderboardHref}>leaderboard</Link>.
          </p>
        ) : (
          <ol className="meter-hof-table meter-scroll--themed">
            {inductees.map((e, index) => {
              const portrait = portraitForEntry(e)
              const digimonLabel = e.digimonName.trim()
              const isLatest = index === 0
              return (
                <li
                  key={`${e.parseId}-${e.playerKey}-${e.achievedAt}`}
                  className={`meter-hof-table__row${isLatest ? ' meter-hof-table__row--latest' : ''}`}
                >
                  <span className="meter-hof-table__col meter-hof-table__col--rank">
                    <span
                      className="meter-hof-table__induction"
                      title={`#${e.induction} ${e.roleLabel} record break`}
                    >
                      {e.induction}
                    </span>
                    {isLatest ? (
                      <span className="meter-hof-table__new-badge" aria-label="Most recent">
                        New
                      </span>
                    ) : null}
                  </span>
                  <span className="meter-hof-table__col meter-hof-table__col--player">
                    <Link
                      to={meterPlayerProfilePath(e.playerKey)}
                      state={{ displayName: e.displayName, fromMeter: meterContext }}
                      className="meter-hof-table__player-link"
                    >
                      {portrait ? (
                        <img className="meter-hof-table__portrait" src={portrait} alt="" width={32} height={32} />
                      ) : (
                        <span className="meter-hof-table__portrait meter-hof-table__portrait--empty" aria-hidden />
                      )}
                      <span className="meter-hof-table__player-text">
                        <span className="meter-hof-table__name" style={{ color: GOLD }}>
                          {e.displayName}
                        </span>
                        {digimonLabel ? (
                          <span className="meter-hof-table__digimon muted">{digimonLabel}</span>
                        ) : null}
                      </span>
                    </Link>
                  </span>
                  {roleFilter === 'all' ? (
                    <span className={`meter-hof-table__col meter-hof-table__col--role ${roleClass(e.roleBucket)}`}>
                      {e.roleLabel}
                    </span>
                  ) : null}
                  <span className="meter-hof-table__col meter-hof-table__col--dps">
                    <span className="meter-hof-table__dps-value">{formatInt(e.dps)}</span>
                  </span>
                  <time className="meter-hof-table__col meter-hof-table__col--date muted" dateTime={e.achievedAt}>
                    {formatWhen(e.achievedAt)}
                  </time>
                </li>
              )
            })}
          </ol>
        )}
      </section>
    </div>
  )
}
