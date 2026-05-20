import { useEffect, useRef, useState } from 'react'
import type { DpsTierCategoryKey } from '../../lib/tierList'
import {
  formatTierFightDurationSec,
  TIER_FIGHT_DURATION_MAX_SEC,
  TIER_FIGHT_DURATION_MIN_SEC,
  TIER_FIGHT_DURATION_STEP_SEC,
} from '../../lib/tierFightDurationScale'

type Props = {
  dpsTierCategory: DpsTierCategoryKey
  tierFightDurationSec: number
  onFightDurationChange: (sec: number) => void
  /** When the user releases the range thumb, apply fight length to the matrix immediately. */
  onFightDurationPointerUp?: () => void
  dpsForceAutoCrit: boolean
  onDpsForceAutoCritChange: (v: boolean) => void
  dpsPerfectAtClone: boolean
  onDpsPerfectAtCloneChange: (v: boolean) => void
  dpsAutoAnimCancel: boolean
  onDpsAutoAnimCancelChange: (v: boolean) => void
}

export function TierDpsModifiersControls({
  dpsTierCategory,
  tierFightDurationSec,
  onFightDurationChange,
  onFightDurationPointerUp,
  dpsForceAutoCrit,
  onDpsForceAutoCritChange,
  dpsPerfectAtClone,
  onDpsPerfectAtCloneChange,
  dpsAutoAnimCancel,
  onDpsAutoAnimCancelChange,
}: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const aoe = dpsTierCategory === 'aoe'
  const sustained = dpsTierCategory === 'sustained'
  const activeCount = [dpsForceAutoCrit, dpsPerfectAtClone, dpsAutoAnimCancel].filter(Boolean).length

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="tier-modifiers-controls">
      <div className="tier-modifiers-popover-anchor">
        <button
          type="button"
          className={`tier-modifiers-trigger${open ? ' tier-modifiers-trigger--open' : ''}${activeCount > 0 ? ' tier-modifiers-trigger--has-active' : ''}`}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen((v) => !v)}
        >
          <span>Special Modifiers</span>
          {activeCount > 0 ? (
            <span className="tier-modifiers-trigger-badge" aria-label={`${activeCount} active`}>
              {activeCount}
            </span>
          ) : null}
        </button>
        {open ? (
          <div className="tier-modifiers-popover" role="dialog" aria-label="Special modifiers">
            <label className={aoe ? 'tier-dps-option tier-dps-option--disabled' : 'tier-dps-option'}>
              <input
                type="checkbox"
                checked={dpsForceAutoCrit}
                onChange={(e) => onDpsForceAutoCritChange(e.target.checked)}
                disabled={aoe}
              />
              Guaranteed crit
            </label>
            <label className={aoe ? 'tier-dps-option tier-dps-option--disabled' : 'tier-dps-option'}>
              <input
                type="checkbox"
                checked={dpsPerfectAtClone}
                onChange={(e) => onDpsPerfectAtCloneChange(e.target.checked)}
                disabled={aoe}
              />
              Perfect AT clone
            </label>
            <label
              className={aoe ? 'tier-dps-option tier-dps-option--disabled' : 'tier-dps-option tier-dps-option--with-note'}
            >
              <input
                type="checkbox"
                checked={dpsAutoAnimCancel}
                onChange={(e) => onDpsAutoAnimCancelChange(e.target.checked)}
                disabled={aoe}
              />
              <span className="tier-dps-option-label-text">Auto anim cancel</span>
              <span className="lab-inline-tooltip-wrap tier-dps-option-note-wrap">
                <span className="tier-community-badge" aria-hidden>
                  {'\u2605'}
                </span>
                <span role="tooltip" className="lab-inline-tooltip">
                  Special thanks to Yvelchrome for bringing this to my attention and testing it!
                </span>
              </span>
            </label>
          </div>
        ) : null}
      </div>
      <label
        className={`tier-fight-duration-inline tier-fight-duration-inline--filter${!sustained ? ' tier-fight-duration-inline--disabled' : ''}`}
        htmlFor="tier-fight-duration-sec"
        title={!sustained ? 'Fight length only affects the Sustained view' : undefined}
      >
        <span className="tier-fight-duration-inline-label">Fight length</span>
        <input
          id="tier-fight-duration-sec"
          type="range"
          min={TIER_FIGHT_DURATION_MIN_SEC}
          max={TIER_FIGHT_DURATION_MAX_SEC}
          step={TIER_FIGHT_DURATION_STEP_SEC}
          value={tierFightDurationSec}
          disabled={!sustained}
          onInput={(e) => onFightDurationChange(Number(e.currentTarget.value))}
          onPointerUp={() => {
            if (sustained) onFightDurationPointerUp?.()
          }}
        />
        <span className="tier-fight-duration-inline-value tier-fight-duration-value-pill">
          {formatTierFightDurationSec(tierFightDurationSec)}
        </span>
      </label>
    </div>
  )
}
