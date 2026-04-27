/** The Digital Odyssey wiki (`/api/wiki/digimon`) response shapes. */

export type WikiDigimonListItem = {
  id: string
  name: string
  model_id: string
  stage: string
  attribute: string
  element: string
  role: string
  family_types: string[]
  rank: number
  hp: number
  attack: number
}

export type WikiDigimonListResponse = {
  data: WikiDigimonListItem[]
  page: number
  per_page: number
  total: number
  total_pages: number
}

export type WikiCombatStats = {
  hp: number
  ds: number
  attack: number
  defense: number
  crit_rate: number
  atk_speed: number
  evasion: number
  hit_rate: number
  block_rate: number
  dex: number
  int: number
}

export type WikiSkill = {
  id: string
  name: string
  description: string
  element: string
  icon_id: string
  base_dmg: number
  scaling: number
  max_level: number
  cast_time_sec: number
  cooldown_sec: number
  ds_cost: number
  /** Present for area skills (wiki AOE). */
  radius?: number
  /** Present on some wiki skill payloads when a damage skill can crit. */
  can_crit?: boolean | 0 | 1 | '0' | '1' | 'true' | 'false'
  /** Present for support skills. */
  buff?: {
    id: string
    name: string
    description: string
    duration?: number
    is_debuff?: boolean
    [key: string]: unknown
  }
}

export type WikiEvolutionNode = {
  slot: number
  digimon_id: string
  digimon_name: string
  model_id: string
  stage: string
  open_level: number
}

export type WikiEvolutionTree = {
  line_id: string
  nodes: WikiEvolutionNode[] | null
  edges: unknown
}

export type WikiDigimonDetail = {
  id: string
  name: string
  model_id: string
  stage: string
  attribute: string
  element: string
  role: string
  rank: number
  hp: number
  attack: number
  family_types: string[]
  stats: WikiCombatStats
  skills: WikiSkill[]
  evolution_tree?: WikiEvolutionTree | null
}
