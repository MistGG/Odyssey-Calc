import type { Dispatch, SetStateAction } from 'react'
import { digimonStageTierFilterStyle } from '../../lib/digimonStage'

type Props = {
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

export function TierListFilterPanel({
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
    <div className="tier-filter-panel">
      <div className="tier-filter-row" role="group" aria-labelledby="tier-filter-stage-label">
        <span className="tier-filter-label" id="tier-filter-stage-label">
          Stage
        </span>
        <div className="stage-tabs tier-filter-chips">
          {stageOptions.map((s) => {
            const selected = s === 'All' ? selectedStages.length === 0 : selectedStages.includes(s)
            return (
              <button
                key={s}
                type="button"
                className="stage-tab"
                style={digimonStageTierFilterStyle(s, selected)}
                onClick={() => toggleMultiFilter(s, setSelectedStages)}
                aria-pressed={selected}
              >
                {s}
              </button>
            )
          })}
        </div>
      </div>
      <div className="tier-filter-row" role="group" aria-labelledby="tier-filter-type-label">
        <span className="tier-filter-label" id="tier-filter-type-label">
          Type
        </span>
        <div className="stage-tabs tier-filter-chips">
          {attributeOptions.map((s) => {
            const selected =
              s === 'All' ? selectedAttributes.length === 0 : selectedAttributes.includes(s)
            return (
              <button
                key={s}
                type="button"
                className="stage-tab tier-facet-tab"
                onClick={() => toggleMultiFilter(s, setSelectedAttributes)}
                aria-pressed={selected}
              >
                {s}
              </button>
            )
          })}
        </div>
      </div>
      <div className="tier-filter-row" role="group" aria-labelledby="tier-filter-element-label">
        <span className="tier-filter-label" id="tier-filter-element-label">
          Element
        </span>
        <div className="stage-tabs tier-filter-chips">
          {elementOptions.map((s) => {
            const selected = s === 'All' ? selectedElements.length === 0 : selectedElements.includes(s)
            return (
              <button
                key={s}
                type="button"
                className="stage-tab tier-facet-tab"
                onClick={() => toggleMultiFilter(s, setSelectedElements)}
                aria-pressed={selected}
              >
                {s}
              </button>
            )
          })}
        </div>
      </div>
      <div className="tier-filter-row" role="group" aria-labelledby="tier-filter-family-label">
        <span className="tier-filter-label" id="tier-filter-family-label">
          Family
        </span>
        <div className="stage-tabs tier-filter-chips">
          {familyOptions.map((s) => {
            const selected = s === 'All' ? selectedFamilies.length === 0 : selectedFamilies.includes(s)
            return (
              <button
                key={s}
                type="button"
                className="stage-tab tier-facet-tab"
                onClick={() => toggleMultiFilter(s, setSelectedFamilies)}
                aria-pressed={selected}
              >
                {s}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
