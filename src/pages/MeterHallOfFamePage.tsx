import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { MeterHallOfFameBoard } from '../components/MeterHallOfFameBoard'
import { MeterHallOfFameDungeonNav } from '../components/MeterHallOfFameDungeonNav'
import { MeterSubNav } from '../components/MeterSubNav'
import {
  fetchPrecomputedMeterLeaderboard,
  resolvePrecomputedLeaderboardNames,
} from '../lib/meterLeaderboardPrecomputed'
import {
  fetchScopeLeaderboardEntryHistory,
  goldParsesFromLeaderboardHistory,
  sortedDpsPoolsFromHistory,
  type MeterHallOfFameEntry,
} from '../lib/meterHallOfFame'
import { fetchRecentMeterParseSelection } from '../lib/meterDataSource'
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

  const [wikiDungeons, setWikiDungeons] = useState<Awaited<ReturnType<typeof loadWikiDungeonsForMeter>>>([])
  const [dungeonId, setDungeonId] = useState('')
  const [difficultyId, setDifficultyId] = useState<number | null>(null)
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

  const syncSearchParams = useCallback(
    (nextDungeonId: string, nextDifficultyId: number) => {
      setSearchParams(
        { dungeon: nextDungeonId, difficulty: String(nextDifficultyId) },
        { replace: true },
      )
    },
    [setSearchParams],
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
      const [history, pre] = await Promise.all([
        fetchScopeLeaderboardEntryHistory(dungeonId, difficultyId),
        fetchPrecomputedMeterLeaderboard({ dungeonId, difficultyId }),
      ])
      if (cancelled) return
      if (history.error) {
        setLoadError(history.error)
        setLoading(false)
        return
      }

      let pools = pre.stats?.sortedDpsByBucket
      if (pre.stats) {
        const resolved = await resolvePrecomputedLeaderboardNames(pre.stats).catch(() => pre.stats!)
        if (!cancelled && resolved) pools = resolved.sortedDpsByBucket
      }

      const poolByRole =
        pools ??
        (history.rows.length ? sortedDpsPoolsFromHistory(history.rows) : {
          melee: [],
          ranged: [],
          caster: [],
          hybrid: [],
          tank: [],
          healer: [],
        })

      const allGold = goldParsesFromLeaderboardHistory(history.rows, poolByRole)
      const byRole = {
        melee: [] as MeterHallOfFameEntry[],
        ranged: [] as MeterHallOfFameEntry[],
        caster: [] as MeterHallOfFameEntry[],
        hybrid: [] as MeterHallOfFameEntry[],
        tank: [] as MeterHallOfFameEntry[],
        healer: [] as MeterHallOfFameEntry[],
      }
      for (const entry of allGold) byRole[entry.roleBucket].push(entry)

      if (!cancelled) {
        setGoldByRole(byRole)
        setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [dungeonId, difficultyId])

  const dungeonName =
    dungeonOptions.find((d) => d.dungeonId === dungeonId)?.dungeonName ?? dungeonId
  const difficultyLabel =
    difficultyOptions.find((d) => d.difficultyId === difficultyId)?.label ?? ''

  const leaderboardHref =
    dungeonId && difficultyId != null
      ? `/meter/leaderboard?dungeon=${encodeURIComponent(dungeonId)}&difficulty=${difficultyId}`
      : '/meter/leaderboard'

  return (
    <div className="meter-parses-page meter-public-page meter-hof-page">
      <header className="meter-parses-logged-head meter-parses-logged-head--bar meter-public-head">
        <h1 className="meter-parses-title">Hall of Fame</h1>
        <p className="meter-parses-muted">
          Record-break clears across dungeons and roles.
        </p>
        <MeterSubNav />
      </header>

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
