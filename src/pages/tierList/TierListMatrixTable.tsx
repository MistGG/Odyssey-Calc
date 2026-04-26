import type { Dispatch, SetStateAction } from 'react'
import { Link } from 'react-router-dom'
import { digimonPortraitUrl } from '../../lib/digimonImage'
import { digimonStageBorderColor } from '../../lib/digimonStage'
import { contentStatusLabel } from '../../lib/contentStatus'
import type { DpsTierCategoryKey, TierGroup, TierListMode } from '../../lib/tierList'
import type { WikiDigimonListItem } from '../../types/wikiApi'
import { TierListFilterPanel } from './TierListFilterPanel'

type Props = {
  tierMode: TierListMode
  dpsTierCategory: DpsTierCategoryKey
  roles: string[]
  byRole: Record<string, TierGroup>
  listMeta: Record<string, WikiDigimonListItem>
  stageOptions: string[]
  attributeOptions: string[]
  elementOptions: string[]
  familyOptions: string[]
  selectedStages: string[]
  selectedAttributes: string[]
  selectedElements: string[]
  selectedFamilies: string[]
  toggleMultiFilter: (label: string, setter: Dispatch<SetStateAction<string[]>>) => void
  setSelectedStages: Dispatch<SetStateAction<string[]>>
  setSelectedAttributes: Dispatch<SetStateAction<string[]>>
  setSelectedElements: Dispatch<SetStateAction<string[]>>
  setSelectedFamilies: Dispatch<SetStateAction<string[]>>
}

