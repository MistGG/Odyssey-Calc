import { MeterSubNav } from './MeterSubNav'
import {
  isMeterLeaderboardCycleLive,
  METER_LEADERBOARD_CYCLES,
  type MeterLeaderboardCycle,
} from '../lib/meterLeaderboardCycles'

type DungeonOption = { dungeonId: string; dungeonName: string }
type DifficultyOption = { difficultyId: number; label: string }

export function MeterLeaderboardPreviewShell({
  leaderboardCycle,
  leaderboardCycleId,
  onLeaderboardCycleChange,
  dungeonId,
  onDungeonChange,
  difficultyId,
  onDifficultyChange,
  dungeonOptions,
  difficultyOptions,
  dungeonName,
  difficultyLabel,
  bootLoading,
  parsesRefreshing,
}: {
  leaderboardCycle: MeterLeaderboardCycle
  leaderboardCycleId: string
  onLeaderboardCycleChange: (cycleId: string) => void
  dungeonId: string
  onDungeonChange: (dungeonId: string) => void
  difficultyId: number | null
  onDifficultyChange: (difficultyId: number) => void
  dungeonOptions: DungeonOption[]
  difficultyOptions: DifficultyOption[]
  dungeonName: string
  difficultyLabel: string
  bootLoading: boolean
  parsesRefreshing: boolean
}) {
  const cycleLive = isMeterLeaderboardCycleLive(leaderboardCycle)
  const cycleNote = !cycleLive
    ? `${leaderboardCycle.label}. Rankings no longer update.`
    : leaderboardCycle.note

  return (
    <div className="meter-lb-preview-shell meter-parses-meter-chrome">
      <div className="meter-lb-preview-shell-glow" aria-hidden />
      <div className="meter-lb-preview-shell-top">
        <MeterSubNav />
      </div>

      <div className="meter-lb-preview-shell-body">
        <div
          className={`meter-lb-preview-shell-filters${parsesRefreshing ? ' meter-lb-preview-shell-filters--refreshing' : ''}`}
        >
          <label className="meter-lb-preview-shell-filter">
            <span className="meter-lb-preview-shell-filter-label">Cycle</span>
            <select
              value={leaderboardCycleId}
              onChange={(e) => onLeaderboardCycleChange(e.target.value)}
              disabled={bootLoading}
            >
              {METER_LEADERBOARD_CYCLES.map((cycle) => (
                <option key={cycle.id} value={cycle.id}>
                  {cycle.label}
                  {isMeterLeaderboardCycleLive(cycle) ? ' · Live' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="meter-lb-preview-shell-filter">
            <span className="meter-lb-preview-shell-filter-label">Dungeon</span>
            <select
              value={dungeonId}
              onChange={(e) => onDungeonChange(e.target.value)}
              disabled={!dungeonOptions.length || bootLoading}
            >
              {dungeonOptions.map((d) => (
                <option key={d.dungeonId} value={d.dungeonId}>
                  {d.dungeonName}
                </option>
              ))}
            </select>
          </label>
          <label className="meter-lb-preview-shell-filter">
            <span className="meter-lb-preview-shell-filter-label">Difficulty</span>
            <select
              value={difficultyId ?? ''}
              onChange={(e) => onDifficultyChange(Number(e.target.value))}
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
            <span className="meter-lb-preview-shell-status" role="status">
              Updating…
            </span>
          ) : null}
        </div>

        <div className="meter-lb-preview-shell-context">
          <h1 className="meter-lb-preview-shell-title">{dungeonName}</h1>
          <div className="meter-lb-preview-shell-meta">
            <span className="meter-lb-preview-shell-scope">{difficultyLabel}</span>
            <span className={`meter-lb-preview-badge${cycleLive ? ' meter-lb-preview-badge--live' : ''}`}>
              {leaderboardCycle.label}
              {cycleLive ? ' · Live' : ''}
            </span>
          </div>
          {cycleNote ? (
            <p className="meter-lb-preview-shell-note meter-parses-muted" role="status">
              {cycleNote}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
