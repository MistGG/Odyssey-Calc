import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MeterActivityFeed } from '../components/MeterActivityFeed'
import { MeterSubNav } from '../components/MeterSubNav'
import {
  buildMeterActivityFeedItems,
  METER_ACTIVITY_FEED_LIMIT,
  scopePoolsFromFeedItems,
  type ActivityFeedScopePools,
} from '../lib/meterActivityFeed'
import {
  fetchMeterSiteStats,
  getGlobalRecentPublicParsesCached,
  loadDigimonRoleMapForMeter,
} from '../lib/meterDataSource'
import { isGlobalRecentParseCacheFresh } from '../lib/meterParseCache'
import type { PublicMeterParseRow } from '../lib/meterPublicStats'
import { METER_ROLE_BUCKET_LABELS, METER_ROLE_BUCKETS, type MeterRoleBucket } from '../lib/meterRoleBuckets'

const FEED_REFRESH_MS = 5 * 60_000
const ACTIVITY_STATS_DEFER_MS = 2500

function formatInt(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function formatFeedWindowLabel(items: ReturnType<typeof buildMeterActivityFeedItems>): string {
  if (!items.length) return 'No recent clears yet'
  const newest = new Date(items[0]!.createdAt).getTime()
  const oldest = new Date(items[items.length - 1]!.createdAt).getTime()
  if (!Number.isFinite(newest) || !Number.isFinite(oldest)) return `From latest ${items.length} clears`
  const spanHours = Math.max(0, (newest - oldest) / (1000 * 60 * 60))
  if (spanHours < 1) return `From latest ${items.length} clears (~last hour)`
  if (spanHours < 24) return `From latest ${items.length} clears (~last ${Math.round(spanHours)}h)`
  const spanDays = Math.round(spanHours / 24)
  return `From latest ${items.length} clears (~last ${spanDays}d)`
}

type MeterActivitySummary = {
  uniquePlayers: number
  recentClears: number
  totalMembers: number
  roleCounts: Record<MeterRoleBucket, number>
  scopeActivity: Array<{
    key: string
    dungeonName: string
    difficultyLabel: string
    clears: number
  }>
}

export function MeterActivityPage() {
  const [rows, setRows] = useState<PublicMeterParseRow[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [digimonRoleById, setDigimonRoleById] = useState<Map<string, string>>(() => new Map())
  const [poolsByScope, setPoolsByScope] = useState<ActivityFeedScopePools>(() => new Map())
  const [totalTamersParsed, setTotalTamersParsed] = useState<number | null>(null)
  const [totalParsesStored, setTotalParsesStored] = useState<number | null>(null)
  const [totalRoleCounts, setTotalRoleCounts] = useState<Record<MeterRoleBucket, number> | null>(null)

  const loadFeed = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false
    if (!silent) setLoading(true)
    else setRefreshing(true)
    setLoadError(null)

    const res = await getGlobalRecentPublicParsesCached(METER_ACTIVITY_FEED_LIMIT, (updated) => {
      setRows(updated.slice(0, METER_ACTIVITY_FEED_LIMIT))
      if (!silent) setLoading(false)
    })

    if (res.error) setLoadError(res.error)
    setRows(res.rows.slice(0, METER_ACTIVITY_FEED_LIMIT))
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    void loadFeed()
    void loadDigimonRoleMapForMeter()
      .then(setDigimonRoleById)
      .catch(() => {})

    const statsTimer = window.setTimeout(() => {
      void fetchMeterSiteStats()
        .then((res) => {
          if (res.error) return
          setTotalParsesStored(res.totalParses)
          setTotalTamersParsed(res.uniqueTamers)
          setTotalRoleCounts(res.roleCounts)
        })
        .catch(() => {})
    }, ACTIVITY_STATS_DEFER_MS)

    return () => window.clearTimeout(statsTimer)
  }, [loadFeed])

  useEffect(() => {
    const id = window.setInterval(() => {
      if (isGlobalRecentParseCacheFresh()) return
      void loadFeed({ silent: true })
    }, FEED_REFRESH_MS)
    return () => window.clearInterval(id)
  }, [loadFeed])

  const feedItems = useMemo(
    () => buildMeterActivityFeedItems(rows, digimonRoleById),
    [rows, digimonRoleById],
  )

  const summary = useMemo<MeterActivitySummary>(() => {
    const playerKeys = new Set<string>()
    const scopeCounts = new Map<
      string,
      { dungeonName: string; difficultyLabel: string; clears: number }
    >()
    const roleCounts = METER_ROLE_BUCKETS.reduce(
      (acc, role) => {
        acc[role] = 0
        return acc
      },
      {} as Record<MeterRoleBucket, number>,
    )
    let totalMembers = 0

    for (const item of feedItems) {
      const scopeKey = `${item.dungeonId}:${item.difficultyId}`
      const dungeonName = item.dungeonName
      const difficultyLabel = item.difficultyLabel
      const scope = scopeCounts.get(scopeKey)
      if (scope) scope.clears += 1
      else scopeCounts.set(scopeKey, { dungeonName, difficultyLabel, clears: 1 })
      for (const member of item.members) {
        playerKeys.add(member.playerKey)
        totalMembers += 1
        if (member.roleLabel === '—') continue
        roleCounts[member.roleBucket] += 1
      }
    }

    return {
      uniquePlayers: playerKeys.size,
      recentClears: feedItems.length,
      totalMembers,
      roleCounts,
      scopeActivity: [...scopeCounts.entries()]
        .map(([key, value]) => ({
          key,
          dungeonName: value.dungeonName,
          difficultyLabel: value.difficultyLabel,
          clears: value.clears,
        }))
        .sort((a, b) => b.clears - a.clears)
        .slice(0, 10),
    }
  }, [feedItems])

  const roleMax = useMemo(() => {
    const source = totalRoleCounts ?? summary.roleCounts
    const values = METER_ROLE_BUCKETS.map((role) => source[role])
    return Math.max(1, ...values)
  }, [summary.roleCounts, totalRoleCounts])
  const scopeMax = useMemo(
    () => Math.max(1, ...summary.scopeActivity.map((s) => s.clears)),
    [summary.scopeActivity],
  )
  const feedWindowLabel = useMemo(() => formatFeedWindowLabel(feedItems), [feedItems])

  useEffect(() => {
    setPoolsByScope(scopePoolsFromFeedItems(feedItems))
  }, [feedItems])

  return (
    <div className="meter-parses-page meter-activity-page">
      <header className="meter-parses-logged-head meter-parses-logged-head--bar meter-public-head">
        <div className="meter-activity-head__title-block">
          <h1 className="meter-parses-title">Meter</h1>
          <p className="meter-activity-lead">
            Live parse feed, join the community with <Link to="/companion">Odyssey Companion</Link>
          </p>
        </div>
        <MeterSubNav />
      </header>

      {loadError ? <p className="meter-parses-error meter-parses-error--center">{loadError}</p> : null}

      <section className="meter-activity-layout">
        <div className="meter-activity-layout__feed">
          <MeterActivityFeed
            items={feedItems}
            poolsByScope={poolsByScope}
            loading={loading && !rows.length}
            refreshing={refreshing}
          />
        </div>

        <aside className="meter-activity-layout__stats" aria-label="Activity summary">
          <div className="meter-activity-stat-grid">
            <article className="meter-activity-stat-card">
              <p className="meter-activity-stat-card__label">Tamers parsed (all time)</p>
              <p className="meter-activity-stat-card__value">
                {totalTamersParsed != null ? formatInt(totalTamersParsed) : '...'}
              </p>
            </article>
            <article className="meter-activity-stat-card">
              <p className="meter-activity-stat-card__label">Total parses stored</p>
              <p className="meter-activity-stat-card__value">
                {totalParsesStored != null ? formatInt(totalParsesStored) : '...'}
              </p>
            </article>
          </div>

          <article className="meter-activity-panel">
            <h2 className="meter-activity-panel__title">Unique tamers by role</h2>
            <ul className="meter-activity-bars">
              {METER_ROLE_BUCKETS.map((role) => {
                const source = totalRoleCounts ?? summary.roleCounts
                const value = source[role]
                const widthPct = Math.round((value / roleMax) * 100)
                return (
                  <li key={role} className="meter-activity-bars__row">
                    <div className="meter-activity-bars__meta">
                      <span>{METER_ROLE_BUCKET_LABELS[role]}</span>
                      <span>{formatInt(value)}</span>
                    </div>
                    <div className="meter-activity-bars__track">
                      <div className="meter-activity-bars__fill" style={{ width: `${widthPct}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          </article>

          <article className="meter-activity-panel">
            <h2 className="meter-activity-panel__title">Recent clears</h2>
            {summary.scopeActivity.length ? (
              <ul className="meter-activity-bars">
                {summary.scopeActivity.map((scope) => {
                  const widthPct = Math.round((scope.clears / scopeMax) * 100)
                  return (
                    <li key={scope.key} className="meter-activity-bars__row">
                      <div className="meter-activity-bars__meta">
                        <span className="meter-activity-scope-label">
                          <span className="meter-activity-scope-label__name">{scope.dungeonName}</span>
                          {scope.difficultyLabel ? (
                            <span className="meter-activity-scope-label__tag">{scope.difficultyLabel}</span>
                          ) : null}
                        </span>
                        <span>{scope.clears}</span>
                      </div>
                      <div className="meter-activity-bars__track">
                        <div className="meter-activity-bars__fill" style={{ width: `${widthPct}%` }} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="meter-parses-muted">Waiting for uploads…</p>
            )}
          </article>
          <p className="meter-activity-window-note">{feedWindowLabel}</p>
        </aside>
      </section>
    </div>
  )
}
