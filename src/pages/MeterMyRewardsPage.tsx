import { useState } from 'react'
import { useMeterRewardsCatalog } from '../hooks/useMeterRewardsCatalog'
import { Link, Navigate } from 'react-router-dom'
import { equipMeterTheme, unequipMeterTheme } from '../api/meterRewardsService'
import { useAuth } from '../auth/useAuth'
import { MeterRewardsShopHubNav } from '../components/MeterRewardsShopHubNav'
import { MeterSubNav } from '../components/MeterSubNav'
import { DEFAULT_METER_SHOP_PATH } from '../lib/meterShopCategories'
import { buildThemePreviewRows, MeterThemePreview } from '../components/MeterThemePreview'
import { useMeterRewards } from '../hooks/useMeterRewards'
import {
  getMeterPartyBarTheme,
  meterThemeRewardsCardTitle,
  MIST_DEV_REWARD_THEME_ID,
  type MeterPartyBarThemeId,
} from '../lib/meterPartyBarThemes'
import {
  meterThemeShopTierLabelForTheme,
  METER_THEME_UNIQUE_TIER_LABEL,
  previewDigimonForTheme,
} from '../lib/meterThemeShop'

function MeterRewardsGridSkeleton({ count }: { count: number }) {
  return (
    <ul className="meter-shop-grid meter-rewards-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="meter-shop-card meter-rewards-skeleton-card">
          <div className="meter-rewards-skeleton-block meter-rewards-skeleton-block--tier" />
          <div className="meter-rewards-skeleton-block meter-rewards-skeleton-block--title" />
          <div className="meter-rewards-skeleton-block meter-rewards-skeleton-block--preview" />
          <div className="meter-rewards-skeleton-block meter-rewards-skeleton-block--btn" />
        </li>
      ))}
    </ul>
  )
}

