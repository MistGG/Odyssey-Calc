import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import {
  fetchNeptunemonInfo,
  fetchRemoteBossSchedule,
  formatCountdown,
  getDefaultBossSchedule,
  isBossAlive,
  itemIconUrl,
  monsterModelUrl,
  nextBossSpawnUtcMs,
  readPendingBossSpawnUtcMs,
  submitBossTimerReport,
  type BossInfo,
  type BossSchedule,
  clearPendingBossSpawnUtcMs,
  writePendingBossSpawnUtcMs,
} from '../lib/bossTimers'

function formatTime(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms))
}

function qtyRange(min: number, max: number): string {
  return min === max ? `x${min}` : `x${min}-${max}`
}

function validObservedAliveMs(now: number, spawnUtcMs: number): number | null {
  const aliveWindowMs = Math.round((now - spawnUtcMs) / 1000) * 1000
  if (aliveWindowMs < 5_000 || aliveWindowMs > 15 * 60_000) return null
  return aliveWindowMs
}

export function BossTimersPage() {
  const { supabase, user, authReady } = useAuth()
  const scheduleRef = useRef<BossSchedule>(getDefaultBossSchedule())
  const pendingSpawnRef = useRef<number | null>(readPendingBossSpawnUtcMs())
  const [schedule, setSchedule] = useState<BossSchedule>(() => scheduleRef.current)
  const [bossInfo, setBossInfo] = useState<BossInfo | null>(null)
  const [infoError, setInfoError] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [reportStatus, setReportStatus] = useState<string | null>(null)
  const [reportBusy, setReportBusy] = useState<'spawn' | 'death' | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    scheduleRef.current = schedule
  }, [schedule])

  useEffect(() => {
    const id = window.setInterval(() => setTick((v) => v + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    void fetchNeptunemonInfo()
      .then((info) => {
        if (cancelled) return
        setBossInfo(info)
        setInfoError(null)
      })
      .catch((e) => {
        if (!cancelled) setInfoError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const refreshRemoteSchedule = useCallback(() => {
    if (!supabase) return
    void fetchRemoteBossSchedule(supabase)
      .then((remote) => {
        if (!remote) return
        setSchedule((current) => (remote.updatedAtMs > current.updatedAtMs ? remote : current))
        setSyncError(null)
      })
      .catch((e) => setSyncError(e instanceof Error ? e.message : String(e)))
  }, [supabase])

  useEffect(() => {
    refreshRemoteSchedule()
    const id = window.setInterval(refreshRemoteSchedule, 60_000)
    return () => window.clearInterval(id)
  }, [refreshRemoteSchedule])

  const now = Date.now() + tick * 0
  const alive = isBossAlive(now, schedule)
  const nextSpawn = nextBossSpawnUtcMs(now, schedule)
  const countdown = formatCountdown(nextSpawn - now)
  const respawnMin = schedule.respawnWaitMs / 60_000
  const respawnLabel = Number.isInteger(respawnMin)
    ? `${respawnMin} min`
    : `${Math.floor(respawnMin)}m ${Math.round((respawnMin % 1) * 60)}s`

  const modelUrl = useMemo(() => monsterModelUrl(bossInfo?.modelId ?? ''), [bossInfo?.modelId])

  const submitReport = useCallback(
    async (eventType: 'spawn' | 'death') => {
      const observed = Date.now()
      const current = scheduleRef.current
      let nextSchedule: BossSchedule
      if (eventType === 'spawn') {
        pendingSpawnRef.current = observed
        writePendingBossSpawnUtcMs(observed)
        nextSchedule = {
          ...current,
          anchorUtcMs: observed,
          updatedAtMs: observed,
        }
      } else {
        const observedSpawn = pendingSpawnRef.current ?? readPendingBossSpawnUtcMs()
        if (observedSpawn === null) {
          setReportStatus('Click Spawn now first, then Death now when the boss dies.')
          return
        }
        const aliveWindowMs = validObservedAliveMs(observed, observedSpawn)
        if (aliveWindowMs === null) {
          pendingSpawnRef.current = null
          clearPendingBossSpawnUtcMs()
          setReportStatus('Death report is outside the expected alive window.')
          return
        }
        nextSchedule = {
          ...current,
          anchorUtcMs: observedSpawn,
          aliveWindowMs,
          respawnWaitMs: 90 * 60_000,
          updatedAtMs: observed,
        }
      }

      setSchedule(nextSchedule)
      setReportBusy(eventType)
      setReportStatus(null)
      try {
        await submitBossTimerReport(supabase, nextSchedule, eventType, observed)
        setReportStatus(
          user
            ? 'Report submitted with your account.'
            : 'Anonymous report submitted.',
        )
        if (eventType === 'death') {
          pendingSpawnRef.current = null
          clearPendingBossSpawnUtcMs()
        }
        refreshRemoteSchedule()
      } catch (e) {
        setReportStatus(e instanceof Error ? e.message : String(e))
      } finally {
        setReportBusy(null)
      }
    },
    [refreshRemoteSchedule, supabase, user],
  )

  return (
    <div className="boss-timers-page">
      <section className="boss-timers-hero">
        <div>
          <p className="eyebrow">World Boss Timer</p>
          <h1>Neptunemon</h1>
          <p>
            Shared community timer with automatic crowd corrections. Reports can be submitted anonymously or with your
            signed-in Odyssey Calc account.
          </p>
        </div>
        <div className="boss-timers-hero__status">
          <span className={alive ? 'boss-status-pill boss-status-pill--alive' : 'boss-status-pill'}>
            {alive ? 'Alive now' : 'Waiting'}
          </span>
          <strong>{alive ? 'Alive window' : countdown}</strong>
          <span>Next {formatTime(nextSpawn)}</span>
        </div>
      </section>

      <section className="boss-timer-card-site">
        <div className="boss-timer-card-site__art">
          {modelUrl ? <img src={modelUrl} alt="" decoding="async" /> : <span>{bossInfo?.name?.slice(0, 1) ?? 'N'}</span>}
        </div>

        <div className="boss-timer-card-site__main">
          <div className="boss-timer-card-site__top">
            <div>
              <h2>{bossInfo?.name ?? 'Neptunemon'}</h2>
              <p>{bossInfo?.mapName ?? 'Olympos Festival Island'} · Bottom Right</p>
            </div>
            <div className="boss-timer-count-site">
              <span>{alive ? 'Status' : 'Next spawn in'}</span>
              <strong>{alive ? 'Alive' : countdown}</strong>
            </div>
          </div>

          <div className="boss-timer-meta-grid">
            <div>
              <span>Next local time</span>
              <strong>{formatTime(nextSpawn)}</strong>
            </div>
            <div>
              <span>Cycle</span>
              <strong>{respawnLabel}</strong>
            </div>
            <div>
              <span>Reporter</span>
              <strong>{authReady && user ? 'Signed in' : 'Anonymous'}</strong>
            </div>
          </div>

          <div className="boss-timer-report-actions">
            <button type="button" className="boss-report-btn boss-report-btn--spawn" disabled={reportBusy !== null} onClick={() => void submitReport('spawn')}>
              {reportBusy === 'spawn' ? 'Submitting...' : 'Spawn now'}
            </button>
            <button type="button" className="boss-report-btn boss-report-btn--death" disabled={reportBusy !== null} onClick={() => void submitReport('death')}>
              {reportBusy === 'death' ? 'Submitting...' : 'Death now'}
            </button>
            {reportStatus ? <p>{reportStatus}</p> : syncError ? <p>{syncError}</p> : null}
          </div>
        </div>

        <div className="boss-timer-card-site__drops">
          <div className="boss-drops-panel__head">
            <div>
              <p className="eyebrow">Drop Data</p>
              <h3>Loot</h3>
            </div>
            {infoError ? <p className="boss-drops-error">{infoError}</p> : null}
          </div>

          {bossInfo?.rewards.length ? (
            <div className="boss-drops-grid">
              {bossInfo.rewards.map((reward) => (
                <article key={reward.key} className="boss-drop-card">
                  {reward.iconId ? <img src={itemIconUrl(reward.iconId)} alt="" decoding="async" /> : <span aria-hidden />}
                  <div>
                    <strong>{reward.itemName}</strong>
                    <span>
                      {qtyRange(reward.min, reward.max)} · {reward.rateLabel}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="boss-drops-empty">{infoError ? 'Could not load drops.' : 'Loading drop data...'}</p>
          )}
        </div>
      </section>
    </div>
  )
}
