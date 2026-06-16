import { Navigate } from 'react-router-dom'

/** Legacy route — public leaderboard lives at `/meter`. */
export function MeterParsesPage() {
  return <Navigate to="/meter" replace />
}
