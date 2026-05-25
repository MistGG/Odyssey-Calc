import { useCallback, useState } from 'react'
import { MeterDungeonPartyReplay } from './MeterDungeonPartyReplay'
import {
  dungeonFromPayload,
  isExcludedFromLeaderboardParseRow,
  isInvalidMeterPartyParseRow,
  partyMembersFromPayload,
  raidTotalFromPayload,
  sessionDurationFromPayload,
} from '../lib/meterParsePayload'
import { getPublicDungeonParsesCached } from '../lib/meterDataSource'
import { meterScopeKey } from '../lib/meterParseCache'
import { memberDpsInParse, normalizePlayerKey } from '../lib/meterRoleBuckets'
import type { PublicMeterParseRow } from '../lib/meterPublicStats'

function formatFixed(n: number, digits: number) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function MeterPlayerParseSessions({
  rows,
  profilePlayerKey,
  digimonRoleById,
}: {
  rows: PublicMeterParseRow[]
  profilePlayerKey: string
  digimonRoleById: Map<string, string>
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  const [publicRowsByScope, setPublicRowsByScope] = useState<Record<string, PublicMeterParseRow[]>>({})

  const ensurePublicRowsForParse = useCallback(async (row: PublicMeterParseRow) => {
    const dungeon = dungeonFromPayload(row.payload)
    const dungeonId = row.dungeon_id?.trim() || dungeon?.dungeonId?.trim() || ''
    const difficultyId = row.difficulty_id ?? dungeon?.difficultyId
    if (!dungeonId || difficultyId == null || difficultyId < 2) return
    const key = meterScopeKey(dungeonId, difficultyId)
    let alreadyLoaded = false
    setPublicRowsByScope((prev) => {
      alreadyLoaded = Boolean(prev[key])
      return prev
    })
    if (alreadyLoaded) return
    const pub = await getPublicDungeonParsesCached({ dungeonId, difficultyId })
    if (pub.error) return
    setPublicRowsByScope((prev) => (prev[key] ? prev : { ...prev, [key]: pub.rows }))
  }, [])

  if (rows.length === 0) {
    return <p className="meter-parses-muted">No recent parses in this dataset.</p>
  }

  return (
    <ul className="meter-parses-overview meter-parses-overview--dungeon">
      {rows.map((row) => {
        const dungeon = dungeonFromPayload(row.payload)
        const members = partyMembersFromPayload(row.payload)
        const profileMember = members.find((m) => normalizePlayerKey(m) === profilePlayerKey)
        const title =
          row.dungeon_name?.trim() ||
          dungeon?.dungeonName?.trim() ||
          row.dungeon_id ||
          dungeon?.dungeonId ||
          'Dungeon'
        const diff =
          row.difficulty?.trim() ||
          dungeon?.difficulty?.trim() ||
          (row.difficulty_id === 3 ? 'Hard' : row.difficulty_id === 2 ? 'Normal' : '')
        const bosses = dungeon?.bossTargets ?? []
        const bossLine = bosses.length ? bosses.join(', ') : ''
        const outcome =
          dungeon?.runOutcome === 'clear' ? 'Clear' : dungeon?.runOutcome === 'fail' ? 'Fail' : ''
        const invalid = isInvalidMeterPartyParseRow(row)
        const unranked = !invalid && isExcludedFromLeaderboardParseRow(row)
        const raidTotal = raidTotalFromPayload(row.payload, members)
        const sessionDur = sessionDurationFromPayload(row.payload, row.duration_sec, members)
        const raidDps = sessionDur > 0 ? raidTotal / sessionDur : 0
        const playerDps = profileMember
          ? memberDpsInParse(profileMember, row.payload, row.duration_sec, members)
          : 0
        const open = expandedIds.has(row.id)

        return (
          <li
            key={row.id}
            className={`meter-parses-session meter-parses-session--dungeon${open ? ' meter-parses-session--open' : ''}`}
          >
            <button
              type="button"
              className="meter-parses-session-toggle"
              onClick={() => {
                setExpandedIds((prev) => {
                  const next = new Set(prev)
                  if (next.has(row.id)) next.delete(row.id)
                  else {
                    next.add(row.id)
                    void ensurePublicRowsForParse(row)
                  }
                  return next
                })
              }}
              aria-expanded={open}
            >
              <time className="meter-parses-session-when" dateTime={row.created_at}>
                {new Date(row.created_at).toLocaleString()}
              </time>
              <span className="meter-parses-session-stats">
                <span className="meter-parses-session-dps">
                  {title}
                  {invalid ? (
                    <span className="meter-run-badge meter-run-badge--invalid" title="Excluded from leaderboard">
                      Invalid
                    </span>
                  ) : unranked ? (
                    <span className="meter-run-badge meter-run-badge--invalid" title="Not a full boss clear">
                      Unranked
                    </span>
                  ) : null}
                </span>
                <span className="meter-parses-session-rest">
                  {[diff, bossLine, outcome, `${formatFixed(playerDps, 0)} DPS`, `${formatFixed(raidDps, 0)} party`]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <span className="meter-parses-session-chevron" aria-hidden>
                {open ? '▾' : '▸'}
              </span>
            </button>
            {open ? (
              <div
                className="meter-parses-session-body"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <MeterDungeonPartyReplay
                  row={row}
                  publicRows={(() => {
                    const dId = row.dungeon_id?.trim() || dungeon?.dungeonId?.trim() || ''
                    const diffId = row.difficulty_id ?? dungeon?.difficultyId
                    if (!dId || diffId == null) return []
                    return publicRowsByScope[meterScopeKey(dId, diffId)] ?? []
                  })()}
                  digimonRoleById={digimonRoleById}
                  selectedMemberKey={profilePlayerKey}
                  onSelectMember={() => {}}
                  onBackFromMember={() => {}}
                />
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
