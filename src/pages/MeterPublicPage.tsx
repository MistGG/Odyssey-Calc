import { useCallback, useEffect, useMemo, useState } from 'react'
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
  type PublicMeterParseRow,
} from '../lib/meterPublicStats'
import { METER_ROLE_BUCKET_LABELS, METER_ROLE_BUCKETS } from '../lib/meterRoleBuckets'
import {
  dungeonSelectOptions,
  difficultySelectOptions,
  loadWikiDungeonsForMeter,
} from '../lib/wikiDungeons'

export function MeterPublicPage() {
  const meterConfigured = isMeterSupabaseConfigured()
  const [rows, setRows] = useState<PublicMeterParseRow[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [wikiDungeons, setWikiDungeons] = useState<Awaited<ReturnType<typeof loadWikiDungeonsForMeter>>>([])
  const [dungeonId, setDungeonId] = useState('')
  const [difficultyId, setDifficultyId] = useState<number | null>(null)
  const [digimonRoleById, setDigimonRoleById] = useState<Map<string, string>>(() => new Map())

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
    if (!dungeonId && dungeonOptions.length) setDungeonId(dungeonOptions[0]!.dungeonId)
  }, [dungeonOptions, dungeonId])

  useEffect(() => {
    if (!dungeonId) return
    if (!difficultyOptions.length) {
      setDifficultyId(null)
      return
    }
    if (difficultyId == null || !difficultyOptions.some((d) => d.difficultyId === difficultyId)) {
      setDifficultyId(difficultyOptions[0]!.difficultyId)
    }
  }, [dungeonId, difficultyOptions, difficultyId])

  const stats = useMemo(() => {
    if (!dungeonId || difficultyId == null || !digimonRoleById.size) return null
    return aggregatePublicMeterStats(rows, digimonRoleById, dungeonId, difficultyId)
  }, [rows, digimonRoleById, dungeonId, difficultyId])

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
              <h2 className="meter-parses-section-title">Top Digimon DPS</h2>
              <div className="meter-public-charts-2col">
                {METER_ROLE_BUCKETS.map((b) => (
                  <MeterHorizontalBarChart
                    key={b}
                    title={METER_ROLE_BUCKET_LABELS[b]}
                    entries={stats.digimonByBucket[b]}
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
                    sortedDpsAsc={stats.sortedDpsByBucket[b]}
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
