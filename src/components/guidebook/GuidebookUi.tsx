import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { GuidebookDetail } from '../../lib/guidebookContent'
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
