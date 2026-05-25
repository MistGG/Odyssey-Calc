import { digimonStageAccentColor } from './digimonStage'
import type { WikiEvolutionEdge, WikiEvolutionNode, WikiEvolutionTree } from '../types/wikiApi'

const STAGE_ORDER = [
  'DigiTama',
  'In-Training',
  'Baby',
  'Rookie',
  'Rookie X',
  'Armor',
  'Champion',
  'Champion X',
  'Ultimate',
  'Ultimate X',
  'Mega',
  'Mega X',
  'Jogress',
  'Jogress X',
  'Burst Mode',
  'Burst Mode X',
  'Spirit',
  'Extra',
] as const

export function evolutionStageIndex(stage: string): number {
  const key = stage.trim()
  const i = (STAGE_ORDER as readonly string[]).indexOf(key)
  return i >= 0 ? i : 999
}

function parseEdges(raw: WikiEvolutionTree['edges']): WikiEvolutionEdge[] {
  if (!raw || !Array.isArray(raw)) return []
  return raw.filter(
    (e): e is WikiEvolutionEdge =>
      Boolean(e) &&
      typeof e === 'object' &&
      typeof (e as WikiEvolutionEdge).from === 'string' &&
      typeof (e as WikiEvolutionEdge).to === 'string',
  )
}

function presentStagesSorted(nodes: WikiEvolutionNode[]): string[] {
  const stageSet = new Set(nodes.map((n) => n.stage.trim()))
  const stages: string[] = STAGE_ORDER.filter((s) => stageSet.has(s))
  for (const s of stageSet) {
    if (!stages.includes(s)) stages.push(s)
  }
  stages.sort((a, b) => evolutionStageIndex(a) - evolutionStageIndex(b))
  return stages
}

