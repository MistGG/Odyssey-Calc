import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { MeterSubNav } from '../components/MeterSubNav'
import { MeterHorizontalBarChart } from '../components/MeterHorizontalBarChart'
import { MeterPlayerRankingList } from '../components/MeterPlayerRankingList'
import {
  fetchPublicDungeonParses,
  isMeterSupabaseConfigured,
  loadDigimonRoleMapForMeter,
} from '../lib/meterDataSource'
import {
  aggregatePublicMeterStats,
  type DigimonDpsSortMode,
  type PublicMeterParseRow,
} from '../lib/meterPublicStats'
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
  const meterConfigured = isMeterSupabaseConfigured()
  const [rows, setRows] = useState<PublicMeterParseRow[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [wikiDungeons, setWikiDungeons] = useState<Awaited<ReturnType<typeof loadWikiDungeonsForMeter>>>([])
  const [dungeonId, setDungeonId] = useState('')
  const [difficultyId, setDifficultyId] = useState<number | null>(null)
  const [digimonRoleById, setDigimonRoleById] = useState<Map<string, string>>(() => new Map())
  const [digimonDpsSort, setDigimonDpsSort] = useState<DigimonDpsSortMode>('best')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const [parseRes, roles, dungeons] = await Promise.all([
      fetchPublicDungeonParses(),
      loadDigimonRoleMapForMeter(),
      loadWikiDungeonsForMeter().catch(() => []),
    ])
    setWikiDungeons(dungeons)
    setDigimonRoleById(roles)
    if (parseRes.error) setLoadError(parseRes.error)
    setRows(parseRes.rows)
    setLoading(false)
  }, [meterConfigured])

  useEffect(() => {
    void load()
  }, [load])

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
    if (!dungeonId) setDungeonId(dungeonOptions[0]!.dungeonId)
  }, [dungeonOptions, dungeonId, meterNav?.dungeonId])

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

  const stats = useMemo(() => {
    if (!dungeonId || difficultyId == null || !digimonRoleById.size) return null
    return aggregatePublicMeterStats(rows, digimonRoleById, dungeonId, difficultyId)
  }, [rows, digimonRoleById, dungeonId, difficultyId])

  const digimonByBucket = useMemo(() => {
    if (!stats) return null
    return digimonDpsSort === 'best' ? stats.digimonByBucketBest : stats.digimonByBucketAverage
  }, [stats, digimonDpsSort])

  const selectedDungeonName =
    dungeonOptions.find((d) => d.dungeonId === dungeonId)?.dungeonName ?? dungeonId
  const selectedDifficultyLabel =
    difficultyOptions.find((d) => d.difficultyId === difficultyId)?.label ?? ''

  return (
    <div className="meter-parses-page meter-public-page">
      <header className="meter-parses-logged-head meter-parses-logged-head--bar meter-public-head">
        <h1 className="meter-parses-title">Meter</h1>
        <MeterSubNav />
      </header>

      <div className="meter-public-filters">
        <label className="meter-public-filter">
          <span className="meter-public-filter-label">Dungeon</span>
          <select
            value={dungeonId}
            onChange={(e) => {
              setDungeonId(e.target.value)
              setDifficultyId(null)
            }}
            disabled={!dungeonOptions.length}
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
            disabled={!dungeonId || difficultyOptions.length === 0}
          >
            {difficultyOptions.map((d) => (
              <option key={d.difficultyId} value={d.difficultyId}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loadError ? <p className="meter-parses-error meter-parses-error--center">{loadError}</p> : null}
      {loading && !rows.length ? (
        <p className="meter-parses-muted meter-parses-muted--center">Loading leaderboard…</p>
      ) : !dungeonOptions.length ? (
        <p className="meter-parses-muted meter-parses-muted--center">Could not load dungeon list from wiki.</p>
      ) : !dungeonId || difficultyId == null ? (
        <p className="meter-parses-muted meter-parses-muted--center">Select a dungeon and difficulty.</p>
      ) : stats ? (
        <>
          <p className="meter-public-subtitle">
            {selectedDungeonName}
            {selectedDifficultyLabel ? ` · ${selectedDifficultyLabel}` : ''}
          </p>
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
