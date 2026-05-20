import { Navigate } from 'react-router-dom'

/** Legacy route — public stats live at `/meter`. */
export function MeterParsesPage() {
  return <Navigate to="/meter" replace />
}
