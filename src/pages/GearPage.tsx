import { useMemo, useState } from 'react'
import { EditableNumberInput } from '../components/EditableNumberInput'
import {
  GEAR_STORAGE_KEY,
  SEAL_STATS,
  TRUE_VICE_ATTRIBUTE_STATS,
  TRUE_VICE_ELEMENT_STATS,
  TRUE_VICE_SLOT_COUNT,
  clampTrueViceSlot,
  readGearState,
  type GearState,
  type LeftPiece,
  type LeftStat,
  type RingStat,
  type SealStat,
  type TrueViceSlot,
} from '../lib/gearStats'

const LEFT_PIECES: Array<{ id: LeftPiece; label: string }> = [
  { id: 'head-goggles', label: 'Head - Goggles' },
  { id: 'fashion', label: 'Fashion' },
  { id: 'top', label: 'Top' },
  { id: 'bottom', label: 'Bottom' },
  { id: 'gloves', label: 'Gloves' },
  { id: 'shoes', label: 'Shoes' },
]

const LEFT_STATS: Array<{ id: LeftStat; label: string }> = [
  { id: 'maxDs', label: 'Max DS' },
  { id: 'maxHp', label: 'Max HP' },
  { id: 'defense', label: 'Defense' },
  { id: 'attack', label: 'Attack' },
  { id: 'moveSpeed', label: 'Movement Speed' },
]

const RING_STAT_META: Array<{ id: RingStat; label: string; cap: number }> = [
  { id: 'attack', label: 'Attack', cap: 2 },
  { id: 'basicAttribute', label: 'Basic Attribute', cap: 2 },
  { id: 'critical', label: 'Critical', cap: 2 },
  { id: 'defense', label: 'Defense', cap: 2 },
  { id: 'maxDs', label: 'Max DS', cap: 3 },
  { id: 'maxHp', label: 'Max HP', cap: 3 },
  { id: 'skill', label: 'Skill', cap: 2 },
]