function forwardEdges(
  nodes: WikiEvolutionNode[],
  edges: WikiEvolutionEdge[],
): WikiEvolutionEdge[] {
  const byId = new Map(nodes.map((n) => [n.digimon_id, n]))
  const seen = new Set<string>()
  const out: WikiEvolutionEdge[] = []
  for (const e of edges) {
    const from = byId.get(e.from)
    const to = byId.get(e.to)
    if (!from || !to) continue
    if (evolutionStageIndex(to.stage) <= evolutionStageIndex(from.stage)) continue
    const key = `${e.from}->${e.to}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
  }
  return out
}

function canReach(
  start: string,
  target: string,
  childrenMap: Map<string, string[]>,
  visited = new Set<string>(),
): boolean {
  if (start === target) return true
  if (visited.has(start)) return false
  visited.add(start)
  for (const kid of childrenMap.get(start) ?? []) {
    if (canReach(kid, target, childrenMap, visited)) return true
  }
  return false
}

/** Remove A→C when some A→…→C path exists through another form. */
function transitiveReduction(edges: WikiEvolutionEdge[]): WikiEvolutionEdge[] {
  const childrenMap = buildChildrenMap(edges)
  return edges.filter((e) => {
    for (const mid of childrenMap.get(e.from) ?? []) {
      if (mid === e.to) continue
      if (canReach(mid, e.to, childrenMap)) return false
    }
    return true
  })
}

export function buildChildrenMap(edges: WikiEvolutionEdge[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const { from, to } of edges) {
    const list = map.get(from) ?? []
    list.push(to)
    map.set(from, list)
  }
  for (const [id, kids] of map) {
    map.set(id, [...new Set(kids)])
  }
  return map
}

export function buildParentsMap(edges: WikiEvolutionEdge[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const { from, to } of edges) {
    const list = map.get(to) ?? []
    list.push(from)
    map.set(to, list)
  }
  return map
}

function sortChildIds(
  childIds: string[],
  nodeById: Map<string, WikiEvolutionNode>,
): string[] {
  return [...childIds].sort(
    (a, b) => (nodeById.get(a)?.slot ?? 0) - (nodeById.get(b)?.slot ?? 0),
  )
}

export type EvolutionGraph = {
  lineId: string
  rootId: string
  nodes: WikiEvolutionNode[]
  edges: WikiEvolutionEdge[]
  stages: string[]
  childrenMap: Map<string, string[]>
  parentsMap: Map<string, string[]>
  nodeById: Map<string, WikiEvolutionNode>
}

export function parseEvolutionGraph(
  tree: WikiEvolutionTree | null | undefined,
  lineId?: string,
): EvolutionGraph | null {
  const nodes = tree?.nodes?.filter((n) => n.digimon_id?.trim()) ?? []
  if (!nodes.length) return null

  const nodeById = new Map(nodes.map((n) => [n.digimon_id, n]))
  const stages = presentStagesSorted(nodes)
  const allEdges = parseEdges(tree?.edges ?? null)
  // Keep forward edges (incl. Rookie→Champion when Armor is a side branch). Drop only
  // transitive shortcuts (e.g. Rookie→Mega when Rookie→…→Mega exists).
  const edges = transitiveReduction(forwardEdges(nodes, allEdges))
  const childrenMap = buildChildrenMap(edges)
  const parentsMap = buildParentsMap(edges)
  const rootId = findRootId(nodes, edges, tree?.line_id ?? lineId ?? '')

  return {
    lineId: tree?.line_id ?? '',
    rootId,
    nodes,
    edges,
    stages,
    childrenMap,
    parentsMap,
    nodeById,
  }
}

function findRootId(
  nodes: WikiEvolutionNode[],
  edges: WikiEvolutionEdge[],
  lineId: string,
): string {
  const ids = new Set(nodes.map((n) => n.digimon_id))
  if (lineId && ids.has(lineId)) return lineId

  const incoming = new Set(edges.map((e) => e.to))
  const roots = nodes.filter((n) => !incoming.has(n.digimon_id))
  if (roots.length === 0) return nodes[0]?.digimon_id ?? ''
  roots.sort((a, b) => evolutionStageIndex(a.stage) - evolutionStageIndex(b.stage))
  return roots[0]!.digimon_id
}

function assignRow(
  nodeId: string,
  childrenMap: Map<string, string[]>,
  nodeById: Map<string, WikiEvolutionNode>,
  rows: Map<string, number>,
  leafRow: { n: number },
): number {
  const cached = rows.get(nodeId)
  if (cached != null) return cached

  const kids = sortChildIds(childrenMap.get(nodeId) ?? [], nodeById)
  if (kids.length === 0) {
    const r = leafRow.n++
    rows.set(nodeId, r)
    return r
  }

  const childRows = kids.map((id) =>
    assignRow(id, childrenMap, nodeById, rows, leafRow),
  )
  const r = (Math.min(...childRows) + Math.max(...childRows)) / 2
  rows.set(nodeId, r)
  return r
}

export type EvolutionTreeLayoutNode = {
  digimonId: string
  node: WikiEvolutionNode
  stage: string
  col: number
  row: number
  x: number
  y: number
  accent: string
}

export type EvolutionTreeLayoutEdge = {
  from: string
  to: string
  path: string
}

export type EvolutionTreeLayout = {
  stages: string[]
  nodes: EvolutionTreeLayoutNode[]
  edges: EvolutionTreeLayoutEdge[]
  width: number
  height: number
}

export const EVO_TREE_COL_WIDTH = 108
export const EVO_TREE_ROW_HEIGHT = 112
export const EVO_TREE_HEADER = 36
export const EVO_TREE_PAD_X = 20
export const EVO_TREE_PAD_Y = 12
export const EVO_TREE_NODE_SIZE = 64
export const EVO_TREE_LABEL_H = 36

export function buildEvolutionTreeLayout(
  tree: WikiEvolutionTree | null | undefined,
  highlightId?: string,
): EvolutionTreeLayout | null {
  const graph = parseEvolutionGraph(tree, highlightId)
  if (!graph) return null

  const { nodes, edges, stages, childrenMap, nodeById, rootId } = graph

  const rows = new Map<string, number>()
  if (rootId) assignRow(rootId, childrenMap, nodeById, rows, { n: 0 })

  for (const n of nodes) {
    if (!rows.has(n.digimon_id)) assignRow(n.digimon_id, childrenMap, nodeById, rows, { n: rows.size })
  }

  const colByStage = new Map(stages.map((s, i) => [s, i]))

  const layoutNodes: EvolutionTreeLayoutNode[] = nodes.map((node) => {
    const stage = node.stage.trim()
    const col = colByStage.get(stage) ?? 0
    const row = rows.get(node.digimon_id) ?? 0
    const x = EVO_TREE_PAD_X + col * EVO_TREE_COL_WIDTH
    const y = EVO_TREE_HEADER + EVO_TREE_PAD_Y + row * EVO_TREE_ROW_HEIGHT
    return {
      digimonId: node.digimon_id,
      node,
      stage,
      col,
      row,
      x,
      y,
      accent: digimonStageAccentColor(stage),
    }
  })

  const maxCol = Math.max(0, ...layoutNodes.map((n) => n.col))
  const maxRow = Math.max(0, ...layoutNodes.map((n) => n.row))
  const width =
    EVO_TREE_PAD_X * 2 + (maxCol + 1) * EVO_TREE_COL_WIDTH
  const height =
    EVO_TREE_HEADER +
    EVO_TREE_PAD_Y * 2 +
    (maxRow + 1) * EVO_TREE_ROW_HEIGHT +
    EVO_TREE_LABEL_H

  const centerById = new Map(
    layoutNodes.map((n) => [
      n.digimonId,
      {
        cx: n.x + EVO_TREE_COL_WIDTH / 2,
        cy: n.y + EVO_TREE_NODE_SIZE / 2,
      },
    ]),
  )

  const layoutEdges: EvolutionTreeLayoutEdge[] = edges
    .map((e) => {
      const from = centerById.get(e.from)
      const to = centerById.get(e.to)
      if (!from || !to) return null
      const x1 = from.cx + EVO_TREE_NODE_SIZE / 2 - 4
      const y1 = from.cy
      const x2 = to.cx - EVO_TREE_NODE_SIZE / 2 + 4
      const y2 = to.cy
      const mx = (x1 + x2) / 2
      const path = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`
      return { from: e.from, to: e.to, path }
    })
    .filter((e): e is EvolutionTreeLayoutEdge => e != null)

  return {
    stages,
    nodes: layoutNodes,
    edges: layoutEdges,
    width,
    height,
  }
}
