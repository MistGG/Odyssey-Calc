import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[app] render error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    const message = this.state.error.message || 'Unknown error'
    return (
      <div className="app-fatal" role="alert">
        <h1 className="app-fatal__title">Something went wrong loading Odyssey Calc</h1>
        <p className="app-fatal__hint muted">
          Try a hard refresh (Ctrl+Shift+R or Cmd+Shift+R). If this keeps happening, clear site data
          for odyssey-calc.com or open the site in a private window.
        </p>
        <p className="app-fatal__detail">
          <code>{message}</code>
        </p>
        <button
          type="button"
          className="app-fatal__retry"
          onClick={() => window.location.reload()}
        >
          Reload page
        </button>
      </div>
    )
  }
}
