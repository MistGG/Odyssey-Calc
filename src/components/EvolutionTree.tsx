import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  buildEvolutionTreeLayout,
  EVO_TREE_COL_WIDTH,
  EVO_TREE_NODE_SIZE,
  EVO_TREE_PAD_X,
} from '../lib/evolutionTreeLayout'
import { digimonPortraitUrl } from '../lib/digimonImage'
import { digimonStageAccentColor, digimonStagePortraitGradient } from '../lib/digimonStage'
import type { WikiEvolutionTree } from '../types/wikiApi'

function stageShortLabel(stage: string): string {
  if (stage === 'Burst Mode' || stage.startsWith('Burst Mode')) return 'BURST MODE'
  return stage.toUpperCase()
}

function EvolutionTreeNode({
  digimonId,
  currentDigimonId,
  node,
  x,
  y,
  stage,
  accent,
}: {
  digimonId: string
  currentDigimonId: string
  node: { digimon_name: string; model_id: string; open_level: number }
  x: number
  y: number
  stage: string
  accent: string
}) {
  const [broken, setBroken] = useState(false)
  const src = digimonPortraitUrl(node.model_id, digimonId, node.digimon_name)

  return (
    <Link
      to={`/digimon/${encodeURIComponent(digimonId)}`}
      className={`evo-tree__node${digimonId === currentDigimonId ? ' evo-tree__node--active' : ''}`}
      style={{
        left: x + (EVO_TREE_COL_WIDTH - EVO_TREE_NODE_SIZE) / 2,
        top: y,
        ['--evo-accent' as string]: accent,
      }}
      title={`${node.digimon_name} · Lv ${node.open_level}+`}
    >
      <span
        className="evo-tree__portrait"
        style={{ background: digimonStagePortraitGradient(stage) }}
      >
        {src && !broken ? (
          <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} />
        ) : (
          <span className="evo-tree__initial">{node.digimon_name.slice(0, 1)}</span>
        )}
      </span>
      <span className="evo-tree__name">{node.digimon_name}</span>
    </Link>
  )
}

export function EvolutionTree({
  tree,
  currentDigimonId,
}: {
  tree: WikiEvolutionTree | null | undefined
  currentDigimonId: string
}) {
  const layout = useMemo(
    () => buildEvolutionTreeLayout(tree, currentDigimonId),
    [tree, currentDigimonId],
  )

  if (!layout) {
    return (
      <div className="evo-tree-panel">
        <div className="evo-tree-panel__head">
          <span className="evo-tree-panel__icon" aria-hidden>
            🧬
          </span>
          <h3 className="evo-tree-panel__title">Evolution tree</h3>
        </div>
        <p className="muted">No evolution tree returned.</p>
      </div>
    )
  }

  return (
    <div className="evo-tree-panel">
      <div className="evo-tree-panel__head">
        <span className="evo-tree-panel__icon" aria-hidden>
          🧬
        </span>
        <h3 className="evo-tree-panel__title">Evolution tree</h3>
      </div>
      <div className="evo-tree-panel__body">
        <div
          className="evo-tree"
          style={{ width: layout.width, height: layout.height }}
          role="img"
          aria-label="Evolution tree"
        >
      <div className="evo-tree__stage-row" aria-hidden>
        {layout.stages.map((stage, col) => (
          <span
            key={stage}
            className="evo-tree__stage-label"
            style={{
              left: EVO_TREE_PAD_X + col * EVO_TREE_COL_WIDTH,
              width: EVO_TREE_COL_WIDTH,
              color: digimonStageAccentColor(stage),
            }}
          >
            {stageShortLabel(stage)}
          </span>
        ))}
      </div>
      <svg className="evo-tree__svg" width={layout.width} height={layout.height} aria-hidden>
        {layout.edges.map((e) => (
          <path key={`${e.from}-${e.to}`} d={e.path} className="evo-tree__edge" />
        ))}
      </svg>
      {layout.nodes.map((n) => (
        <EvolutionTreeNode
          key={n.digimonId}
          digimonId={n.digimonId}
          currentDigimonId={currentDigimonId}
          node={n.node}
          x={n.x}
          y={n.y}
          stage={n.stage}
          accent={n.accent}
        />
      ))}
        </div>
      </div>
    </div>
  )
}
