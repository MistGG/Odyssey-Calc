import { useState } from 'react'
import { Navigate, useOutletContext, useParams } from 'react-router-dom'
import { purchaseMeterTheme } from '../api/meterRewardsService'
import { useAuth } from '../auth/useAuth'
import { buildThemePreviewRows, MeterThemePreview } from '../components/MeterThemePreview'
import type { useMeterRewards } from '../hooks/useMeterRewards'
import {
  isMagiaMeterShopTheme,
  meterThemeRewardsCardTitle,
  type MeterPartyBarThemeId,
} from '../lib/meterPartyBarThemes'
import {
  DEFAULT_METER_SHOP_PATH,
  meterShopCategoryById,
  meterShopSubcategoryByPath,
  type MeterShopCategoryId,
} from '../lib/meterShopCategories'
import {
  meterThemeShopPriceForTheme,
  meterThemeShopTierLabelForTheme,
  previewDigimonForTheme,
  shopMeterPartyBarThemesForSubcategory,
} from '../lib/meterThemeShop'

type ShopOutletContext = ReturnType<typeof useMeterRewards>

export function MeterThemeShopBarThemesPage() {
  const { categoryId, subcategoryId } = useParams()
  const { supabase } = useAuth()
  const rewards = useOutletContext<ShopOutletContext>()
  const [busyThemeId, setBusyThemeId] = useState<string | null>(null)
  const [confirmThemeId, setConfirmThemeId] = useState<MeterPartyBarThemeId | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const category = meterShopCategoryById(categoryId ?? '')
  const subcategory =
    categoryId && subcategoryId
      ? meterShopSubcategoryByPath(categoryId, subcategoryId)
      : undefined

  if (!category?.available || !subcategory?.available) {
    return <Navigate to={DEFAULT_METER_SHOP_PATH} replace />
  }

  const themes = shopMeterPartyBarThemesForSubcategory(
    category.id as MeterShopCategoryId,
    subcategory.id,
  )

  async function onConfirmPurchase(themeId: MeterPartyBarThemeId) {
    if (!supabase) return
    setBusyThemeId(themeId)
    setActionError(null)
    const res = await purchaseMeterTheme(supabase, themeId)
    setBusyThemeId(null)
    if (!res.ok) {
      setActionError(res.error ?? 'Purchase failed.')
      return
    }
    setConfirmThemeId(null)
    rewards.setBalance(res.balance)
    rewards.setOwnedThemeIds((prev) => (prev.includes(themeId) ? prev : [...prev, themeId]))
    void rewards.refresh()
  }

  return (
    <section className="meter-shop-catalog" aria-labelledby="meter-shop-bar-themes-heading">
      <p className="meter-shop-catalog-parent">{category.label}</p>
      <h2 id="meter-shop-bar-themes-heading" className="meter-shop-category-heading">
        {subcategory.label}
      </h2>

      {(rewards.error || actionError) && (
        <p className="meter-parses-error meter-parses-error--center" role="alert">
          {actionError ?? rewards.error}
        </p>
      )}

      {themes.length === 0 ? (
        <p className="meter-parses-muted">No themes in this category yet.</p>
      ) : (
        <ul className="meter-shop-grid">
          {themes.map((theme) => {
            const price = meterThemeShopPriceForTheme(theme)
            const owned = rewards.ownedThemeIds.includes(theme.id)
            const canAfford = rewards.balance >= price
            const confirming = confirmThemeId === theme.id
            const isMagia = isMagiaMeterShopTheme(theme)
            return (
              <li
                key={theme.id}
                className={`meter-shop-card${theme.variant === 'rare' ? ' meter-shop-card--rare' : ''}${theme.variant === 'legendary' ? ' meter-shop-card--legendary' : ''}${isMagia ? ' meter-shop-card--magia' : ''}`}
              >
                <div className="meter-shop-card-head">
                  <span
                    className={`meter-shop-tier${theme.variant === 'rare' ? ' meter-shop-tier--rare' : ''}${theme.variant === 'legendary' ? ' meter-shop-tier--legendary' : ''}${isMagia ? ' meter-shop-tier--magia' : ''}`}
                  >
                    {meterThemeShopTierLabelForTheme(theme)}
                  </span>
                  <h3 className="meter-shop-card-title">{meterThemeRewardsCardTitle(theme)}</h3>
                </div>
                <MeterThemePreview
                  theme={theme}
                  rows={buildThemePreviewRows(
                    theme,
                    rewards.confirmedTamerName,
                    previewDigimonForTheme(theme.id),
                  )}
                  className="meter-shop-card-preview"
                />
                <div className="meter-shop-card-actions">
                  {owned ? (
                    <span className="meter-shop-owned">Owned. Equip in My rewards.</span>
                  ) : confirming ? (
                    <div className="meter-shop-confirm">
                      <p className="meter-shop-confirm-text">
                        Spend {price} points for {theme.label}?
                      </p>
                      <div className="meter-shop-confirm-row">
                        <button
                          type="button"
                          className="meter-shop-btn meter-shop-btn--primary"
                          disabled={busyThemeId === theme.id}
                          onClick={() => void onConfirmPurchase(theme.id)}
                        >
                          {busyThemeId === theme.id ? 'Buying…' : 'Confirm purchase'}
                        </button>
                        <button
                          type="button"
                          className="meter-shop-btn meter-shop-btn--ghost"
                          onClick={() => setConfirmThemeId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="meter-shop-btn meter-shop-btn--primary"
                      disabled={!canAfford || rewards.loading}
                      onClick={() => setConfirmThemeId(theme.id)}
                    >
                      Buy for {price} pts
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
