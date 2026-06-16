import { Link } from 'react-router-dom'
import { digimonPortraitUrl } from '../lib/digimonImage'
import type { ProfileHallOfFameEntry } from '../lib/meterHallOfFame'
import { parseScoreColor } from '../lib/meterParseScoreColor'

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

function portraitForEntry(e: ProfileHallOfFameEntry): string | undefined {
  if (e.portraitUrl?.trim()) return e.portraitUrl
  const iconId = e.iconId?.trim()
  if (iconId) return digimonPortraitUrl(iconId, e.digimonId, e.digimonName)
  return undefined
}

function roleClass(role: ProfileHallOfFameEntry['roleBucket']): string {
  return `meter-hof-role-tag meter-hof-role-tag--${role}`
}

function hallOfFameScopeTo(dungeonId: string, difficultyId: number, cycleId?: string) {
  const params = new URLSearchParams({
    dungeon: dungeonId,
    difficulty: String(difficultyId),
  })
  if (cycleId) params.set('cycle', cycleId)
  return {
    pathname: '/meter/hall-of-fame',
    search: `?${params.toString()}`,
  }
}

export function MeterProfileHofEntryList({
  entries,
  cycleId,
}: {
  entries: ProfileHallOfFameEntry[]
  cycleId?: string
}) {
  if (!entries.length) return null

  return (
    <ul className="meter-profile-hof__list meter-scroll--themed">
      {entries.map((e) => {
        const portrait = portraitForEntry(e)
        const digimonLabel = e.digimonName.trim()
        const diffClass = e.difficultyLabel.toLowerCase().includes('hard')
          ? 'meter-profile-hof__diff--hard'
          : e.difficultyLabel.toLowerCase().includes('normal')
            ? 'meter-profile-hof__diff--normal'
            : ''
        return (
          <li key={`${e.parseId}-${e.roleBucket}-${e.achievedAt}`} className="meter-profile-hof__row">
            <span
              className="meter-profile-hof__induction"
              title={`#${e.induction} ${e.roleLabel} record break`}
            >
              {e.induction}
            </span>
            <div className="meter-profile-hof__scope">
              <Link
                to={hallOfFameScopeTo(e.dungeonId, e.difficultyId, cycleId)}
                className="meter-profile-hof__dungeon"
              >
                {e.dungeonName}
              </Link>
              {e.difficultyLabel ? (
                <span className={`meter-profile-hof__diff ${diffClass}`}>{e.difficultyLabel}</span>
              ) : null}
              <span className={roleClass(e.roleBucket)}>{e.roleLabel}</span>
            </div>
            <div className="meter-profile-hof__build">
              {portrait ? (
                <img className="meter-profile-hof__portrait" src={portrait} alt="" width={36} height={36} />
              ) : (
                <span className="meter-profile-hof__portrait meter-profile-hof__portrait--empty" aria-hidden />
              )}
              <span className="meter-profile-hof__build-text">
                {digimonLabel ? <span className="meter-profile-hof__digimon">{digimonLabel}</span> : null}
                <span className="meter-profile-hof__dps" style={{ color: GOLD }}>
                  {formatInt(e.dps)} DPS
                </span>
              </span>
            </div>
            <time className="meter-profile-hof__when muted" dateTime={e.achievedAt}>
              {formatWhen(e.achievedAt)}
            </time>
          </li>
        )
      })}
    </ul>
  )
}
