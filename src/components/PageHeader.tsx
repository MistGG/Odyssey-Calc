import type { ReactNode } from 'react'

type PageHeaderProps = {
  title: string
  lead?: ReactNode
  actions?: ReactNode
  kicker?: string
  className?: string
}

export function PageHeader({ title, lead, actions, kicker, className = '' }: PageHeaderProps) {
  return (
    <header className={`page-header${className ? ` ${className}` : ''}`}>
      {kicker ? <p className="page-header__kicker">{kicker}</p> : null}
      <div className="page-header__row">
        <div className="page-header__copy">
          <h1 className="page-header__title">{title}</h1>
          {lead ? <p className="page-header__lead">{lead}</p> : null}
        </div>
        {actions ? <div className="page-header__actions">{actions}</div> : null}
      </div>
    </header>
  )
}
