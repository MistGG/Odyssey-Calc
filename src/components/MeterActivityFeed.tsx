import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { digimonPortraitUrl } from '../lib/digimonImage'
import {
  formatActivityTimeAgo,
  memberParsePercentile,
  type ActivityFeedScopePools,
  type MeterActivityFeedItem,
  type MeterActivityFeedMember,
} from '../lib/meterActivityFeed'
import { meterPlayerProfilePath } from '../lib/meterPlayerProfile'
import { parseScoreColor } from '../lib/meterParseScoreColor'

function formatInt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function formatDuration(sec: number) {
  if (!Number.isFinite(sec) || sec <= 0) return ''
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  if (m <= 0) return `${s}s`
  return `${m}m ${s}s`
}

function tamerInitial(name: string): string {
  const ch = name.trim().charAt(0)
  return ch ? ch.toUpperCase() : '?'
}

function portraitForMember(member: MeterActivityFeedMember): string | undefined {
  if (member.portraitUrl?.trim()) return member.portraitUrl
  const iconId = member.iconId?.trim()
  if (iconId) return digimonPortraitUrl(iconId, member.digimonId, member.digimonName)
  return undefined
}

function FeedMemberRow({
  member,
  item,
  poolsByScope,
  highlight,
}: {
  member: MeterActivityFeedMember
  item: MeterActivityFeedItem
  poolsByScope: ActivityFeedScopePools
  highlight?: boolean
}) {
  const portrait = portraitForMember(member)
  const pct = memberParsePercentile(member, item, poolsByScope)
  const color = pct != null ? parseScoreColor(pct) : undefined
  const meterContext = { dungeonId: item.dungeonId, difficultyId: item.difficultyId }

  return (
    <li className={`meter-activity-member${highlight ? ' meter-activity-member--mvp' : ''}`}>
      <Link
        to={meterPlayerProfilePath(member.playerKey)}
        state={{ displayName: member.tamerName, fromMeter: meterContext }}
        className="meter-activity-member__player"
      >
        {portrait ? (
          <img className="meter-activity-member__portrait" src={portrait} alt="" width={40} height={40} />
        ) : (
          <span className="meter-activity-member__portrait meter-activity-member__portrait--fallback">
            {tamerInitial(member.tamerName)}
          </span>
        )}
        <span className="meter-activity-member__meta">
          <span className="meter-activity-member__name">{member.tamerName}</span>
          <span className="meter-activity-member__digimon-row">
            <span className="meter-activity-member__digimon">{member.digimonName}</span>
            <span className="meter-activity-member__role-tag">{member.roleLabel}</span>
          </span>
        </span>
      </Link>
      <span
        className="meter-activity-member__dps"
        style={color ? { color } : undefined}
        title={pct != null ? `${pct} parse score` : undefined}
      >
        {formatInt(member.dps)}
      </span>
    </li>
  )
}

function ActivityFeedCard({
  item,
  poolsByScope,
  isNew,
}: {
  item: MeterActivityFeedItem
  poolsByScope: ActivityFeedScopePools
  isNew?: boolean
}) {
  const duration = formatDuration(item.durationSec)
  const diffClass = item.difficultyLabel.trim().toLowerCase().includes('hard')
    ? 'meter-activity-pill--diff-hard'
    : item.difficultyLabel.trim().toLowerCase().includes('normal')
      ? 'meter-activity-pill--diff-normal'
      : ''
  const leaderboardTo = {
    pathname: '/meter/leaderboard',
    search: `?dungeon=${encodeURIComponent(item.dungeonId)}&difficulty=${item.difficultyId}`,
    state: { dungeonId: item.dungeonId, difficultyId: item.difficultyId },
  }

  return (
    <article className={`meter-activity-card${isNew ? ' meter-activity-card--new' : ''}`}>
      <header className="meter-activity-card__head">
        <div className="meter-activity-card__scope">
          <div className="meter-activity-card__dungeon-row">
            <h2 className="meter-activity-card__dungeon">{item.dungeonName}</h2>
          </div>
          <div className="meter-activity-card__pills">
            {item.difficultyLabel ? (
              <span className={`meter-activity-pill meter-activity-pill--diff ${diffClass}`}>
                {item.difficultyLabel}
              </span>
            ) : null}
            <span className="meter-activity-pill">{item.partySize} players</span>
          </div>
        </div>
        {duration ? <span className="meter-activity-card__duration-watermark">Total Time: {duration}</span> : null}
        <time className="meter-activity-card__time" dateTime={item.createdAt}>
          {formatActivityTimeAgo(item.createdAt)}
        </time>
      </header>

      <ol className="meter-activity-members">
        {item.members.map((member, index) => (
          <FeedMemberRow
            key={`${item.parseId}-${member.playerKey}-${index}`}
            member={member}
            item={item}
            poolsByScope={poolsByScope}
            highlight={index === 0}
          />
        ))}
      </ol>

      <footer className="meter-activity-card__foot">
        <Link to={leaderboardTo} className="meter-activity-card__leaderboard-link">
          View leaderboard →
        </Link>
      </footer>
    </article>
  )
}

export function MeterActivityFeed({
  items,
  poolsByScope,
  loading,
  refreshing,
}: {
  items: MeterActivityFeedItem[]
  poolsByScope: ActivityFeedScopePools
  loading: boolean
  refreshing: boolean
}) {
  const [newItemIds, setNewItemIds] = useState<Set<string>>(() => new Set())
  const seenIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!items.length) return
    const prev = seenIdsRef.current
    if (!prev.size) {
      seenIdsRef.current = new Set(items.map((i) => i.parseId))
      return
    }

    const incoming = items.filter((i) => !prev.has(i.parseId)).map((i) => i.parseId)
    seenIdsRef.current = new Set(items.map((i) => i.parseId))
    if (!incoming.length) return

    setNewItemIds((current) => {
      const next = new Set(current)
      for (const id of incoming) next.add(id)
      return next
    })

    const timer = window.setTimeout(() => {
      setNewItemIds((current) => {
        const next = new Set(current)
        for (const id of incoming) next.delete(id)
        return next
      })
    }, 2800)
    return () => window.clearTimeout(timer)
  }, [items])

  if (loading && !items.length) {
    return <p className="meter-parses-muted meter-parses-muted--center">Loading recent clears…</p>
  }

  if (!items.length) {
    return (
      <p className="meter-parses-muted meter-parses-muted--center">
        No recent dungeon party uploads yet. Install{' '}
        <Link to="/companion">Odyssey Companion</Link> and upload a clear to appear here.
      </p>
    )
  }

  return (
    <div className={`meter-activity-feed${refreshing ? ' meter-activity-feed--refreshing' : ''}`}>
      <div className="meter-activity-feed__status" role="status">
        {refreshing ? 'Updating feed…' : `${items.length} most recent clears`}
      </div>
      <div className="meter-activity-feed__list">
        {items.map((item) => (
          <ActivityFeedCard
            key={item.parseId}
            item={item}
            poolsByScope={poolsByScope}
            isNew={newItemIds.has(item.parseId)}
          />
        ))}
      </div>
    </div>
  )
}
