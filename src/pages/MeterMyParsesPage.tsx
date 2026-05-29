import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { MeterDungeonPartyReplay } from '../components/MeterDungeonPartyReplay'
import { MeterSubNav } from '../components/MeterSubNav'
import {
  dungeonFromPayload,
  isExcludedFromLeaderboardParseRow,
  isInvalidMeterPartyParseRow,
  partyMembersFromPayload,
  raidTotalFromPayload,
  sessionDurationFromPayload,
} from '../lib/meterParsePayload'
import {
  fetchMyMeterParses,
  getPublicDungeonParsesCached,
  loadDigimonRoleMapForMeter,
} from '../lib/meterDataSource'
import { readCachedConfirmedTamer } from '../lib/meterConfirmedTamerCache'
import { claimAnonymousMeterParsesForTamer } from '../lib/meterParseTamerClaim'
import {
  dungeonParseRows,
  dungeonSelectOptions,
  difficultySelectOptions,
  filterMyDungeonParses,
} from '../lib/meterMyParsesFilters'
import { loadWikiDungeonsForMeter, resolveMeterDungeonDisplayName } from '../lib/wikiDungeons'
import type { MeterParseListRow, PublicMeterParseRow } from '../lib/meterPublicStats'

function formatFixed(n: number, digits: number) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function MeterMyParsesPage() {
  const { supabase, user, authReady } = useAuth()
  const location = useLocation()

  const [rows, setRows] = useState<MeterParseListRow[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [wikiDungeons, setWikiDungeons] = useState<Awaited<ReturnType<typeof loadWikiDungeonsForMeter>>>([])
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  const [partyMemberByParseId, setPartyMemberByParseId] = useState<Record<string, string>>({})
  const [publicRowsByScope, setPublicRowsByScope] = useState<Record<string, PublicMeterParseRow[]>>({})
  const [digimonRoleById, setDigimonRoleById] = useState<Map<string, string>>(() => new Map())
  const [filterDungeonId, setFilterDungeonId] = useState('')
  const [filterDifficultyId, setFilterDifficultyId] = useState<number | null>(null)

  const allDungeonRows = useMemo(() => dungeonParseRows(rows), [rows])
  const dungeonOptions = useMemo(() => dungeonSelectOptions(wikiDungeons), [wikiDungeons])
  const difficultyOptions = useMemo(
    () => difficultySelectOptions(wikiDungeons, filterDungeonId),
    [wikiDungeons, filterDungeonId],
  )

  const filteredRows = useMemo(
    () => filterMyDungeonParses(allDungeonRows, filterDungeonId, filterDifficultyId),
    [allDungeonRows, filterDungeonId, filterDifficultyId],
  )

  const publicScopeKey = (dungeonId: string, difficultyId: number) =>
    `${dungeonId}:${difficultyId}`

  const ensurePublicRowsForParse = useCallback(
    async (row: PublicMeterParseRow) => {
      const dungeon = dungeonFromPayload(row.payload)
      const dungeonId = row.dungeon_id?.trim() || dungeon?.dungeonId?.trim() || ''
      const difficultyId = row.difficulty_id ?? dungeon?.difficultyId
      if (!dungeonId || difficultyId == null || difficultyId < 2) return
      const key = publicScopeKey(dungeonId, difficultyId)
      let alreadyLoaded = false
      setPublicRowsByScope((prev) => {
        alreadyLoaded = Boolean(prev[key])
        return prev
      })
      if (alreadyLoaded) return
      const pub = await getPublicDungeonParsesCached({ dungeonId, difficultyId })
      if (pub.error) return
      setPublicRowsByScope((prev) => (prev[key] ? prev : { ...prev, [key]: pub.rows }))
    },
    [],
  )

  const loadParses = useCallback(async () => {
    if (!supabase || !user) return
    setLoading(true)
    setLoadError(null)
    const cachedTamer = readCachedConfirmedTamer()
    if (cachedTamer) {
      await claimAnonymousMeterParsesForTamer(supabase, cachedTamer)
    }
    const [mine, roles, dungeons] = await Promise.all([
      fetchMyMeterParses(supabase),
      loadDigimonRoleMapForMeter(),
      loadWikiDungeonsForMeter().catch(() => []),
    ])
    setWikiDungeons(dungeons)
    setDigimonRoleById(roles)
    if (mine.error) setLoadError(mine.error)
    setRows(mine.rows as MeterParseListRow[])
    setLoading(false)
  }, [supabase, user])

  useEffect(() => {
    void loadParses()
  }, [loadParses])

  const renderDungeonSession = (row: PublicMeterParseRow) => {
    const dungeon = dungeonFromPayload(row.payload)
    const members = partyMembersFromPayload(row.payload)
    const title = resolveMeterDungeonDisplayName(
      row.dungeon_id ?? dungeon?.dungeonId,
      wikiDungeons,
      row.dungeon_name,
      dungeon?.dungeonName,
    )
    const diff =
      row.difficulty?.trim() || dungeon?.difficulty?.trim() || (row.difficulty_id === 3 ? 'Hard' : row.difficulty_id === 2 ? 'Normal' : '')
    const bosses = dungeon?.bossTargets ?? []
    const bossLine = bosses.length ? bosses.join(', ') : ''
    const outcome =
      dungeon?.runOutcome === 'clear' ? 'Clear' : dungeon?.runOutcome === 'fail' ? 'Fail' : ''
    const invalid = isInvalidMeterPartyParseRow(row)
    const unranked = !invalid && isExcludedFromLeaderboardParseRow(row)
    const raidTotal = raidTotalFromPayload(row.payload, members)
    const sessionDur = sessionDurationFromPayload(row.payload, row.duration_sec, members)
    const raidDps = sessionDur > 0 ? raidTotal / sessionDur : 0
    const open = expandedIds.has(row.id)
    const memberKey = partyMemberByParseId[row.id]

    return (
      <li
        key={row.id}
        className={`meter-parses-session meter-parses-session--dungeon${open ? ' meter-parses-session--open' : ''}`}
      >
        <button
          type="button"
          className="meter-parses-session-toggle"
          onClick={() => {
            if (open) {
              setPartyMemberByParseId((p) => {
                if (!(row.id in p)) return p
                const { [row.id]: _, ...rest } = p
                return rest
              })
            }
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
                <span className="meter-run-badge meter-run-badge--invalid" title="Not a full boss clear — excluded from leaderboard">
                  Unranked
                </span>
              ) : null}
            </span>
            <span className="meter-parses-session-rest">
              {[diff, bossLine, outcome, `${formatFixed(raidDps, 0)} comb. DPS`].filter(Boolean).join(' · ')}
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
              fallbackDungeonName={title}
              publicRows={(() => {
                const dungeon = dungeonFromPayload(row.payload)
                const dungeonId = row.dungeon_id?.trim() || dungeon?.dungeonId?.trim() || ''
                const difficultyId = row.difficulty_id ?? dungeon?.difficultyId
                if (!dungeonId || difficultyId == null) return []
                return publicRowsByScope[publicScopeKey(dungeonId, difficultyId)] ?? []
              })()}
              digimonRoleById={digimonRoleById}
              selectedMemberKey={memberKey ?? null}
              onSelectMember={(key) => setPartyMemberByParseId((p) => ({ ...p, [row.id]: key }))}
              onBackFromMember={() => {
                setPartyMemberByParseId((p) => {
                  if (!(row.id in p)) return p
                  const next = { ...p }
                  delete next[row.id]
                  return next
                })
              }}
            />
          </div>
        ) : null}
      </li>
    )
  }

  if (!authReady) {
    return (
      <div className="auth-shell">
        <div className="auth-card auth-card--compact">
          <div className="auth-corner auth-corner--tl" aria-hidden />
          <div className="auth-corner auth-corner--br" aria-hidden />
          <p className="auth-wait">Loading…</p>
        </div>
      </div>
    )
  }

  if (!supabase || !user) {
    return (
      <Navigate
        to={`/auth?returnTo=${encodeURIComponent(location.pathname)}`}
        replace
      />
    )
  }

  const hasAny = allDungeonRows.length > 0

  return (
    <div className="meter-parses-page meter-parses-page--logged meter-my-parses-page">
      <header className="meter-parses-logged-head meter-parses-logged-head--bar meter-public-head">
        <h1 className="meter-parses-title">Meter</h1>
        <MeterSubNav />
      </header>

      <div className="meter-public-filters">
        <label className="meter-public-filter">
          <span className="meter-public-filter-label">Dungeon</span>
          <select
            value={filterDungeonId}
            onChange={(e) => {
              setFilterDungeonId(e.target.value)
              setFilterDifficultyId(null)
            }}
            disabled={!dungeonOptions.length}
          >
            <option value="">All dungeons</option>
            {dungeonOptions.map((d) => (
              <option key={d.dungeonId} value={d.dungeonId}>
                {d.dungeonName}
              </option>
            ))}
          </select>
        </label>
        <label className="meter-public-filter">
          <span className="meter-public-filter-label">Difficulty</span>
          <select
            value={filterDifficultyId ?? ''}
            onChange={(e) => {
              const v = e.target.value
              setFilterDifficultyId(v === '' ? null : Number(v))
            }}
            disabled={!filterDungeonId || difficultyOptions.length === 0}
          >
            <option value="">All difficulties</option>
            {difficultyOptions.map((d) => (
              <option key={d.difficultyId} value={d.difficultyId}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loadError ? <p className="meter-parses-error meter-parses-error--center">{loadError}</p> : null}
      {loading && rows.length === 0 ? (
        <p className="meter-parses-muted meter-parses-muted--center">Loading parses…</p>
      ) : !hasAny ? (
        <p className="meter-parses-muted meter-parses-muted--center">
          No dungeon uploads yet. In the companion, finish a Normal or Hard dungeon run with damage, then
          upload from the cloud button.
        </p>
      ) : filteredRows.length === 0 ? (
        <p className="meter-parses-muted meter-parses-muted--center">
          No parses match this dungeon and difficulty.
        </p>
      ) : (
        <ul className="meter-parses-overview meter-parses-overview--dungeon">
          {filteredRows.map(renderDungeonSession)}
        </ul>
      )}
    </div>
  )
}
