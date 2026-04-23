import {
  DPS_TIER_CATEGORY_ORDER,
  DPS_TIER_MATRIX_COLUMN_LABELS,
  type DpsTierCategoryKey,
  type TierListMode,
} from '../../lib/tierList'

type Props = {
  tierMode: TierListMode
  setTierModePersist: (m: TierListMode) => void
  dpsTierCategory: DpsTierCategoryKey
  setDpsTierCategoryPersist: (c: DpsTierCategoryKey) => void
}

export function TierListModeHeader({
  tierMode,
  setTierModePersist,
  dpsTierCategory,
  setDpsTierCategoryPersist,
}: Props) {
  return (
    <div className="tier-page-head">
      <h1>Tier lists</h1>
      <div className="tier-page-head-controls">
        <div className="tier-mode-tabs" role="tablist" aria-label="Tier list type">
          <button
            type="button"
            role="tab"
            className="tier-mode-tab"
            aria-selected={tierMode === 'dps'}
            onClick={() => setTierModePersist('dps')}
          >
            DPS (all roles)
          </button>
          <button
            type="button"
            role="tab"
            className="tier-mode-tab"
            aria-selected={tierMode === 'tank'}
            onClick={() => setTierModePersist('tank')}
          >
            Tank
          </button>
          <button
            type="button"
            role="tab"
            className="tier-mode-tab"
            aria-selected={tierMode === 'healer'}
            onClick={() => setTierModePersist('healer')}
          >
            Healer
          </button>
        </div>
        {tierMode === 'dps' ? (
          <div
            className="tier-mode-tabs tier-submode-tabs"
            role="tablist"
            aria-label="DPS ranking metric"
          >
            {DPS_TIER_CATEGORY_ORDER.map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                className="tier-mode-tab"
                aria-selected={dpsTierCategory === key}
                onClick={() => setDpsTierCategoryPersist(key)}
              >
                {DPS_TIER_MATRIX_COLUMN_LABELS[key]}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
