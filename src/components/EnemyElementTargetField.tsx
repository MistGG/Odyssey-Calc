import type { ReactNode } from 'react'
import {
  TRUE_VICE_ELEMENT_BEAT_EDGES,
  TRUE_VICE_ELEMENT_CHAINS_HELP,
  trueViceElementBeatsTarget,
  trueViceElementBonusActive,
  normalizeWikiElement,
} from '../lib/elementAdvantage'
import { DPS_TARGET_ENEMY_ELEMENT_OPTIONS } from '../lib/wikiListFacetOptions'

function pillClassForElement(name: string): string {
  const n = name.trim().toLowerCase()
  if (
    [
      'fire',
      'water',
      'wind',
      'earth',
      'light',
      'darkness',
      'steel',
      'wood',
      'thunder',
      'ice',
      'neutral',
    ].includes(n)
  ) {
    return `enemy-attr-pill enemy-attr-pill--elem enemy-attr-pill--elem-${n}`
  }
  return 'enemy-attr-pill enemy-attr-pill--elem enemy-attr-pill--elem-misc'
}

export type EnemyElementTargetFieldProps = {
  value: string
  onChange: (next: string) => void
  /** Wiki element of the attacker (Digimon). */
  attackerElement?: string | null
  selectId?: string
  ariaLabel: string
  selectClassName?: string
  fieldCaption?: string
  afterSelectSlot?: ReactNode
  showLegend?: boolean
  /** Label for the empty value option (`value=""`). Default matches Lab wording. */
  unsetOptionLabel?: string
}

export function EnemyElementTargetField({
  value,
  onChange,
  attackerElement,
  selectId,
  ariaLabel,
  selectClassName = '',
  fieldCaption,
  afterSelectSlot,
  showLegend = true,
  unsetOptionLabel = 'No enemy element',
}: EnemyElementTargetFieldProps) {
  const active = trueViceElementBonusActive(attackerElement, value)

  const selectEl = (
    <select
      id={selectId}
      className={['enemy-attr-select', selectClassName].filter(Boolean).join(' ')}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
    >
      <option value="">{unsetOptionLabel}</option>
      {DPS_TARGET_ENEMY_ELEMENT_OPTIONS.map((el: string) => (
        <option key={el} value={el}>
          {el}
        </option>
      ))}
    </select>
  )

  const aNorm = normalizeWikiElement(attackerElement)
  const beats = aNorm ? trueViceElementBeatsTarget(attackerElement) : ''

  return (
    <div className="enemy-attr-target-field">
      {afterSelectSlot != null ? (
        <div className="enemy-attr-select-row enemy-attr-select-row--with-slot">
          <div className="enemy-attr-select-col">
            {fieldCaption ? <span className="enemy-attr-field-caption">{fieldCaption}</span> : null}
            {selectEl}
          </div>
          {afterSelectSlot}
        </div>
      ) : fieldCaption ? (
        <div className="enemy-attr-select-col">
          <span className="enemy-attr-field-caption">{fieldCaption}</span>
          {selectEl}
        </div>
      ) : (
        selectEl
      )}

      {showLegend ? (
        <div className="enemy-attr-legend enemy-attr-legend--element" aria-hidden="true">
          <p className="enemy-attr-legend-title">Element matchup (True Vice)</p>
          <p className="enemy-attr-legend-sub">
            On gear, True Vice <strong>element</strong> lines: digimon element must match the roll, enemy element
            must be the one your element <strong>beats</strong> below (not a global ×1.5).
          </p>
          <ul className="enemy-attr-legend-list">
            {TRUE_VICE_ELEMENT_BEAT_EDGES.map(({ attacker, defender }) => (
              <li key={`${attacker}-${defender}`} className="enemy-attr-legend-item">
                <span className={pillClassForElement(attacker)}>{attacker === 'Steel' ? 'Steel (Iron)' : attacker}</span>
                <span className="enemy-attr-legend-beats"> beats </span>
                <span className={pillClassForElement(defender)}>{defender}</span>
              </li>
            ))}
            <li className="enemy-attr-legend-item enemy-attr-legend-item--muted">
              Weak-to rings (same chart): {TRUE_VICE_ELEMENT_CHAINS_HELP.join(' · ')}
            </li>
          </ul>
        </div>
      ) : null}

      {aNorm ? (
        <p className="enemy-attr-you-line" role="status">
          {beats ? (
            <>
              For True Vice, a <strong>{aNorm}</strong> digimon beats <strong>{beats}</strong> — pick enemy
              element <strong>{beats}</strong> (and a matching element line on gear).
            </>
          ) : (
            <>
              Element <strong>{aNorm}</strong> is not on the True Vice chart — True Vice element lines tied to
              this digimon won&apos;t proc from matchups.
            </>
          )}
          {value.trim() ? (
            <>
              {' '}
              <span className={active ? 'enemy-attr-you-active' : 'enemy-attr-you-inactive'}>
                {active
                  ? 'This pick: True Vice element bonus can apply (if gear matches).'
                  : 'This pick: no True Vice element matchup for your type.'}
              </span>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  )
}
