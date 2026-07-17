import { useMemo, useState } from 'react'
import { EditableNumberInput } from '../components/EditableNumberInput'
import { PageHeader } from '../components/PageHeader'
import {
  ACCESSORY_LINE_COUNT,
  ACCESSORY_STAT_OPTIONS,
  GEAR_STORAGE_KEY,
  SEAL_STAT_META,
  TRUE_VICE_ATTRIBUTE_STATS,
  TRUE_VICE_ELEMENT_STATS,
  TRUE_VICE_SLOT_COUNT,
  aggregateAccessoryCombatBonuses,
  clampTrueViceSlot,
  gearAttackFromGearState,
  getGearEquipmentCombatBonuses,
  readGearState,
  type AccessoryLine,
  type AccessoryStat,
  type CostumeStat,
  type FullLeftPiece,
  type GearState,
  type KeyringStat,
  type LeftPiece,
  type LeftStat,
  type SealStat,
  type TrueViceSlot,
} from '../lib/gearStats'

const LEFT_PIECES: Array<{ id: LeftPiece; label: string; short: string }> = [
  { id: 'head', label: 'Head', short: 'HED' },
  { id: 'goggles', label: 'Goggles', short: 'GOG' },
  { id: 'fashion', label: 'Fashion', short: 'FAS' },
  { id: 'top', label: 'Top', short: 'TOP' },
  { id: 'bottom', label: 'Bottom', short: 'BOT' },
  { id: 'gloves', label: 'Gloves', short: 'GLV' },
  { id: 'shoes', label: 'Shoes', short: 'SHO' },
  { id: 'keyring', label: 'Keyring', short: 'KEY' },
  { id: 'costume', label: 'Costume', short: 'CST' },
]

const FULL_LEFT_STATS: Array<{ id: LeftStat; label: string }> = [
  { id: 'attack', label: 'Attack' },
  { id: 'maxHp', label: 'Max HP' },
  { id: 'maxDs', label: 'Max DS' },
  { id: 'defense', label: 'Defense' },
  { id: 'moveSpeed', label: 'Move Speed' },
]

const COSTUME_STATS: Array<{ id: CostumeStat; label: string }> = [
  { id: 'attack', label: 'Attack' },
  { id: 'maxHp', label: 'Max HP' },
]

const KEYRING_STATS: Array<{ id: KeyringStat; label: string }> = [
  { id: 'attack', label: 'Attack' },
  { id: 'maxHp', label: 'Max HP' },
  { id: 'defense', label: 'Defense' },
]

const GOGGLES_ALL_STAT_HINT =
  'All Stat applies Attack, Max HP, Max DS, Defense, and Evasion at 100% value to your Digimon.'

type GearTab = 'equipment' | 'ring' | 'necklace' | 'earring' | 'true-vice' | 'seals'

const GEAR_TABS: Array<{ id: GearTab; label: string }> = [
  { id: 'equipment', label: 'Equipment' },
  { id: 'ring', label: 'Ring' },
  { id: 'necklace', label: 'Necklace' },
  { id: 'earring', label: 'Earring' },
  { id: 'true-vice', label: 'True Vice' },
  { id: 'seals', label: 'Seals' },
]

type AccessoryKey = 'ring' | 'necklace' | 'earring'

const ACCESSORY_TABS: Record<AccessoryKey, { title: string }> = {
  ring: { title: 'Ring' },
  necklace: { title: 'Necklace' },
  earring: { title: 'Earring' },
}

function sealRollSummary(gear: GearState): string | null {
  const parts = SEAL_STAT_META.flatMap((meta) => {
    const roll = gear.seals[meta.id]
    if (roll <= 0) return []
    return [`${meta.label} +${roll}${meta.isPercent ? '%' : ''}`]
  })
  return parts.length > 0 ? parts.join(' · ') : null
}

function pieceHasStats(piece: LeftPiece, gear: GearState): boolean {
  if (piece === 'goggles') return gear.left.goggles.allStat > 0
  if (piece === 'costume') return COSTUME_STATS.some((s) => gear.left.costume[s.id] > 0)
  if (piece === 'keyring') return KEYRING_STATS.some((s) => gear.left.keyring[s.id] > 0)
  return FULL_LEFT_STATS.some((s) => gear.left[piece][s.id] > 0)
}

