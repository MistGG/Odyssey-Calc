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
  cache: TierListCache | null
  error: string | null
  onRefresh: () => void
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
  cache,
  error,
  onRefresh,
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
        onClick={onRefresh}
      >
        {building ? 'Checking all Digimon…' : 'Update tier list'}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
