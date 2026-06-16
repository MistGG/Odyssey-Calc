import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { MeterSubNav } from '../components/MeterSubNav'
import { MeterHorizontalBarChart } from '../components/MeterHorizontalBarChart'
import { MeterPlayerRankingList } from '../components/MeterPlayerRankingList'
import { fetchRecentMeterParseSelection } from '../lib/meterDataSource'
import { getCachedLeaderboardStats } from '../lib/meterLeaderboardStatsCache'
import { fetchPrecomputedMeterLeaderboard } from '../lib/meterLeaderboardPrecomputed'
import {
  getDefaultMeterLeaderboardCycle,
  getMeterLeaderboardCycle,
  isMeterLeaderboardCycleLive,
  METER_LEADERBOARD_CYCLES,
  meterLeaderboardCycleWindow,
} from '../lib/meterLeaderboardCycles'
import type { DigimonDpsSortMode, MeterPublicAggregates } from '../lib/meterPublicStats'
import { METER_ROLE_BUCKET_LABELS, METER_ROLE_BUCKETS } from '../lib/meterRoleBuckets'
import {
  dungeonSelectOptions,
  difficultySelectOptions,
  loadWikiDungeonsForMeter,
} from '../lib/wikiDungeons'

/** Visible player rows per role (RPC may return more; keeps DOM light). */
const LEADERBOARD_VISIBLE_PLAYERS = 40

type MeterNavState = { dungeonId?: string; difficultyId?: number }

