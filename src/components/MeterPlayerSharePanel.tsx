import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchMeterProfileShare,
  generateMeterProfileShare,
  isMeterProfileShareConfigured,
  type MeterProfileShareRecord,
} from '../api/meterProfileShareService'
import {
  canRefreshMeterProfileShare,
  formatShareCooldown,
  resolveMeterShareSiteOrigin,
  shareCooldownRemainingMs,
  type MeterProfileShareSnapshot,
} from '../lib/meterPlayerShare'

export function MeterPlayerSharePanel({
  playerKey,
  snapshot,
  portraitUrl,
  profileLoading,
}: {
  playerKey: string
  snapshot: MeterProfileShareSnapshot | null
  portraitUrl?: string
  profileLoading: boolean
}) {
  const [record, setRecord] = useState<MeterProfileShareRecord | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [copyOk, setCopyOk] = useState(false)
  const [tick, setTick] = useState(0)

  const configured = isMeterProfileShareConfigured()

  const reload = useCallback(async () => {
    if (!configured || !playerKey) return
    const res = await fetchMeterProfileShare(playerKey)
    if (res.error) setLoadError(res.error)
    else {
      setLoadError(null)
      setRecord(res.record)
    }
  }, [configured, playerKey])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!record?.generatedAt) return
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000)
    return () => window.clearInterval(id)
  }, [record?.generatedAt])

  const cooldownMs = useMemo(
    () => (record ? shareCooldownRemainingMs(record.generatedAt) : 0),
    [record, tick],
  )

  const canGenerate = Boolean(snapshot) && !profileLoading && canRefreshMeterProfileShare(record?.generatedAt)
  const cooldownLabel = cooldownMs > 0 ? formatShareCooldown(cooldownMs) : ''

  const onGenerate = async () => {
    if (!snapshot || !canGenerate || generating) return
    setGenerating(true)
    setActionError(null)
    setCopyOk(false)

    const res = await generateMeterProfileShare({
      playerKey,
      snapshot,
      portraitUrl,
      appSiteOrigin: resolveMeterShareSiteOrigin(),
    })

    setGenerating(false)
    if (!res.ok) {
      setActionError(res.error)
      if (res.rateLimited) void reload()
      return
    }
    setRecord(res.record)
  }

  const onCopy = async () => {
    if (!record?.sharePageUrl) return
    try {
      await navigator.clipboard.writeText(record.sharePageUrl)
      setCopyOk(true)
      window.setTimeout(() => setCopyOk(false), 2500)
    } catch {
      setActionError('Could not copy link')
    }
  }

  if (!configured) {
    return (
      <section className="meter-profile-share meter-parses-meter-chrome">
        <p className="meter-parses-muted">
          Discord previews are not configured (missing Supabase). Add credentials and run the
          meter profile share SQL in the Supabase SQL editor.
        </p>
      </section>
    )
  }

  return (
    <section className="meter-profile-share meter-parses-meter-chrome" aria-labelledby="meter-profile-share-title">
      <div className="meter-profile-share__head">
        <h3 id="meter-profile-share-title" className="meter-parses-section-title">
          Discord preview
        </h3>
        {record ? (
          <time className="meter-profile-share__updated" dateTime={record.generatedAt}>
            Updated {new Date(record.generatedAt).toLocaleString()}
          </time>
        ) : null}
      </div>

      <p className="meter-profile-share__hint">
        Generate a share link for Discord. Previews can be refreshed once per hour per tamer.
      </p>

      {loadError ? <p className="meter-parses-error">{loadError}</p> : null}
      {actionError ? <p className="meter-parses-error">{actionError}</p> : null}

      <div className="meter-profile-share__actions">
        <button
          type="button"
          className="guidebook-btn guidebook-btn--ghost guidebook-btn--small"
          disabled={!canGenerate || generating || profileLoading || !snapshot}
          onClick={() => void onGenerate()}
        >
          {generating
            ? 'Generating…'
            : record
              ? 'Refresh Discord preview'
              : 'Generate Discord preview'}
        </button>
        {!canGenerate && cooldownLabel ? (
          <span className="meter-profile-share__cooldown">Available in {cooldownLabel}</span>
        ) : null}
        {record ? (
          <button
            type="button"
            className="guidebook-btn guidebook-btn--ghost guidebook-btn--small"
            onClick={() => void onCopy()}
          >
            {copyOk ? 'Copied!' : 'Copy Discord link'}
          </button>
        ) : null}
      </div>

      {record?.sharePageUrl ? (
        <p className="meter-profile-share__url">
          <a href={record.sharePageUrl} target="_blank" rel="noreferrer">
            {record.sharePageUrl}
          </a>
        </p>
      ) : null}
    </section>
  )
}
