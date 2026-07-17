import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

function subNavClass({ isActive }: { isActive: boolean }) {
  return `meter-sub-nav-link${isActive ? ' meter-sub-nav-link--active' : ''}`
}

export function MeterSubNav() {
  const { user } = useAuth()

  return (
    <nav className="meter-sub-nav" aria-label="Meter sections">
      <NavLink to="/meter" end className={subNavClass}>
        Leaderboard
      </NavLink>
      <NavLink to="/meter/hall-of-fame" className={subNavClass}>
        Hall of Fame
      </NavLink>
      <NavLink to="/meter/search" className={subNavClass}>
        Search
      </NavLink>
      {user ? (
        <NavLink to="/meter/my-parses" className={subNavClass}>
          My parses
        </NavLink>
      ) : (
        <NavLink to="/auth?returnTo=%2Fmeter%2Fmy-parses" className={subNavClass}>
          Sign in
        </NavLink>
      )}
    </nav>
  )
}