export function GearPage() {
  const [gear, setGear] = useState<GearState>(() => readGearState())

  const ringCountByStat = useMemo(() => {
    const counts: Partial<Record<RingStat, number>> = {}
    for (const r of gear.ring) {
      if (!r.stat) continue
      counts[r.stat] = (counts[r.stat] ?? 0) + 1
    }
    return counts
  }, [gear.ring])

  const persist = (next: GearState) => {
    setGear(next)
    localStorage.setItem(GEAR_STORAGE_KEY, JSON.stringify(next))
  }

  const updateLeft = (piece: LeftPiece, stat: LeftStat, value: number) => {
    persist({
      ...gear,
      left: {
        ...gear.left,
        [piece]: { ...gear.left[piece], [stat]: value },
      },
    })
  }

  const updateRingStat = (idx: number, nextStat: RingStat | '') => {
    const ring = gear.ring.map((line, i) => (i === idx ? { ...line, stat: nextStat } : line))
    persist({ ...gear, ring })
  }

  const updateRingValue = (idx: number, value: number) => {
    const ring = gear.ring.map((line, i) => (i === idx ? { ...line, value } : line))
    persist({ ...gear, ring })
  }

  const updateSeal = (stat: SealStat, value: number) => {
    persist({
      ...gear,
      seals: {
        ...gear.seals,
        [stat]: value,
      },
    })
  }

  const updateTrueVice = (idx: number, patch: Partial<TrueViceSlot>) => {
    const trueVice = gear.trueVice.map((row, i) =>
      i === idx ? clampTrueViceSlot({ ...row, ...patch }) : row,
    )
    persist({ ...gear, trueVice })
  }

  return (
    <div className="gear-page">
      <h1>Gear</h1>
      <p className="muted">
        Set gear stats here. Values are saved locally in your browser for later use.
      </p>

      <section className="lab-result gear-section">
        <h3>Left side</h3>
        <p className="muted">Head/Goggles, Fashion, Top, Bottom, Gloves, Shoes.</p>
        <div className="gear-table-wrap">
          <table className="gear-table">
            <thead>
              <tr>
                <th>Piece</th>
                {LEFT_STATS.map((s) => (
                  <th key={s.id}>{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LEFT_PIECES.map((piece) => (
                <tr key={piece.id}>
                  <td>{piece.label}</td>
                  {LEFT_STATS.map((s) => (
                    <td key={s.id}>
                      <EditableNumberInput
                        className="gear-input"
                        min={0}
                        integer
                        emptyValue={0}
                        value={gear.left[piece.id][s.id]}
                        onCommit={(next) => updateLeft(piece.id, s.id, next)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="lab-result gear-section">
        <h3>Right side</h3>
        <p className="muted">Ring only (4 lines) for now.</p>
        <div className="gear-ring-editor">
          <h4>Ring (4 lines)</h4>
          <p className="muted">Choose up to 4 stat lines with cap limits per stat type.</p>
          <div className="gear-ring-lines">
            {gear.ring.map((line, idx) => (
              <div className="gear-ring-line" key={idx}>
                <label>
                  Stat {idx + 1}
                  <select
                    value={line.stat}
                    onChange={(e) => updateRingStat(idx, e.target.value as RingStat | '')}
                  >
                    <option value="">(none)</option>
                    {RING_STAT_META.map((meta) => {
                      const used = ringCountByStat[meta.id] ?? 0
                      const isCurrent = line.stat === meta.id
                      const disabled = !isCurrent && used >= meta.cap
                      return (
                        <option key={meta.id} value={meta.id} disabled={disabled}>
                          {meta.label} (max {meta.cap}x)
                        </option>
                      )
                    })}
                  </select>
                </label>
                <label>
                  Value
                  <EditableNumberInput
                    className="gear-input"
                    min={0}
                    integer
                    emptyValue={0}
                    value={line.value}
                    onCommit={(next) => updateRingValue(idx, next)}
                    disabled={!line.stat}
                  />
                </label>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lab-result gear-section">
        <h3>True Vice</h3>
        <p className="muted">
          Up to {TRUE_VICE_SLOT_COUNT} lines. <strong>Element</strong> lines: max 30% each — your{' '}
          <strong>digimon element</strong> must match the roll (enemy element is not used).{' '}
          <strong>Attribute</strong> lines: max 20% (Vaccine / Virus / Data) or 14% (Unknown) — your{' '}
          <strong>digimon attribute</strong> must match that roll (enemy attribute must match for V/V/D;
          Unknown uses Free/Unknown digimon vs neutral enemy). Used by DPS Lab when saved gear is applied
          (tier list DPS uses wiki stats only).
        </p>
        <div className="gear-true-vice-grid">
          {gear.trueVice.map((slot, idx) => (
            <div className="gear-true-vice-row" key={idx}>
              <span className="gear-true-vice-slot-label">Line {idx + 1}</span>
              <label>
                Type
                <select
                  value={slot.category}
                  onChange={(e) => {
                    const category = e.target.value as TrueViceSlot['category']
                    updateTrueVice(idx, { category, stat: '', value: 0 })
                  }}
                >
                  <option value="">(none)</option>
                  <option value="element">Element</option>
                  <option value="attribute">Attribute</option>
                </select>
              </label>
              <label>
                Stat
                <select
                  value={slot.stat}
                  disabled={!slot.category}
                  onChange={(e) => updateTrueVice(idx, { stat: e.target.value, value: slot.value })}
                >
                  <option value="">—</option>
                  {slot.category === 'element'
                    ? TRUE_VICE_ELEMENT_STATS.map((s) => (
                        <option key={s} value={s}>
                          {s} dmg
                        </option>
                      ))
                    : slot.category === 'attribute'
                      ? TRUE_VICE_ATTRIBUTE_STATS.map((s) => (
                          <option key={s} value={s}>
                            {s} dmg
                          </option>
                        ))
                      : null}
                </select>
              </label>
              <label>
                %
                <EditableNumberInput
                  className="gear-input"
                  min={0}
                  integer
                  emptyValue={0}
                  value={slot.value}
                  disabled={!slot.category || !slot.stat}
                  onCommit={(next) => updateTrueVice(idx, { value: next })}
                />
              </label>
            </div>
          ))}
        </div>
      </section>

      <section className="lab-result gear-section">
        <h3>Seals</h3>
        <p className="muted">Manual stat inputs that are added to Lab combat stat totals.</p>
        <div className="gear-seals-grid">
          {SEAL_STATS.map((stat) => {
            const isPercent = stat === 'ct' || stat === 'bl' || stat === 'ev'
            return (
              <label key={stat} className="gear-seal-cell">
                <span className="gear-seal-label">
                  {stat.toUpperCase()}
                  {isPercent ? ' (%)' : ''}
                </span>
                <EditableNumberInput
                  className="gear-input"
                  min={0}
                  integer
                  emptyValue={0}
                  value={gear.seals[stat]}
                  onCommit={(next) => updateSeal(stat, next)}
                />
              </label>
            )
          })}
        </div>
      </section>
    </div>
  )
}
