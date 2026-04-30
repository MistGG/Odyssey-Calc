import type { ReactNode } from 'react'
import {
  ATTRIBUTE_ADVANTAGE_SKILL_DAMAGE_MULT,
  ATTRIBUTE_TRIANGLE_EDGES,
  attributeAdvantageSkillDamageMultiplier,
  attributeTriangleStrongVs,
  normalizeWikiAttribute,
} from '../lib/attributeAdvantage'
import { DPS_TARGET_ENEMY_ATTRIBUTE_OPTIONS } from '../lib/wikiListFacetOptions'

function enemyAttrSelectModifier(value: string): string {
  if (!value.trim()) return 'enemy-attr-select--unset'
  if (value === 'None') return 'enemy-attr-select--neutral'
  const v = value.toLowerCase()
  if (v === 'vaccine' || v === 'data' || v === 'virus') return `enemy-attr-select--${v}`
  return 'enemy-attr-select--unset'
}

function pillClassForName(name: string): string {
  const n = name.toLowerCase()
  if (n === 'vaccine') return 'enemy-attr-pill enemy-attr-pill--vaccine'
  if (n === 'data') return 'enemy-attr-pill enemy-attr-pill--data'
  if (n === 'virus') return 'enemy-attr-pill enemy-attr-pill--virus'
  if (n === 'none') return 'enemy-attr-pill enemy-attr-pill--neutral'
  return 'enemy-attr-pill enemy-attr-pill--misc'
}

export type EnemyAttributeTargetFieldProps = {
  value: string
  onChange: (next: string) => void
  /** Wiki attribute of the attacker; when set, shows who you beat on the triangle. */
  attackerAttribute?: string | null
  selectId?: string
  ariaLabel: string
  /** Extra class on the `<select>` (e.g. tier layout). */
  selectClassName?: string
  /** Shown above the select (e.g. lab “Enemy attribute” when using {@link afterSelectSlot}). */
  fieldCaption?: string
  /** Rendered in the same row as the select (e.g. simulation seconds on the lab). */
  afterSelectSlot?: ReactNode
  /** When false, only the dropdown (+ optional {@link afterSelectSlot}) is shown. */
  showLegend?: boolean
}

export function EnemyAttributeTargetField({
  value,
  onChange,
  attackerAttribute,
  selectId,
  ariaLabel,
  selectClassName = '',
  fieldCaption,
  afterSelectSlot,
  showLegend = true,
}: EnemyAttributeTargetFieldProps) {
  const aNorm = normalizeWikiAttribute(attackerAttribute)
  const strongVs = attributeTriangleStrongVs(attackerAttribute)
  const multThisPick = attributeAdvantageSkillDamageMultiplier(attackerAttribute, value)
  const activeVsPick = multThisPick > 1 + 1e-9

  const selectMod = enemyAttrSelectModifier(value)
  const selectClasses = ['enemy-attr-select', selectMod, selectClassName].filter(Boolean).join(' ')

  const selectEl = (
    <select
      id={selectId}
      className={selectClasses}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
    >
      <option value="">No attribute advantage</option>
      {DPS_TARGET_ENEMY_ATTRIBUTE_OPTIONS.map((attr) => (
        <option key={attr} value={attr}>
          {attr}
        </option>
      ))}
    </select>
  )

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
        <div className="enemy-attr-legend" aria-hidden="true">
          <p className="enemy-attr-legend-title">Elemental Advantages</p>
          <ul className="enemy-attr-legend-list">
            {ATTRIBUTE_TRIANGLE_EDGES.map(({ attacker, defender }) => (
              <li key={`${attacker}-${defender}`} className="enemy-attr-legend-item">
                <span className={pillClassForName(attacker)}>{attacker}</span>
                <span className="enemy-attr-legend-beats"> beats </span>
                <span className={pillClassForName(defender)}>{defender}</span>
              </li>
            ))}
            <li className="enemy-attr-legend-item enemy-attr-legend-item--neutral">
              <span className={pillClassForName('None')}>None</span>
              <span className="enemy-attr-legend-beats">
                {' '}
                - All skill dmg x {ATTRIBUTE_ADVANTAGE_SKILL_DAMAGE_MULT}
              </span>
            </li>
          </ul>
        </div>
      ) : null}

      {aNorm ? (
        <p className="enemy-attr-you-line" role="status">
          {strongVs ? (
            <>
              Your <span className={pillClassForName(aNorm)}>{aNorm}</span> beats{' '}
              <span className={pillClassForName(strongVs)}>{strongVs}</span> — choose enemy attribute{' '}
              <span className={pillClassForName(strongVs)}>{strongVs}</span> for ×
              {ATTRIBUTE_ADVANTAGE_SKILL_DAMAGE_MULT} skill damage.
            </>
          ) : (
            <>
              Your <span className={pillClassForName(aNorm)}>{aNorm}</span> is not on the triangle — choose enemy{' '}
              <span className={pillClassForName('None')}>None</span> for ×{ATTRIBUTE_ADVANTAGE_SKILL_DAMAGE_MULT}{' '}
              skills only.
            </>
          )}
          {value.trim() ? (
            <>
              {' '}
              <span className={activeVsPick ? 'enemy-attr-you-active' : 'enemy-attr-you-inactive'}>
                {activeVsPick
                  ? `This pick: bonus active.`
                  : `This pick: no attribute bonus for your type.`}
              </span>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  )
}
