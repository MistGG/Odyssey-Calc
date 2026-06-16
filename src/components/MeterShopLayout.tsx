import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useMeterRewards } from '../hooks/useMeterRewards'
import { METER_IDENTITY_PARSE_NOTICE } from '../lib/meterThemeShop'
import { METER_SHOP_CATEGORIES } from '../lib/meterShopCategories'
import { MeterRewardsShopHubNav } from './MeterRewardsShopHubNav'
import { MeterSubNav } from './MeterSubNav'
import { MeterThemeShopEarnPanels } from './MeterThemeShopEarnPanels'

export function MeterShopLayout() {
  const { supabase, profileDisplayName, user } = useAuth()
  const rewards = useMeterRewards(supabase, profileDisplayName, Boolean(user))

  return (
    <div className="meter-parses-page meter-parses-page--logged meter-shop-layout">
      <MeterSubNav />
      <header className="meter-parses-logged-head meter-parses-logged-head--bar">
        <h1 className="meter-parses-title">Meter theme shop</h1>
        <p className="meter-parses-muted">
          <span className="meter-shop-beta-notice">This is currently under beta.</span>
        </p>
        <MeterRewardsShopHubNav active="shop" />
      </header>

      <div className="meter-shop-top">
        <section className="meter-shop-wallet" aria-label="Your points">
          <div className="meter-shop-wallet-stat">
            <span className="meter-shop-wallet-label">Balance</span>
            <span className="meter-shop-wallet-value">{rewards.loading ? '…' : rewards.balance}</span>
            <span className="meter-shop-wallet-unit">pts</span>
          </div>
        </section>

        {rewards.showIdentityNotice ? (
          <p className="meter-shop-notice" role="status">
            {METER_IDENTITY_PARSE_NOTICE}
          </p>
        ) : null}
        <section className="meter-shop-earn" aria-labelledby="meter-shop-earn-heading">
          <h2 id="meter-shop-earn-heading" className="meter-shop-section-title">
            How to earn points
          </h2>
          <MeterThemeShopEarnPanels
            loading={rewards.syncing}
            dungeonProgress={rewards.dungeonEarnProgress}
            grantKeys={rewards.grantKeys}
            dailyCompletedToday={rewards.dailyCompletedToday}
          />
        </section>
      </div>

      <div className="meter-shop-body">
        <nav className="meter-shop-side-nav" aria-label="Categories">
          <h2 className="meter-shop-side-nav-title">Categories</h2>
          <ul className="meter-shop-side-nav-list">
            {METER_SHOP_CATEGORIES.map((category) => (
              <li key={category.id} className="meter-shop-side-nav-group">
                {category.available ? (
                  <NavLink
                    to={category.defaultPath}
                    className={({ isActive }) =>
                      `meter-shop-side-nav-link meter-shop-side-nav-link--parent${isActive ? ' meter-shop-side-nav-link--active' : ''}`
                    }
                  >
                    {category.label}
                  </NavLink>
                ) : (
                  <span className="meter-shop-side-nav-link meter-shop-side-nav-link--parent meter-shop-side-nav-link--disabled">
                    {category.label}
                  </span>
                )}
                <ul className="meter-shop-subnav-list">
                  {category.subcategories.map((sub) => (
                    <li key={sub.id}>
                      {sub.available && category.available ? (
                        <NavLink
                          to={`/meter/shop/${category.id}/${sub.id}`}
                          className={({ isActive }) =>
                            `meter-shop-subnav-link${isActive ? ' meter-shop-subnav-link--active' : ''}`
                          }
                          end
                        >
                          {sub.label}
                        </NavLink>
                      ) : (
                        <span className="meter-shop-subnav-link meter-shop-subnav-link--disabled">
                          {sub.label}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </nav>

        <div className="meter-shop-layout-main">
          <Outlet context={rewards} />
        </div>
      </div>
    </div>
  )
}
