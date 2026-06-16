import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { MeterHallOfFameBoard } from '../components/MeterHallOfFameBoard'
import { MeterHallOfFameDungeonNav } from '../components/MeterHallOfFameDungeonNav'
import { MeterSubNav } from '../components/MeterSubNav'
import {
  fetchScopeHallOfFameGoldEntries,
  type MeterHallOfFameEntry,
} from '../lib/meterHallOfFame'
import { fetchRecentMeterParseSelection } from '../lib/meterDataSource'
import {
  getDefaultMeterLeaderboardCycle,
  getMeterLeaderboardCycle,
  isMeterLeaderboardCycleLive,
  METER_LEADERBOARD_CYCLES,
  meterLeaderboardCycleWindow,
} from '../lib/meterLeaderboardCycles'
import { METER_ROLE_BUCKETS } from '../lib/meterRoleBuckets'
import {
  dungeonSelectOptions,
  difficultySelectOptions,
  loadWikiDungeonsForMeter,
} from '../lib/wikiDungeons'

type MeterNavState = { dungeonId?: string; difficultyId?: number }

export function MeterHallOfFamePage() {
  const location = useLocation()
  const { state: navState } = location
  const [searchParams, setSearchParams] = useSearchParams()
  const meterNav = (navState as MeterNavState | null) ?? null
  const queryDungeonId = searchParams.get('dungeon')?.trim() || ''
  const queryDifficultyRaw = searchParams.get('difficulty')
  const queryDifficultyId = queryDifficultyRaw != null ? Number(queryDifficultyRaw) : null
  const queryCycleId =
    searchParams.get('cycle')?.trim() || searchParams.get('patch')?.trim() || ''

  const [wikiDungeons, setWikiDungeons] = useState<Awaited<ReturnType<typeof loadWikiDungeonsForMeter>>>([])
  const [dungeonId, setDungeonId] = useState('')
  const [difficultyId, setDifficultyId] = useState<number | null>(null)
  const [leaderboardCycleId, setLeaderboardCycleId] = useState(() => getDefaultMeterLeaderboardCycle().id)
  const [bootLoading, setBootLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [goldByRole, setGoldByRole] = useState<Record<(typeof METER_ROLE_BUCKETS)[number], MeterHallOfFameEntry[]>>(
    () => ({
      melee: [],
      ranged: [],
      caster: [],
      hybrid: [],
      tank: [],
      healer: [],
    }),
  )
  const [expandedDungeonId, setExpandedDungeonId] = useState('')
  const initialFiltersApplied = useRef(false)

  const loadBoot = useCallback(async () => {
    setBootLoading(true)
    const dungeons = await loadWikiDungeonsForMeter().catch(() => [])
    setWikiDungeons(dungeons)
    setBootLoading(false)
  }, [])

  useEffect(() => {
    void loadBoot()
  }, [loadBoot])

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [location.key])

  const dungeonOptions = useMemo(() => dungeonSelectOptions(wikiDungeons), [wikiDungeons])
  const difficultyOptions = useMemo(
    () => difficultySelectOptions(wikiDungeons, dungeonId),
    [wikiDungeons, dungeonId],
  )

  const leaderboardCycle = useMemo(
    () => getMeterLeaderboardCycle(leaderboardCycleId) ?? getDefaultMeterLeaderboardCycle(),
    [leaderboardCycleId],
  )

  const cycleWindow = useMemo(() => meterLeaderboardCycleWindow(leaderboardCycle), [leaderboardCycle])

  useEffect(() => {
    if (queryCycleId && getMeterLeaderboardCycle(queryCycleId)) {
      setLeaderboardCycleId(queryCycleId)
    }
  }, [queryCycleId])

  const syncSearchParams = useCallback(
    (nextDungeonId: string, nextDifficultyId: number, nextCycleId = leaderboardCycleId) => {
      setSearchParams(
        {
          dungeon: nextDungeonId,
          difficulty: String(nextDifficultyId),
          cycle: nextCycleId,
        },
        { replace: true },
      )
    },
    [leaderboardCycleId, setSearchParams],
  )

  const toggleDungeon = useCallback((id: string) => {
    setExpandedDungeonId((prev) => (prev === id ? '' : id))
  }, [])

  const selectScope = useCallback(
    (nextDungeonId: string, nextDifficultyId: number) => {
      setExpandedDungeonId(nextDungeonId)
      setDungeonId(nextDungeonId)
      setDifficultyId(nextDifficultyId)
      syncSearchParams(nextDungeonId, nextDifficultyId)
    },
    [syncSearchParams],
  )

  useEffect(() => {
    if (!dungeonOptions.length) return
    if (queryDungeonId && dungeonOptions.some((d) => d.dungeonId === queryDungeonId)) {
      setDungeonId(queryDungeonId)
      setExpandedDungeonId(queryDungeonId)
      return
    }
    const fromEvent = meterNav?.dungeonId?.trim()
    if (fromEvent && dungeonOptions.some((d) => d.dungeonId === fromEvent)) {
      setDungeonId(fromEvent)
      setExpandedDungeonId(fromEvent)
      return
    }
    if (initialFiltersApplied.current) return
    if (bootLoading) return
    initialFiltersApplied.current = true
    const allowedIds = dungeonOptions.map((d) => d.dungeonId)
    void (async () => {
      const recent = await fetchRecentMeterParseSelection(allowedIds)
      if (recent) {
        setDungeonId(recent.dungeonId)
        setDifficultyId(recent.difficultyId)
        setExpandedDungeonId(recent.dungeonId)
        syncSearchParams(recent.dungeonId, recent.difficultyId)
        return
      }
      const first = dungeonOptions[0]!
      const diffs = difficultySelectOptions(wikiDungeons, first.dungeonId)
      setDungeonId(first.dungeonId)
      setExpandedDungeonId(first.dungeonId)
      const diff = diffs[0]?.difficultyId ?? null
      setDifficultyId(diff)
      if (diff != null) syncSearchParams(first.dungeonId, diff)
    })()
  }, [dungeonOptions, bootLoading, meterNav?.dungeonId, queryDungeonId, wikiDungeons, syncSearchParams])

  useEffect(() => {
    if (!dungeonId) return
    if (!difficultyOptions.length) {
      setDifficultyId(null)
      return
    }
    if (
      queryDifficultyId != null &&
      Number.isFinite(queryDifficultyId) &&
      queryDifficultyId >= 2 &&
      difficultyOptions.some((d) => d.difficultyId === queryDifficultyId)
    ) {
      setDifficultyId(queryDifficultyId)
      return
    }
    const fromEvent = meterNav?.difficultyId
    if (fromEvent != null && difficultyOptions.some((d) => d.difficultyId === fromEvent)) {
      setDifficultyId(fromEvent)
      return
    }
    if (difficultyId == null || !difficultyOptions.some((d) => d.difficultyId === difficultyId)) {
      const next = difficultyOptions[0]!.difficultyId
      setDifficultyId(next)
      syncSearchParams(dungeonId, next)
    }
  }, [
    dungeonId,
    difficultyOptions,
    difficultyId,
    meterNav?.difficultyId,
    queryDifficultyId,
    syncSearchParams,
  ])

  useEffect(() => {
    if (!dungeonId || difficultyId == null) {
      setGoldByRole({
        melee: [],
        ranged: [],
        caster: [],
        hybrid: [],
        tank: [],
        healer: [],
      })
      return
    }

    let cancelled = false
    setLoading(true)
    setLoadError(null)

    void (async () => {
      const goldRes = await fetchScopeHallOfFameGoldEntries(dungeonId, difficultyId, {
        leaderboardCycleId: leaderboardCycle.id,
        windowStart: cycleWindow.windowStart,
        windowEnd: cycleWindow.windowEnd,
      })
      if (cancelled) return
      if (goldRes.error) {
        setLoadError(goldRes.error)
        setLoading(false)
        return
      }

      const byRole = {
        melee: [] as MeterHallOfFameEntry[],
        ranged: [] as MeterHallOfFameEntry[],
        caster: [] as MeterHallOfFameEntry[],
        hybrid: [] as MeterHallOfFameEntry[],
        tank: [] as MeterHallOfFameEntry[],
        healer: [] as MeterHallOfFameEntry[],
      }
      for (const entry of goldRes.entries) byRole[entry.roleBucket].push(entry)

      if (!cancelled) {
        setGoldByRole(byRole)
        setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [dungeonId, difficultyId, leaderboardCycle, cycleWindow.windowEnd, cycleWindow.windowStart])

  const dungeonName =
    dungeonOptions.find((d) => d.dungeonId === dungeonId)?.dungeonName ?? dungeonId
  const difficultyLabel =
    difficultyOptions.find((d) => d.difficultyId === difficultyId)?.label ?? ''

  const leaderboardHref =
    dungeonId && difficultyId != null
      ? `/meter?dungeon=${encodeURIComponent(dungeonId)}&difficulty=${difficultyId}&cycle=${encodeURIComponent(leaderboardCycle.id)}`
      : '/meter'

  const handleCycleChange = useCallback(
    (nextCycleId: string) => {
      setLeaderboardCycleId(nextCycleId)
      if (dungeonId && difficultyId != null) {
        syncSearchParams(dungeonId, difficultyId, nextCycleId)
      } else {
        setSearchParams({ cycle: nextCycleId }, { replace: true })
      }
    },
    [dungeonId, difficultyId, setSearchParams, syncSearchParams],
  )

  return (
    <div className="meter-parses-page meter-public-page meter-hof-page">
      <header className="meter-parses-logged-head meter-parses-logged-head--bar meter-public-head">
        <h1 className="meter-parses-title">Hall of Fame</h1>
        <p className="meter-parses-muted">
          Record-break clears across dungeons and roles.
        </p>
        <MeterSubNav />
      </header>

      <div className="meter-public-filters">
        <label className="meter-public-filter">
          <span className="meter-public-filter-label">Cycle</span>
          <select
            value={leaderboardCycle.id}
            onChange={(e) => handleCycleChange(e.target.value)}
            disabled={bootLoading}
          >
            {METER_LEADERBOARD_CYCLES.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>
                {cycle.label}
                {isMeterLeaderboardCycleLive(cycle) ? ' (live)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!isMeterLeaderboardCycleLive(leaderboardCycle) ? (
        <p className="meter-public-cycle-note meter-parses-muted" role="status">
          {leaderboardCycle.label}.
        </p>
      ) : null}

      {loadError ? <p className="meter-parses-error meter-parses-error--center">{loadError}</p> : null}

      {bootLoading && !dungeonOptions.length ? (
        <p className="meter-parses-muted meter-parses-muted--center">Loading dungeons…</p>
      ) : !dungeonOptions.length ? (
        <p className="meter-parses-muted meter-parses-muted--center">Could not load dungeon list from wiki.</p>
      ) : (
        <div className="meter-hof-layout">
          <aside className="meter-hof-layout__nav">
            <MeterHallOfFameDungeonNav
              dungeons={wikiDungeons}
              dungeonOptions={dungeonOptions}
              dungeonId={dungeonId}
              difficultyId={difficultyId}
              expandedDungeonId={expandedDungeonId}
              onToggleDungeon={toggleDungeon}
              onSelectScope={selectScope}
              loading={bootLoading}
            />
          </aside>

          <div className="meter-hof-layout__main">
            {!dungeonId || difficultyId == null ? (
              <p className="meter-parses-muted meter-parses-muted--center">
                Expand a dungeon in the list, then choose Normal or Hard.
              </p>
            ) : (
              <MeterHallOfFameBoard
                dungeonName={dungeonName}
                difficultyLabel={difficultyLabel}
                dungeonId={dungeonId}
                difficultyId={difficultyId}
                goldByRole={goldByRole}
                loading={loading}
                leaderboardHref={leaderboardHref}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