function formatInt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function GearSummaryPanel({ gear }: { gear: GearState }) {
  const attack = useMemo(() => gearAttackFromGearState(gear), [gear])
  const accessoryBonuses = useMemo(() => aggregateAccessoryCombatBonuses(gear), [gear])
  const equipmentBonuses = useMemo(() => getGearEquipmentCombatBonuses(gear), [gear])
  const sealSummary = useMemo(() => sealRollSummary(gear), [gear])
  const filledTrueVice = gear.trueVice.filter((s) => s.category && s.stat && s.value > 0).length
  const filledRingLines = gear.ring.filter((r) => r.stat && r.value > 0).length
  const filledNecklaceLines = gear.necklace.filter((r) => r.stat && r.value > 0).length
  const filledEarringLines = gear.earring.filter((r) => r.stat && r.value > 0).length
  const filledPieces = LEFT_PIECES.filter((p) => pieceHasStats(p.id, gear)).length

  return (
    <aside className="gear-panel gear-summary" aria-label="Gear summary">
      <div className="gear-summary__banner">
        <span className="gear-summary__crest" aria-hidden>
          ⚔
        </span>
        <div>
          <p className="gear-summary__eyebrow">Loadout</p>
          <h2 className="gear-summary__title">Gear Stats</h2>
        </div>
      </div>

      <dl className="gear-summary__stats">
        <div className="gear-summary__row gear-summary__row--highlight">
          <dt>Lab attack bonus</dt>
          <dd>{formatInt(attack.totalAttack)}</dd>
        </div>
        {accessoryBonuses.attackPct > 0 ? (
          <div className="gear-summary__row">
            <dt>Accessory attack %</dt>
            <dd>+{formatInt(accessoryBonuses.attackPct)}%</dd>
          </div>
        ) : null}
        {accessoryBonuses.skillPct > 0 ? (
          <div className="gear-summary__row">
            <dt>Accessory skill %</dt>
            <dd>+{formatInt(accessoryBonuses.skillPct)}%</dd>
          </div>
        ) : null}
        {accessoryBonuses.skillFlat > 0 ? (
          <div className="gear-summary__row">
            <dt>Accessory skill (flat)</dt>
            <dd>+{formatInt(accessoryBonuses.skillFlat)}</dd>
          </div>
        ) : null}
        {accessoryBonuses.critDamagePct > 0 ? (
          <div className="gear-summary__row">
            <dt>Accessory crit damage %</dt>
            <dd>+{formatInt(accessoryBonuses.critDamagePct)}%</dd>
          </div>
        ) : null}
        {accessoryBonuses.blockPct > 0 ? (
          <div className="gear-summary__row">
            <dt>Accessory block %</dt>
            <dd>+{formatInt(accessoryBonuses.blockPct)}%</dd>
          </div>
        ) : null}
        {accessoryBonuses.evasionPct > 0 ? (
          <div className="gear-summary__row">
            <dt>Accessory avoid %</dt>
            <dd>+{formatInt(accessoryBonuses.evasionPct)}%</dd>
          </div>
        ) : null}
        {accessoryBonuses.hitRatePct > 0 ? (
          <div className="gear-summary__row">
            <dt>Accessory hit rate %</dt>
            <dd>+{formatInt(accessoryBonuses.hitRatePct)}%</dd>
          </div>
        ) : null}
        <div className="gear-summary__row">
          <dt>Equipment attack (×0.6)</dt>
          <dd>{formatInt(attack.leftWeightedAttack)}</dd>
        </div>
        <div className="gear-summary__row">
          <dt>Goggles all stat (×1.0)</dt>
          <dd>{formatInt(attack.gogglesAllStatAttack)}</dd>
        </div>
        {equipmentBonuses.hp > 0 || equipmentBonuses.defense > 0 || equipmentBonuses.evasion > 0 ? (
          <div className="gear-summary__row">
            <dt>Equipment stat bonus</dt>
            <dd>
              {[
                equipmentBonuses.hp > 0 ? `+${formatInt(equipmentBonuses.hp)} HP` : null,
                equipmentBonuses.ds > 0 ? `+${formatInt(equipmentBonuses.ds)} DS` : null,
                equipmentBonuses.defense > 0 ? `+${formatInt(equipmentBonuses.defense)} DEF` : null,
                equipmentBonuses.evasion > 0 ? `+${formatInt(equipmentBonuses.evasion)} EV` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </dd>
          </div>
        ) : null}
        {sealSummary ? (
          <div className="gear-summary__row">
            <dt>Seals</dt>
            <dd>{sealSummary}</dd>
          </div>
        ) : null}
        <div className="gear-summary__row">
          <dt>Configured pieces</dt>
          <dd>
            {filledPieces}/{LEFT_PIECES.length}
          </dd>
        </div>
        <div className="gear-summary__row">
          <dt>Ring lines</dt>
          <dd>
            {filledRingLines}/{ACCESSORY_LINE_COUNT}
          </dd>
        </div>
        <div className="gear-summary__row">
          <dt>Necklace lines</dt>
          <dd>
            {filledNecklaceLines}/{ACCESSORY_LINE_COUNT}
          </dd>
        </div>
        <div className="gear-summary__row">
          <dt>Earring lines</dt>
          <dd>
            {filledEarringLines}/{ACCESSORY_LINE_COUNT}
          </dd>
        </div>
        <div className="gear-summary__row">
          <dt>True Vice</dt>
          <dd>{gear.trueViceAllMaxed ? 'All maxed' : `${filledTrueVice}/${TRUE_VICE_SLOT_COUNT} lines`}</dd>
        </div>
      </dl>
    </aside>
  )
}

function GearAccessoryPanel({
  title,
  lines,
  onStatChange,
  onValueChange,
}: {
  title: string
  lines: AccessoryLine[]
  onStatChange: (idx: number, stat: AccessoryStat | '') => void
  onValueChange: (idx: number, value: number) => void
}) {
  return (
    <section className="gear-panel gear-ring-panel" aria-label={`${title} editor`}>
      <header className="gear-panel__head">
        <h2 className="gear-panel__title">{title}</h2>
      </header>
      <div className="gear-ring-slots">
        {lines.map((line, idx) => (
          <div className="gear-ring-slot" key={idx}>
            <span className="gear-ring-slot__badge">Line {idx + 1}</span>
            <label className="gear-stat-field">
              <span className="gear-stat-field__label">Stat</span>
              <div className="gear-select-wrap">
                <select
                  className="gear-select"
                  value={line.stat}
                  onChange={(e) => onStatChange(idx, e.target.value as AccessoryStat | '')}
                >
                  <option value="">Empty</option>
                  {ACCESSORY_STAT_OPTIONS.map((meta) => (
                    <option key={meta.id} value={meta.id}>
                      {meta.label}
                    </option>
                  ))}
                </select>
              </div>
            </label>
            <label className="gear-stat-field">
              <span className="gear-stat-field__label">Value</span>
              <EditableNumberInput
                className="gear-input gear-stat-field__input"
                min={0}
                integer
                emptyValue={0}
                value={line.value}
                onCommit={(next) => onValueChange(idx, next)}
                disabled={!line.stat}
              />
            </label>
          </div>
        ))}
      </div>
    </section>
  )
}

export function GearPage() {
  const [gear, setGear] = useState<GearState>(() => readGearState())
  const [tab, setTab] = useState<GearTab>('equipment')
  const [selectedPiece, setSelectedPiece] = useState<LeftPiece>('head')

  const persist = (next: GearState) => {
    setGear(next)
    localStorage.setItem(GEAR_STORAGE_KEY, JSON.stringify(next))
  }

  const updateFullLeft = (piece: FullLeftPiece, stat: LeftStat, value: number) => {
    persist({
      ...gear,
      left: {
        ...gear.left,
        [piece]: { ...gear.left[piece], [stat]: value },
      },
    })
  }

  const updateCostume = (stat: CostumeStat, value: number) => {
    persist({
      ...gear,
      left: {
        ...gear.left,
        costume: { ...gear.left.costume, [stat]: value },
      },
    })
  }

  const updateKeyring = (stat: KeyringStat, value: number) => {
    persist({
      ...gear,
      left: {
        ...gear.left,
        keyring: { ...gear.left.keyring, [stat]: value },
      },
    })
  }

  const updateGogglesAllStat = (value: number) => {
    persist({
      ...gear,
      left: {
        ...gear.left,
        goggles: { allStat: value },
      },
    })
  }

  const updateAccessoryStat = (key: AccessoryKey, idx: number, nextStat: AccessoryStat | '') => {
    const lines = gear[key].map((line, i) => (i === idx ? { ...line, stat: nextStat } : line))
    persist({ ...gear, [key]: lines })
  }

  const updateAccessoryValue = (key: AccessoryKey, idx: number, value: number) => {
    const lines = gear[key].map((line, i) => (i === idx ? { ...line, value } : line))
    persist({ ...gear, [key]: lines })
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
    if (gear.trueViceAllMaxed) return
    const trueVice = gear.trueVice.map((row, i) =>
      i === idx ? clampTrueViceSlot({ ...row, ...patch }) : row,
    )
    persist({ ...gear, trueVice })
  }

  const updateTrueViceAllMaxed = (checked: boolean) => {
    persist({ ...gear, trueViceAllMaxed: checked })
  }

  const trueViceInputsDisabled = gear.trueViceAllMaxed

  const selectedPieceMeta = LEFT_PIECES.find((p) => p.id === selectedPiece)!

  return (
    <div className="gear-shell">
      <PageHeader
        kicker="Lab · Loadout"
        title="Gear"
        lead="Configure equipment, accessories, and seals. Values sync to DPS Lab automatically."
      />

      <nav className="gear-tabs" aria-label="Gear sections">
        {GEAR_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`gear-tabs__btn${tab === t.id ? ' is-active' : ''}`}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="gear-layout">
        <div className="gear-layout__main">
          {tab === 'equipment' ? (
            <div className="gear-equipment">
              <nav className="gear-panel gear-slot-nav" aria-label="Equipment slots">
                <ul className="gear-slot-nav__list">
                  {LEFT_PIECES.map((piece) => {
                    const active = selectedPiece === piece.id
                    const filled = pieceHasStats(piece.id, gear)
                    return (
                      <li key={piece.id}>
                        <button
                          type="button"
                          className={`gear-slot-btn${active ? ' is-active' : ''}${filled ? ' is-filled' : ''}`}
                          onClick={() => setSelectedPiece(piece.id)}
                          aria-current={active ? 'true' : undefined}
                        >
                          <span className="gear-slot-btn__icon">{piece.short}</span>
                          <span className="gear-slot-btn__label">{piece.label}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </nav>

              <section className="gear-panel gear-piece-editor" aria-label={selectedPieceMeta.label}>
                <header className="gear-panel__head">
                  <h2 className="gear-panel__title">{selectedPieceMeta.label}</h2>
                  {selectedPiece === 'goggles' ? (
                    <p className="gear-panel__sub muted">{GOGGLES_ALL_STAT_HINT}</p>
                  ) : selectedPiece === 'costume' ? (
                    <p className="gear-panel__sub muted">Costumes can only roll Attack or Max HP (×60% in Lab).</p>
                  ) : selectedPiece === 'keyring' ? (
                    <p className="gear-panel__sub muted">
                      Keyrings can only roll Attack, Max HP, or Defense (×60% in Lab).
                    </p>
                  ) : (
                    <p className="gear-panel__sub muted">Enter stat rolls for this piece.</p>
                  )}
                </header>
                {selectedPiece === 'goggles' ? (
                  <div className="gear-stat-grid">
                    <label className="gear-stat-field">
                      <span className="gear-stat-field__label">All Stat</span>
                      <EditableNumberInput
                        className="gear-input gear-stat-field__input"
                        min={0}
                        integer
                        emptyValue={0}
                        value={gear.left.goggles.allStat}
                        onCommit={updateGogglesAllStat}
                      />
                    </label>
                  </div>
                ) : selectedPiece === 'costume' ? (
                  <div className="gear-stat-grid">
                    {COSTUME_STATS.map((stat) => (
                      <label key={stat.id} className="gear-stat-field">
                        <span className="gear-stat-field__label">{stat.label}</span>
                        <EditableNumberInput
                          className="gear-input gear-stat-field__input"
                          min={0}
                          integer
                          emptyValue={0}
                          value={gear.left.costume[stat.id]}
                          onCommit={(next) => updateCostume(stat.id, next)}
                        />
                      </label>
                    ))}
                  </div>
                ) : selectedPiece === 'keyring' ? (
                  <div className="gear-stat-grid">
                    {KEYRING_STATS.map((stat) => (
                      <label key={stat.id} className="gear-stat-field">
                        <span className="gear-stat-field__label">{stat.label}</span>
                        <EditableNumberInput
                          className="gear-input gear-stat-field__input"
                          min={0}
                          integer
                          emptyValue={0}
                          value={gear.left.keyring[stat.id]}
                          onCommit={(next) => updateKeyring(stat.id, next)}
                        />
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="gear-stat-grid">
                    {FULL_LEFT_STATS.map((stat) => (
                      <label key={stat.id} className="gear-stat-field">
                        <span className="gear-stat-field__label">{stat.label}</span>
                        <EditableNumberInput
                          className="gear-input gear-stat-field__input"
                          min={0}
                          integer
                          emptyValue={0}
                          value={gear.left[selectedPiece][stat.id]}
                          onCommit={(next) => updateFullLeft(selectedPiece, stat.id, next)}
                        />
                      </label>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : null}

          {tab === 'ring' || tab === 'necklace' || tab === 'earring' ? (
            <GearAccessoryPanel
              title={ACCESSORY_TABS[tab].title}
              lines={gear[tab]}
              onStatChange={(idx, stat) => updateAccessoryStat(tab, idx, stat)}
              onValueChange={(idx, value) => updateAccessoryValue(tab, idx, value)}
            />
          ) : null}

          {tab === 'true-vice' ? (
            <section className="gear-panel gear-tv-panel" aria-label="True Vice editor">
              <header className="gear-panel__head">
                <h2 className="gear-panel__title">True Vice</h2>
                <p className="gear-panel__sub muted">
                  Up to {TRUE_VICE_SLOT_COUNT} lines. Element max 30% · Attribute max 20% (14% Unknown).
                  Element matches your digimon element; attribute matches digimon attribute vs enemy.
                </p>
                <label className="gear-tv-toggle">
                  <input
                    type="checkbox"
                    checked={gear.trueViceAllMaxed}
                    onChange={(e) => updateTrueViceAllMaxed(e.target.checked)}
                  />
                  <span>All maxed</span>
                </label>
                {gear.trueViceAllMaxed ? (
                  <p className="gear-panel__sub muted">
                    Treats every element at 30% and every attribute at max (20% / 14% Unknown). Manual lines are
                    ignored.
                  </p>
                ) : null}
              </header>
              <div className={`gear-tv-lines${trueViceInputsDisabled ? ' gear-tv-lines--disabled' : ''}`}>
                {gear.trueVice.map((slot, idx) => (
                  <div className="gear-tv-line" key={idx}>
                    <span className="gear-tv-line__num">{idx + 1}</span>
                    <label className="gear-stat-field">
                      <span className="gear-stat-field__label">Type</span>
                      <div className="gear-select-wrap">
                        <select
                          className="gear-select"
                          value={slot.category}
                          disabled={trueViceInputsDisabled}
                          onChange={(e) => {
                            const category = e.target.value as TrueViceSlot['category']
                            updateTrueVice(idx, { category, stat: '', value: 0 })
                          }}
                        >
                          <option value="">Empty</option>
                          <option value="element">Element</option>
                          <option value="attribute">Attribute</option>
                        </select>
                      </div>
                    </label>
                    <label className="gear-stat-field">
                      <span className="gear-stat-field__label">Roll</span>
                      <div className="gear-select-wrap">
                        <select
                          className="gear-select"
                          value={slot.stat}
                          disabled={trueViceInputsDisabled || !slot.category}
                          onChange={(e) => updateTrueVice(idx, { stat: e.target.value, value: slot.value })}
                        >
                          <option value="">—</option>
                          {slot.category === 'element'
                            ? TRUE_VICE_ELEMENT_STATS.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))
                            : slot.category === 'attribute'
                              ? TRUE_VICE_ATTRIBUTE_STATS.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))
                              : null}
                        </select>
                      </div>
                    </label>
                    <label className="gear-stat-field gear-stat-field--compact">
                      <span className="gear-stat-field__label">%</span>
                      <EditableNumberInput
                        className="gear-input gear-stat-field__input"
                        min={0}
                        integer
                        emptyValue={0}
                        value={slot.value}
                        disabled={trueViceInputsDisabled || !slot.category || !slot.stat}
                        onCommit={(next) => updateTrueVice(idx, { value: next })}
                      />
                    </label>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {tab === 'seals' ? (
            <section className="gear-panel gear-seals-panel" aria-label="Seals editor">
              <header className="gear-panel__head">
                <h2 className="gear-panel__title">Seals</h2>
              </header>
              <div className="gear-seals-board">
                {SEAL_STAT_META.map((meta) => (
                  <label key={meta.id} className="gear-seal-tile">
                    <span className="gear-seal-tile__label">
                      {meta.label}
                      {meta.isPercent ? ' %' : ''}
                    </span>
                    <EditableNumberInput
                      className="gear-input gear-seal-tile__input"
                      min={0}
                      integer
                      emptyValue={0}
                      value={gear.seals[meta.id]}
                      onCommit={(next) => updateSeal(meta.id, next)}
                    />
                  </label>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <GearSummaryPanel gear={gear} />
      </div>
    </div>
  )
}
