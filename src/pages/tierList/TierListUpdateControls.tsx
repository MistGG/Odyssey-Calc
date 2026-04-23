import type { TierListCache } from '../../lib/tierList'

type Props = {
  status: string
  progressNumerator: number
  progressDenominator: number
  progress: number
  showProgressBar: boolean
  fadeProgressBar: boolean
  lastCheckedAt: string | undefined
  initializing: boolean
  building: boolean
  buildMode: 'incremental' | 'force'
  cache: TierListCache | null
  error: string | null
  onUpdateIncremental: () => void
  onUpdateForce: () => void
}

export function TierListUpdateControls({
  status,
  progressNumerator,
  progressDenominator,
  progress,
  showProgressBar,
  fadeProgressBar,
  lastCheckedAt,
  initializing,
  building,
  buildMode,
  cache,
  error,
  onUpdateIncremental,
  onUpdateForce,
}: Props) {
  return (
    <section className="lab-result">
      <h3>Update tier list</h3>
      <p className="muted">{status}</p>
      <p>
        Progress:{' '}
        <strong>
          {progressNumerator}/{progressDenominator || '…'} ({progress.toFixed(1)}%)
        </strong>
      </p>
      {showProgressBar && (
        <div className={`tier-progress ${fadeProgressBar ? 'tier-progress-fade' : ''}`}>
          <div className="tier-progress-bar" style={{ width: `${progress}%` }} />
        </div>
      )}
      <p className="muted">
        Last checked:{' '}
        {lastCheckedAt ? new Date(lastCheckedAt).toLocaleString() : 'Never'}
      </p>
      <button
        type="button"
        className="tier-update-btn"
        disabled={initializing || building || !cache}
        onClick={onUpdateIncremental}
      >
        {building && buildMode === 'incremental'
          ? 'Updating changed Digimon…'
          : 'Update tier list'}
      </button>
      <button
        type="button"
        className="tier-update-btn tier-update-btn-secondary"
        disabled={initializing || building || !cache}
        onClick={onUpdateForce}
      >
        {building && buildMode === 'force' ? 'Force checking all…' : 'Force check all'}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