export function MeterMyRewardsPage() {
  const { supabase, user, authReady, profileDisplayName } = useAuth()
  const rewards = useMeterRewards(supabase, profileDisplayName, Boolean(user))
  const catalog = useMeterRewardsCatalog(
    supabase,
    profileDisplayName,
    rewards.confirmedTamerName,
    Boolean(user),
  )
  const [busyThemeId, setBusyThemeId] = useState<string | null>(null)
  const [confirmEquipId, setConfirmEquipId] = useState<MeterPartyBarThemeId | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [unequipBusy, setUnequipBusy] = useState(false)

  if (!authReady) {
    return (
      <div className="meter-parses-page meter-parses-page--logged">
        <p className="meter-parses-muted meter-parses-muted--center">Loading…</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth?returnTo=%2Fmeter%2Frewards" replace />
  }

  const rewardThemes = catalog.rewardThemes

  async function onConfirmEquip(themeId: MeterPartyBarThemeId) {
    if (!supabase) return
    setBusyThemeId(themeId)
    setActionError(null)
    const res = await equipMeterTheme(supabase, themeId, {
      mistDevIliadBypass: rewards.mistShopDev && themeId === MIST_DEV_REWARD_THEME_ID,
    })
    setBusyThemeId(null)
    if (!res.ok) {
      setActionError(res.error ?? 'Could not equip theme.')
      return
    }
    setConfirmEquipId(null)
    rewards.setEquippedThemeId(themeId)
    void catalog.refresh()
  }

  async function onUseDefaultBar() {
    if (!supabase) return
    setUnequipBusy(true)
    setActionError(null)
    const res = await unequipMeterTheme(supabase)
    setUnequipBusy(false)
    if (!res.ok) {
      setActionError(res.error ?? 'Could not reset to default bar.')
      return
    }
    rewards.setEquippedThemeId(null)
    void rewards.refresh()
    void catalog.refresh()
  }

  return (
    <div className="meter-parses-page meter-parses-page--logged">
      <MeterSubNav />
      <header className="meter-parses-logged-head meter-parses-logged-head--bar">
        <h1 className="meter-parses-title">My rewards</h1>
        <p className="meter-parses-muted">
          <span className="meter-shop-beta-notice">This is currently under beta.</span>
        </p>
        <MeterRewardsShopHubNav active="rewards" />
      </header>

      <section className="meter-shop-wallet" aria-label="Your points">
        <div className="meter-shop-wallet-stat">
          <span className="meter-shop-wallet-label">Balance</span>
          <span className="meter-shop-wallet-value">{rewards.loading ? '…' : rewards.balance}</span>
          <span className="meter-shop-wallet-unit">pts</span>
        </div>
        <div className="meter-shop-wallet-stat meter-shop-wallet-stat--equipped">
          <span className="meter-shop-wallet-label">Equipped on Companion</span>
          <span className="meter-shop-wallet-value meter-shop-wallet-value--equipped">
            {rewards.equippedThemeId
              ? (() => {
                  const t = getMeterPartyBarTheme(rewards.equippedThemeId)
                  return t ? meterThemeRewardsCardTitle(t) : rewards.equippedThemeId
                })()
              : 'Default bar'}
          </span>
          {rewards.equippedThemeId ? (
            <button
              type="button"
              className="meter-shop-btn meter-shop-btn--ghost meter-shop-wallet-deactivate"
              disabled={unequipBusy || rewards.loading}
              onClick={() => void onUseDefaultBar()}
            >
              {unequipBusy ? 'Resetting…' : 'Use default bar'}
            </button>
          ) : null}
        </div>
      </section>

      {(actionError || catalog.catalogError) && (
        <p className="meter-parses-error meter-parses-error--center" role="alert">
          {actionError ?? catalog.catalogError}
        </p>
      )}

      {catalog.catalogLoading ? (
        <>
          <p className="visually-hidden" role="status">
            Loading your rewards…
          </p>
          <MeterRewardsGridSkeleton count={catalog.skeletonCount} />
        </>
      ) : rewardThemes.length === 0 ? (
        <div className="meter-rewards-empty">
          <p className="meter-parses-muted meter-parses-muted--center">
            You have not purchased any themes yet.
          </p>
          <Link
            to={DEFAULT_METER_SHOP_PATH}
            className="meter-rewards-shop-hub-btn meter-rewards-shop-hub-btn--cta"
          >
            Browse theme shop
          </Link>
        </div>
      ) : (
        <ul className="meter-shop-grid meter-rewards-grid">
          {rewardThemes.map((theme) => {
            const equipped = rewards.equippedThemeId === theme.id
            const confirming = confirmEquipId === theme.id
            const isUniqueTheme = theme.id === MIST_DEV_REWARD_THEME_ID
            const isRareTheme = theme.variant === 'rare'
            return (
              <li
                key={theme.id}
                className={`meter-shop-card${isUniqueTheme ? ' meter-shop-card--unique' : ''}${isRareTheme ? ' meter-shop-card--rare' : ''}`}
              >
                <div className="meter-shop-card-head">
                  <span
                    className={`meter-shop-tier${isUniqueTheme ? ' meter-shop-tier--unique' : ''}${isRareTheme ? ' meter-shop-tier--rare' : ''}`}
                  >
                    {isUniqueTheme
                      ? METER_THEME_UNIQUE_TIER_LABEL
                      : meterThemeShopTierLabelForTheme(theme)}
                  </span>
                  <h3 className="meter-shop-card-title">
                    {meterThemeRewardsCardTitle(theme)}
                    {equipped ? (
                      <span className="meter-shop-equipped-badge">Equipped</span>
                    ) : null}
                  </h3>
                </div>
                <MeterThemePreview
                  theme={theme}
                  rows={buildThemePreviewRows(
                    theme,
                    rewards.confirmedTamerName,
                    previewDigimonForTheme(theme.id, 1),
                  )}
                  className="meter-shop-card-preview"
                />
                <div className="meter-shop-card-actions">
                  {equipped ? (
                    <div className="meter-shop-equipped-actions">
                      <span className="meter-shop-owned">Active on Companion</span>
                      <button
                        type="button"
                        className="meter-shop-btn meter-shop-btn--ghost"
                        disabled={unequipBusy}
                        onClick={() => void onUseDefaultBar()}
                      >
                        Use default bar
                      </button>
                    </div>
                  ) : confirming ? (
                    <div className="meter-shop-confirm">
                      <p className="meter-shop-confirm-text">
                        Equip {theme.label} on your Odyssey Companion meter?
                      </p>
                      <div className="meter-shop-confirm-row">
                        <button
                          type="button"
                          className="meter-shop-btn meter-shop-btn--primary"
                          disabled={busyThemeId === theme.id}
                          onClick={() => void onConfirmEquip(theme.id)}
                        >
                          {busyThemeId === theme.id ? 'Equipping…' : 'Confirm activate'}
                        </button>
                        <button
                          type="button"
                          className="meter-shop-btn meter-shop-btn--ghost"
                          onClick={() => setConfirmEquipId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="meter-shop-btn meter-shop-btn--primary"
                      disabled={rewards.loading}
                      onClick={() => setConfirmEquipId(theme.id)}
                    >
                      Activate on Companion
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
