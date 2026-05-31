import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { MeterSubNav } from '../components/MeterSubNav'
import { MeterHorizontalBarChart } from '../components/MeterHorizontalBarChart'
import { MeterPlayerRankingList } from '../components/MeterPlayerRankingList'
import {
  fetchRecentMeterParseSelection,
  getPublicDungeonParsesCached,
  loadDigimonRoleMapForMeter,
} from '../lib/meterDataSource'
import { getCachedScopeParses, meterScopeKey } from '../lib/meterParseCache'
import {
  aggregatePublicMeterStats,
  type DigimonDpsSortMode,
  type MeterPublicAggregates,
  type PublicMeterParseRow,
} from '../lib/meterPublicStats'
import { fetchPrecomputedMeterLeaderboard } from '../lib/meterLeaderboardPrecomputed'
import { METER_ROLE_BUCKET_LABELS, METER_ROLE_BUCKETS } from '../lib/meterRoleBuckets'
import {
  dungeonSelectOptions,
  difficultySelectOptions,
  loadWikiDungeonsForMeter,
} from '../lib/wikiDungeons'

type MeterNavState = { dungeonId?: string; difficultyId?: number }

export function MeterPublicPage() {
  const { state: navState } = useLocation()
  const meterNav = (navState as MeterNavState | null) ?? null
  const [rows, setRows] = useState<PublicMeterParseRow[]>([])
  const [precomputedStats, setPrecomputedStats] = useState<MeterPublicAggregates | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [bootLoading, setBootLoading] = useState(true)
  const [parsesRefreshing, setParsesRefreshing] = useState(false)
  const [wikiDungeons, setWikiDungeons] = useState<Awaited<ReturnType<typeof loadWikiDungeonsForMeter>>>([])
  const [dungeonId, setDungeonId] = useState('')
  const [difficultyId, setDifficultyId] = useState<number | null>(null)
  const [digimonRoleById, setDigimonRoleById] = useState<Map<string, string>>(() => new Map())
  const [digimonDpsSort, setDigimonDpsSort] = useState<DigimonDpsSortMode>('best')
  const initialFiltersApplied = useRef(false)

  const loadBoot = useCallback(async () => {
    setBootLoading(true)
    setLoadError(null)
    const [roles, dungeons] = await Promise.all([
      loadDigimonRoleMapForMeter(),
      loadWikiDungeonsForMeter().catch(() => []),
    ])
    setWikiDungeons(dungeons)
    setDigimonRoleById(roles)
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

  useEffect(() => {
    if (!dungeonOptions.length) return
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
  }, [dungeonOptions, bootLoading, meterNav?.dungeonId])

  useEffect(() => {
    if (!dungeonId) return
    if (!difficultyOptions.length) {
      setDifficultyId(null)
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
  }, [dungeonId, difficultyOptions, difficultyId, meterNav?.difficultyId])

  useEffect(() => {
    if (!dungeonId || difficultyId == null) {
      setRows([])
      setPrecomputedStats(null)
      return
    }
    let cancelled = false
    setParsesRefreshing(true)
    setLoadError(null)
    setPrecomputedStats(null)

    void (async () => {
      const pre = await fetchPrecomputedMeterLeaderboard({ dungeonId, difficultyId })
      if (cancelled) return
      if (pre.error) setLoadError(pre.error)
      if (pre.stats) {
        setPrecomputedStats(pre.stats)
        setParsesRefreshing(false)
        return
      }

      const scopeKey = meterScopeKey(dungeonId, difficultyId)
      const cached = getCachedScopeParses(scopeKey)
      setRows(cached ?? [])
      const parseRes = await getPublicDungeonParsesCached({ dungeonId, difficultyId }, (updated) => {
        if (!cancelled) setRows(updated)
      })
      if (cancelled) return
      if (parseRes.error) setLoadError(parseRes.error)
      else if (!cached?.length) setRows(parseRes.rows)
      setParsesRefreshing(false)
    })()

    return () => {
      cancelled = true
    }
  }, [dungeonId, difficultyId])

  const legacyStats = useMemo(() => {
    if (!dungeonId || difficultyId == null || !digimonRoleById.size) return null
    return aggregatePublicMeterStats(rows, digimonRoleById, dungeonId, difficultyId)
  }, [rows, digimonRoleById, dungeonId, difficultyId])

  const stats = precomputedStats ?? legacyStats

  const digimonByBucket = useMemo(() => {
    if (!stats) return null
    return digimonDpsSort === 'best' ? stats.digimonByBucketBest : stats.digimonByBucketAverage
  }, [stats, digimonDpsSort])

  return (
    <div className="meter-parses-page meter-public-page">
      <header className="meter-parses-logged-head meter-parses-logged-head--bar meter-public-head">
        <h1 className="meter-parses-title">Meter</h1>
        <MeterSubNav />
      </header>

      <div className={`meter-public-filters${parsesRefreshing ? ' meter-public-filters--refreshing' : ''}`}>
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

      {loadError ? <p className="meter-parses-error meter-parses-error--center">{loadError}</p> : null}
      {bootLoading && !dungeonOptions.length ? (
        <p className="meter-parses-muted meter-parses-muted--center">Loading…</p>
      ) : parsesRefreshing && !stats ? (
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
              <h2 className="meter-parses-section-title">Player rankings (top 100)</h2>
              <div className="meter-public-ranks-2col">
                {METER_ROLE_BUCKETS.map((b) => (
                  <MeterPlayerRankingList
                    key={b}
                    title={METER_ROLE_BUCKET_LABELS[b]}
                    entries={stats.playersByBucket[b]}
                    poolDps={stats.sortedDpsByBucket[b]}
                    meterContext={{ dungeonId, difficultyId }}
                  />
                ))}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
