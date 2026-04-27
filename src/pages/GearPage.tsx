import { useMemo, useState } from 'react'
import {
  GEAR_STORAGE_KEY,
  SEAL_STATS,
  readGearState,
  type GearState,
  type LeftPiece,
  type LeftStat,
  type RingStat,
  type SealStat,
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

function toInt(raw: string): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.floor(n))
}

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

  const updateLeft = (piece: LeftPiece, stat: LeftStat, raw: string) => {
    const value = toInt(raw)
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

  const updateRingValue = (idx: number, raw: string) => {
    const value = toInt(raw)
    const ring = gear.ring.map((line, i) => (i === idx ? { ...line, value } : line))
    persist({ ...gear, ring })
  }

  const updateSeal = (stat: SealStat, raw: string) => {
    const value = toInt(raw)
    persist({
      ...gear,
      seals: {
        ...gear.seals,
        [stat]: value,
      },
    })
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
                      <input
                        className="gear-input"
                        type="number"
                        min={0}
                        value={gear.left[piece.id][s.id]}
                        onChange={(e) => updateLeft(piece.id, s.id, e.target.value)}
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
                    <option value="">— none —</option>
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
                  <input
                    className="gear-input"
                    type="number"
                    min={0}
                    value={line.value}
                    onChange={(e) => updateRingValue(idx, e.target.value)}
                    disabled={!line.stat}
                  />
                </label>
              </div>
            ))}
          </div>
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
                <input
                  className="gear-input"
                  type="number"
                  min={0}
                  value={gear.seals[stat]}
                  onChange={(e) => updateSeal(stat, e.target.value)}
                />
              </label>
            )
          })}
        </div>
      </section>
    </div>
  )
}
