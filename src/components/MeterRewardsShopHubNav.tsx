import { NavLink } from 'react-router-dom'
import { DEFAULT_METER_SHOP_PATH } from '../lib/meterShopCategories'

type MeterRewardsShopHubNavProps = {
  active: 'rewards' | 'shop'
}

export function MeterRewardsShopHubNav({ active }: MeterRewardsShopHubNavProps) {
  return (
    <nav className="meter-rewards-shop-hub" aria-label="Rewards and theme shop">
      {active === 'rewards' ? (
        <span className="meter-rewards-shop-hub-btn meter-rewards-shop-hub-btn--current" aria-current="page">
          My rewards
        </span>
      ) : (
        <NavLink to="/meter/rewards" className="meter-rewards-shop-hub-btn meter-rewards-shop-hub-btn--cta">
          My rewards
        </NavLink>
      )}
      {active === 'shop' ? (
        <span className="meter-rewards-shop-hub-btn meter-rewards-shop-hub-btn--current" aria-current="page">
          Theme shop
        </span>
      ) : (
        <NavLink
          to={DEFAULT_METER_SHOP_PATH}
          className="meter-rewards-shop-hub-btn meter-rewards-shop-hub-btn--cta"
        >
          Theme shop
        </NavLink>
      )}
    </nav>
  )
}