export function MeterPublicPage() {
  const location = useLocation()
  const { state: navState } = location
  const [searchParams] = useSearchParams()
  const meterNav = (navState as MeterNavState | null) ?? null
  const queryDungeonId = searchParams.get('dungeon')?.trim() || ''
  const queryDifficultyRaw = searchParams.get('difficulty')
  const queryDifficultyId = queryDifficultyRaw != null ? Number(queryDifficultyRaw) : null
  const queryCycleId =
    searchParams.get('cycle')?.trim() || searchParams.get('patch')?.trim() || ''
  const [precomputedStats, setPrecomputedStats] = useState<MeterPublicAggregates | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [bootLoading, setBootLoading] = useState(true)
  const [parsesRefreshing, setParsesRefreshing] = useState(false)
  const [wikiDungeons, setWikiDungeons] = useState<Awaited<ReturnType<typeof loadWikiDungeonsForMeter>>>([])
  const [dungeonId, setDungeonId] = useState('')
  const [difficultyId, setDifficultyId] = useState<number | null>(null)
  const [digimonDpsSort, setDigimonDpsSort] = useState<DigimonDpsSortMode>('best')
  const [leaderboardCycleId, setLeaderboardCycleId] = useState(() => getDefaultMeterLeaderboardCycle().id)
  const initialFiltersApplied = useRef(false)

  const loadBoot = useCallback(async () => {
    setBootLoading(true)
    setLoadError(null)
    const dungeons = await loadWikiDungeonsForMeter().catch(() => [])
    setWikiDungeons(dungeons)
    setBootLoading(false)
  }, [])

  useEffect(() => {
    void loadBoot()
  }, [loadBoot])

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

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [location.key])

  useEffect(() => {
    if (!dungeonOptions.length) return
    if (queryDungeonId && dungeonOptions.some((d) => d.dungeonId === queryDungeonId)) {
      setDungeonId(queryDungeonId)
      return
    }
    const fromEvent = meterNav?.dungeonId?.trim()
    if (fromEvent && dungeonOptions.some((d) => d.dungeonId === fromEvent)) {
      setDungeonId(fromEvent)
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
        return
      }
      setDungeonId(dungeonOptions[0]!.dungeonId)
    })()
  }, [dungeonOptions, bootLoading, meterNav?.dungeonId, queryDungeonId])

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
    if (
      fromEvent != null &&
      difficultyOptions.some((d) => d.difficultyId === fromEvent)
    ) {
      setDifficultyId(fromEvent)
      return
    }
    if (difficultyId == null || !difficultyOptions.some((d) => d.difficultyId === difficultyId)) {
      setDifficultyId(difficultyOptions[0]!.difficultyId)
    }
  }, [dungeonId, difficultyOptions, difficultyId, meterNav?.difficultyId, queryDifficultyId])

  useEffect(() => {
    if (!dungeonId || difficultyId == null) {
      setPrecomputedStats(null)
      return
    }

    let cancelled = false
    setParsesRefreshing(true)
    setLoadError(null)

    const cachedStats = getCachedLeaderboardStats(dungeonId, difficultyId, leaderboardCycle.id)
    if (cachedStats) {
      setPrecomputedStats(cachedStats)
    }

    void (async () => {
      const pre = await fetchPrecomputedMeterLeaderboard({
        dungeonId,
        difficultyId,
        leaderboardCycleId: leaderboardCycle.id,
        windowStart: cycleWindow.windowStart,
        windowEnd: cycleWindow.windowEnd,
      })
      if (cancelled) return
      if (pre.error) setLoadError(pre.error)
      setPrecomputedStats(pre.stats)
      setParsesRefreshing(false)
    })()

    return () => {
      cancelled = true
    }
  }, [dungeonId, difficultyId, leaderboardCycle, cycleWindow.windowEnd, cycleWindow.windowStart])

  const stats = precomputedStats

  const digimonByBucket = useMemo(() => {
    if (!stats) return null
    return digimonDpsSort === 'best' ? stats.digimonByBucketBest : stats.digimonByBucketAverage
  }, [stats, digimonDpsSort])

  const showLoading = parsesRefreshing && !stats

  return (
    <div className="meter-parses-page meter-public-page">
      <header className="meter-parses-logged-head meter-parses-logged-head--bar meter-public-head">
        <h1 className="meter-parses-title">Meter</h1>
        <MeterSubNav />
      </header>

      <div className={`meter-public-filters${parsesRefreshing ? ' meter-public-filters--refreshing' : ''}`}>
        <label className="meter-public-filter">
          <span className="meter-public-filter-label">Cycle</span>
          <select
            value={leaderboardCycle.id}
            onChange={(e) => setLeaderboardCycleId(e.target.value)}
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
        <label className="meter-public-filter">
          <span className="meter-public-filter-label">Dungeon</span>
          <select
            value={dungeonId}
            onChange={(e) => {
              setDungeonId(e.target.value)
              setDifficultyId(null)
            }}
            disabled={!dungeonOptions.length || bootLoading}
          >
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
            value={difficultyId ?? ''}
            onChange={(e) => setDifficultyId(Number(e.target.value))}
            disabled={!dungeonId || difficultyOptions.length === 0 || bootLoading}
          >
            {difficultyOptions.map((d) => (
              <option key={d.difficultyId} value={d.difficultyId}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        {parsesRefreshing ? (
          <span className="meter-public-filter-status muted" role="status">
            Updating…
          </span>
        ) : null}
      </div>

      {!isMeterLeaderboardCycleLive(leaderboardCycle) ? (
        <p className="meter-public-cycle-note meter-parses-muted" role="status">
          {leaderboardCycle.label}. Rankings no longer update.
        </p>
      ) : leaderboardCycle.note ? (
        <p className="meter-public-cycle-note meter-parses-muted" role="status">
          {leaderboardCycle.note}
        </p>
      ) : null}

      {loadError ? <p className="meter-parses-error meter-parses-error--center">{loadError}</p> : null}
      {bootLoading && !dungeonOptions.length ? (
        <p className="meter-parses-muted meter-parses-muted--center">Loading…</p>
      ) : showLoading ? (
        <p className="meter-parses-muted meter-parses-muted--center">Loading leaderboard…</p>
      ) : !dungeonOptions.length ? (
        <p className="meter-parses-muted meter-parses-muted--center">Could not load dungeon list from wiki.</p>
      ) : !dungeonId || difficultyId == null ? (
        <p className="meter-parses-muted meter-parses-muted--center">Select a dungeon and difficulty.</p>
      ) : stats ? (
        <>
          <div className="meter-public-grid">
            <div className="meter-public-section">
              <div className="meter-public-section-head">
                <h2 className="meter-parses-section-title">Top Digimon DPS</h2>
                <div className="meter-public-digimon-sort" role="group" aria-label="Sort top digimon by">
                  <button
                    type="button"
                    className={`meter-public-digimon-sort-btn${digimonDpsSort === 'best' ? ' meter-public-digimon-sort-btn--active' : ''}`}
                    aria-pressed={digimonDpsSort === 'best'}
                    onClick={() => setDigimonDpsSort('best')}
                  >
                    Best DPS
                  </button>
                  <button
                    type="button"
                    className={`meter-public-digimon-sort-btn${digimonDpsSort === 'average' ? ' meter-public-digimon-sort-btn--active' : ''}`}
                    aria-pressed={digimonDpsSort === 'average'}
                    onClick={() => setDigimonDpsSort('average')}
                  >
                    Average DPS
                  </button>
                </div>
              </div>
              <div className="meter-public-charts-2col">
                {METER_ROLE_BUCKETS.map((b) => (
                  <MeterHorizontalBarChart
                    key={b}
                    title={METER_ROLE_BUCKET_LABELS[b]}
                    entries={digimonByBucket![b]}
                  />
                ))}
              </div>
            </div>
            <div className="meter-public-section">
              <h2 className="meter-parses-section-title">Player rankings</h2>
              <div className="meter-public-ranks-2col">
                {METER_ROLE_BUCKETS.map((b) => (
                  <MeterPlayerRankingList
                    key={b}
                    title={METER_ROLE_BUCKET_LABELS[b]}
                    entries={stats.playersByBucket[b]}
                    poolDps={stats.sortedDpsByBucket[b]}
                    maxEntries={LEADERBOARD_VISIBLE_PLAYERS}
                    meterContext={{ dungeonId, difficultyId }}
                  />
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <p className="meter-parses-muted meter-parses-muted--center">No rankings for this dungeon yet.</p>
      )}
    </div>
  )
}
