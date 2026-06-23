import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { MeterLeaderboardPreviewBoard } from '../components/MeterLeaderboardPreviewBoard'
import { MeterLeaderboardPreviewShell } from '../components/MeterLeaderboardPreviewShell'
import { fetchRecentMeterParseSelection } from '../lib/meterDataSource'
import { getCachedLeaderboardStats } from '../lib/meterLeaderboardStatsCache'
import { fetchPrecomputedMeterLeaderboard } from '../lib/meterLeaderboardPrecomputed'
import { fetchDigimonDistributionInWindow, type DigimonDistributionByBucket } from '../lib/meterDigimonDistribution'
import { fetchLeaderboardPartyMates, type PlayerPartyMatesByBucket } from '../lib/meterLeaderboardPartyMates'
import {
  getDefaultMeterLeaderboardCycle,
  getMeterLeaderboardCycle,
  meterLeaderboardCycleWindow,
} from '../lib/meterLeaderboardCycles'
import type { MeterPublicAggregates } from '../lib/meterPublicStats'
import {
  dungeonSelectOptions,
  difficultySelectOptions,
  loadWikiDungeonsForMeter,
} from '../lib/wikiDungeons'

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
  const [digimonDistribution, setDigimonDistribution] = useState<DigimonDistributionByBucket | null>(null)
  const [partyMates, setPartyMates] = useState<PlayerPartyMatesByBucket | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [bootLoading, setBootLoading] = useState(true)
  const [parsesRefreshing, setParsesRefreshing] = useState(false)
  const [wikiDungeons, setWikiDungeons] = useState<Awaited<ReturnType<typeof loadWikiDungeonsForMeter>>>([])
  const [dungeonId, setDungeonId] = useState('')
  const [difficultyId, setDifficultyId] = useState<number | null>(null)
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
    if (fromEvent != null && difficultyOptions.some((d) => d.difficultyId === fromEvent)) {
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
      setDigimonDistribution(null)
      setPartyMates(null)
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
      const [pre, distribution, party] = await Promise.all([
        fetchPrecomputedMeterLeaderboard({
          dungeonId,
          difficultyId,
          leaderboardCycleId: leaderboardCycle.id,
          windowStart: cycleWindow.windowStart,
          windowEnd: cycleWindow.windowEnd,
        }),
        fetchDigimonDistributionInWindow({
          dungeonId,
          difficultyId,
          windowStart: cycleWindow.windowStart,
          windowEnd: cycleWindow.windowEnd,
        }),
        fetchLeaderboardPartyMates({
          dungeonId,
          difficultyId,
          windowStart: cycleWindow.windowStart,
          windowEnd: cycleWindow.windowEnd,
        }),
      ])
      if (cancelled) return
      if (pre.error) setLoadError(pre.error)
      else if (distribution.error) setLoadError(distribution.error)
      else if (party.error) setLoadError(party.error)
      setPrecomputedStats(pre.stats)
      setDigimonDistribution(distribution.byBucket)
      setPartyMates(party.byBucket)
      setParsesRefreshing(false)
    })()

    return () => {
      cancelled = true
    }
  }, [dungeonId, difficultyId, leaderboardCycle, cycleWindow.windowEnd, cycleWindow.windowStart])

  const stats = precomputedStats
  const showLoading = parsesRefreshing && !stats

  const dungeonName =
    dungeonOptions.find((d) => d.dungeonId === dungeonId)?.dungeonName?.trim() || 'Dungeon'
  const difficultyLabel =
    difficultyOptions.find((d) => d.difficultyId === difficultyId)?.label?.trim() || 'Difficulty'

  return (
    <div className="meter-parses-page meter-public-page meter-lb-preview-page">
      <MeterLeaderboardPreviewShell
        leaderboardCycle={leaderboardCycle}
        leaderboardCycleId={leaderboardCycleId}
        onLeaderboardCycleChange={setLeaderboardCycleId}
        dungeonId={dungeonId}
        onDungeonChange={(id) => {
          setDungeonId(id)
          setDifficultyId(null)
        }}
        difficultyId={difficultyId}
        onDifficultyChange={setDifficultyId}
        dungeonOptions={dungeonOptions}
        difficultyOptions={difficultyOptions}
        dungeonName={dungeonName}
        difficultyLabel={difficultyLabel}
        bootLoading={bootLoading}
        parsesRefreshing={parsesRefreshing}
      />

      {loadError ? <p className="meter-parses-error meter-parses-error--center">{loadError}</p> : null}
      {bootLoading && !dungeonOptions.length ? (
        <p className="meter-parses-muted meter-parses-muted--center">Loading…</p>
      ) : showLoading ? (
        <p className="meter-parses-muted meter-parses-muted--center">Loading leaderboard…</p>
      ) : !dungeonOptions.length ? (
        <p className="meter-parses-muted meter-parses-muted--center">Could not load dungeon list from wiki.</p>
      ) : !dungeonId || difficultyId == null ? (
        <p className="meter-parses-muted meter-parses-muted--center">Select a dungeon and difficulty.</p>
      ) : stats && digimonDistribution && partyMates ? (
        <MeterLeaderboardPreviewBoard
          stats={stats}
          digimonDistribution={digimonDistribution}
          partyMates={partyMates}
          meterContext={{ dungeonId, difficultyId }}
        />
      ) : (
        <p className="meter-parses-muted meter-parses-muted--center">No rankings for this dungeon yet.</p>
      )}
    </div>
  )
}
