import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { GuidebookDetail } from '../../lib/guidebookContent'
import {
  GUIDEBOOK_PERFECT_CLONE_TABLE_ROWS,
} from '../../lib/guidebookContent'
import { useGuidebook } from './GuidebookContext'

export function GuideCard({
  id,
  label,
  children,
  className = '',
}: {
  id?: string
  label?: string
  children?: ReactNode
  className?: string
}) {
  return (
    <div id={id} className={`guidebook-card${className ? ` ${className}` : ''}`}>
      {label ? <span className="guidebook-card__label">{label}</span> : null}
      {children ? <div className="guidebook-card__body">{children}</div> : null}
    </div>
  )
}

export function GuideProse({ children }: { children: ReactNode }) {
  return <div className="guidebook-prose">{children}</div>
}

export function GuidebookNotes({
  children,
  ariaLabel,
  className = '',
}: {
  children: ReactNode
  ariaLabel?: string
  className?: string
}) {
  return (
    <aside
      className={`guidebook-notes${className ? ` ${className}` : ''}`}
      {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
    >
      {children}
    </aside>
  )
}

export type GuidebookGearStatRoll = {
  label: string
  stats: string
  hint?: string
  tone?: 'dps' | 'tank'
}

function parseGuidebookStatRollItems(stats: string): string[] {
  const trimmed = stats.trim()
  if (!trimmed) return []
  if (trimmed.includes('>')) {
    return trimmed.split('>').map((part) => part.trim()).filter(Boolean)
  }
  if (trimmed.includes(',')) {
    return trimmed.split(',').map((part) => part.trim()).filter(Boolean)
  }
  return [trimmed]
}

function GuidebookStatRollPanel({
  title,
  stats,
  tone,
  hint,
}: {
  title: string
  stats: string
  tone?: 'dps' | 'tank'
  hint?: string
}) {
  const items = parseGuidebookStatRollItems(stats)
  const toneClass = tone ? ` guidebook-stat-roll-panel--${tone}` : ''

  return (
    <section
      className={`guidebook-stat-roll-panel${toneClass}`}
      aria-label={`${title} stat targets`}
    >
      <h5 className="guidebook-stat-roll-panel__title">{title}</h5>
      <ul className="guidebook-stat-roll-panel__list">
        {items.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
      {hint ? <p className="guidebook-stat-roll-panel__hint muted">{hint}</p> : null}
    </section>
  )
}

/** DPS/Healer vs Tank stat targets in a recommendations section. */
export function GuidebookGearStatRollPanels({
  rolls,
  ariaLabel,
  sectionTitle = 'Stat Recommendations',
  hideSectionHeader = false,
  className = '',
}: {
  rolls: readonly GuidebookGearStatRoll[]
  ariaLabel: string
  sectionTitle?: string
  hideSectionHeader?: boolean
  className?: string
}) {
  const useLegacyTwoPanel =
    rolls.length === 2 &&
    rolls[0]?.label === 'Recommended all-around' &&
    rolls[1]?.label === 'Tank specific' &&
    !rolls[0]?.hint &&
    !rolls[1]?.hint

  return (
    <section
      className={`guidebook-stat-recommendations${className ? ` ${className}` : ''}`}
      aria-label={ariaLabel}
    >
      {!hideSectionHeader ? (
        <header className="guidebook-stat-recommendations__header">
          <h4 className="guidebook-stat-recommendations__title">{sectionTitle}</h4>
        </header>
      ) : null}
      <div
        className={`guidebook-stat-roll-panels${rolls.length > 2 ? ' guidebook-stat-roll-panels--multi' : ''}`}
      >
        {useLegacyTwoPanel ? (
          <>
            <GuidebookStatRollPanel title="DPS/Healer" stats={rolls[0]!.stats} tone="dps" />
            <GuidebookStatRollPanel title="Tank" stats={rolls[1]!.stats} tone="tank" />
          </>
        ) : (
          rolls.map((roll) => (
            <GuidebookStatRollPanel
              key={roll.label}
              title={roll.label}
              stats={roll.stats}
              tone={roll.tone}
              hint={roll.hint}
            />
          ))
        )}
      </div>
    </section>
  )
}

/** Perfect clone stat bonuses by level. */
export function GuidebookPerfectCloneTable() {
  return (
    <section className="guidebook-stat-recommendations guidebook-clone-table-section" aria-label="Perfect Clone Table">
      <header className="guidebook-stat-recommendations__header">
        <h4 className="guidebook-stat-recommendations__title">Perfect Clone Table</h4>
      </header>
      <div className="guidebook-clone-table-scroll">
        <table className="guidebook-clone-table">
          <thead>
            <tr>
              <th scope="col">Clone Lv</th>
              <th scope="col">Attack</th>
              <th scope="col">Critical</th>
              <th scope="col">Block</th>
              <th scope="col">Evasion</th>
              <th scope="col">Health</th>
            </tr>
          </thead>
          <tbody>
            {GUIDEBOOK_PERFECT_CLONE_TABLE_ROWS.map((row) => (
              <tr
                key={row.level}
                className={`guidebook-clone-table__row guidebook-clone-table__row--tier-${row.tier}`}
              >
                <th scope="row">{row.level}</th>
                <td>{row.attack}</td>
                <td>{row.critical}</td>
                <td>{row.block}</td>
                <td>{row.evasion}</td>
                <td>{row.health}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function GuideTiles({ items }: { items: { title: string; hint?: string }[] }) {
  return (
    <ul className="guidebook-tiles">
      {items.map((item) => (
        <li key={item.title} className="guidebook-tile">
          <span className="guidebook-tile__title">{item.title}</span>
          {item.hint ? <span className="guidebook-tile__hint">{item.hint}</span> : null}
        </li>
      ))}
    </ul>
  )
}

export function GuideSteps({ steps }: { steps: { label: string; to?: string }[] }) {
  return (
    <ol className="guidebook-steps-grid">
      {steps.map((step, i) => (
        <li key={step.label} className="guidebook-step">
          <span className="guidebook-step__n">{i + 1}</span>
          {step.to ? (
            <Link to={step.to} className="guidebook-step__label">
              {step.label}
            </Link>
          ) : (
            <span className="guidebook-step__label">{step.label}</span>
          )}
        </li>
      ))}
    </ol>
  )
}

export function GuideTools({
  tools,
}: {
  tools: { to: string; label: string; icon: string }[]
}) {
  return (
    <div className="guidebook-tools">
      {tools.map((t) => (
        <Link key={t.to} to={t.to} className="guidebook-tool">
          <span className="guidebook-tool__icon" aria-hidden>
            {t.icon}
          </span>
          <span className="guidebook-tool__label">{t.label}</span>
        </Link>
      ))}
    </div>
  )
}

export function GuideFaqList({
  items,
}: {
  items: { id: string; question: string; detail: GuidebookDetail }[]
}) {
  const { openDetail } = useGuidebook()

  return (
    <ul className="guidebook-faq-list">
      {items.map((item) => (
        <li key={item.id}>
          <button type="button" className="guidebook-faq-row" onClick={() => openDetail(item.detail)}>
            {item.question}
          </button>
        </li>
      ))}
    </ul>
  )
}