export function TierListMatrixTable({
  tierMode,
  dpsTierCategory,
  roles,
  byRole,
  listMeta,
  stageOptions,
  attributeOptions,
  elementOptions,
  familyOptions,
  selectedStages,
  selectedAttributes,
  selectedElements,
  selectedFamilies,
  toggleMultiFilter,
  setSelectedStages,
  setSelectedAttributes,
  setSelectedElements,
  setSelectedFamilies,
}: Props) {
  return (
    <>
      <div className="tier-status-legend" role="note" aria-label="Status criteria">
        <span className="tier-status-legend-item">
          <span className="tier-status-dot tier-status-dot-complete" aria-hidden="true" />
          <span>{contentStatusLabel('complete')}</span>
        </span>
        <span className="tier-status-legend-item">
          <span className="tier-status-dot tier-status-dot-incomplete" aria-hidden="true" />
          <span>{contentStatusLabel('incomplete')}</span>
        </span>
        <span className="muted">
          Incomplete if skills &lt; 5 or any skill name contains “placeholder”.
        </span>
      </div>
      <TierListFilterPanel
        stageOptions={stageOptions}
        attributeOptions={attributeOptions}
        elementOptions={elementOptions}
        familyOptions={familyOptions}
        selectedStages={selectedStages}
        selectedAttributes={selectedAttributes}
        selectedElements={selectedElements}
        selectedFamilies={selectedFamilies}
        toggleMultiFilter={toggleMultiFilter}
        setSelectedStages={setSelectedStages}
        setSelectedAttributes={setSelectedAttributes}
        setSelectedElements={setSelectedElements}
        setSelectedFamilies={setSelectedFamilies}
      />
      {roles.length === 0 ? (
        <p className="muted tier-matrix-empty">
          No Digimon match this view. Try clearing filters
          {tierMode === 'tank'
            ? ' or note that only wiki role “Tank” appears here.'
            : tierMode === 'healer'
              ? ' or note that only wiki role “Support” appears here.'
              : '.'}
        </p>
      ) : (
        <div
          className={`tier-matrix-wrap${
            tierMode === 'tank' || tierMode === 'healer' || (tierMode === 'dps' && dpsTierCategory === 'aoe')
              ? ' tier-matrix-wrap--category-matrix'
              : ''
          }`}
        >
          <table
            className={`tier-matrix${
              tierMode === 'tank' || tierMode === 'healer' || (tierMode === 'dps' && dpsTierCategory === 'aoe')
                ? ' tier-matrix--category-matrix'
                : ''
            }`}
          >
            <colgroup>
              <col className="tier-matrix-col-rank" />
              {roles.map((r) => (
                <col key={r} className="tier-matrix-col-role" />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="tier-matrix-th-rank">Tier</th>
                {roles.map((r) => (
                  <th key={r}>{r}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(['S', 'A', 'B', 'C'] as const).map((tier) => (
                <tr key={`row-${tier}`}>
                  <td className={`tier-row-label tier-${tier.toLowerCase()}`}>{tier}</td>
                  {roles.map((role) => {
                    const columnGroup = byRole[role]
                    const entries = columnGroup?.tiers[tier] ?? []
                    return (
                      <td key={`${tier}-${role}`} className={`tier-cell tier-${tier.toLowerCase()}`}>
                        <div className="tier-cell-content">
                          {entries.length === 0 ? (
                            <span className="muted">—</span>
                          ) : (
                            <ul className="tier-entry-list">
                              {entries.map((e) => {
                                const modelId = listMeta[e.id]?.model_id ?? ''
                                const status = e.status ?? 'unknown'
                                const icon = modelId
                                  ? digimonPortraitUrl(modelId, e.id, e.name)
                                  : undefined
                                const scoreLabel =
                                  tierMode === 'dps' && dpsTierCategory === 'aoe' && columnGroup?.aoeSortKey
                                    ? (() => {
                                        const k = columnGroup.aoeSortKey
                                        const s = e.aoeCategoryScores
                                        const v = s?.[k]
                                        return v != null ? v.toFixed(2) : '…'
                                      })()
                                    : tierMode === 'dps' && dpsTierCategory !== 'aoe'
                                      ? (() => {
                                          const k = dpsTierCategory
                                          const s = e.dpsCategoryScores
                                          const v =
                                            k === 'sustained'
                                              ? (s?.sustained ?? e.dps)
                                              : k === 'burst'
                                                ? s?.burst
                                                : k === 'specialized'
                                                  ? s?.specialized
                                                  : undefined
                                          if (v == null) return '…'
                                          return k === 'specialized' ? v.toFixed(2) : v.toFixed(1)
                                        })()
                                      : tierMode === 'tank' && columnGroup?.tankSortKey
                                        ? (() => {
                                            const k = columnGroup.tankSortKey
                                            if (k === 'overall') {
                                              const v = e.tankCategoryScores?.overall ?? e.tankScore
                                              return v != null ? v.toFixed(2) : '…'
                                            }
                                            const d = e.tankEffectiveDisplay
                                            if (!d) return '…'
                                            if (k === 'hp') return Math.round(d.hp).toLocaleString()
                                            if (k === 'defense')
                                              return Math.round(d.defense).toLocaleString()
                                            if (k === 'evasion')
                                              return Math.round(d.evasion).toLocaleString()
                                            if (k === 'block') return Math.round(d.block).toLocaleString()
                                            return '…'
                                          })()
                                        : tierMode === 'healer' && columnGroup?.healerSortKey
                                          ? (() => {
                                              const k = columnGroup.healerSortKey
                                              if (k === 'general') {
                                                const v =
                                                  e.healerCategoryScores?.general ?? e.healerScore
                                                return v != null ? v.toFixed(2) : '…'
                                              }
                                              const m = e.healerDisplayMetrics
                                              if (!m) return '…'
                                              if (k === 'healing') return m.healHps.toFixed(1)
                                              if (k === 'shielding') return m.shieldHps.toFixed(1)
                                              if (k === 'buffing') return m.buffPctEquiv.toFixed(0)
                                              if (k === 'int') return Math.round(m.intTotal).toLocaleString()
                                              return '…'
                                            })()
                                          : e.dps.toFixed(1)
                                return (
                                  <li
                                    key={`${tier}-${role}-${e.id}`}
                                    className={`tier-entry ${
                                      status === 'incomplete'
                                        ? 'tier-entry-incomplete'
                                        : status === 'complete'
                                          ? 'tier-entry-complete'
                                          : 'tier-entry-unknown'
                                    }`}
                                    style={{ borderColor: digimonStageBorderColor(e.stage) }}
                                  >
                                    <Link
                                      to={`/digimon/${encodeURIComponent(e.id)}`}
                                      className="tier-entry-link"
                                      title={e.name}
                                    >
                                      {icon ? (
                                        <span className="tier-entry-thumb-wrap">
                                          <img src={icon} alt="" loading="lazy" />
                                        </span>
                                      ) : (
                                        <span className="tier-entry-fallback">{e.name.slice(0, 2)}</span>
                                      )}
                                      <span className="tier-entry-name">{e.name}</span>
                                      <span className="tier-entry-dps-wrap">
                                        <span className="tier-entry-dps">{scoreLabel}</span>
                                        <span
                                          className={`tier-status-dot ${
                                            status === 'incomplete'
                                              ? 'tier-status-dot-incomplete'
                                              : status === 'complete'
                                                ? 'tier-status-dot-complete'
                                                : 'tier-status-dot-unknown'
                                          }`}
                                          title={
                                            status === 'unknown'
                                              ? 'Status pending (run Update tier list)'
                                              : contentStatusLabel(status)
                                          }
                                          aria-label={
                                            status === 'unknown'
                                              ? 'Status pending (run Update tier list)'
                                              : contentStatusLabel(status)
                                          }
                                        />
                                      </span>
                                    </Link>
                                  </li>
                                )
                              })}
                            </ul>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
