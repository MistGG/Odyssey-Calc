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


export type WikiDungeonListItem = {
  id: string
  name: string
  map_name?: string
  image?: string
  /** Present on list rows; detail responses use structured difficulties. */
  difficulties?: string[] | WikiDungeonDifficulty[]
}

export type WikiDungeonLootItem = {
  item_id: string
  item_name: string
  item_icon_id: string
  item_count?: number
  min?: number
  max?: number
  rate_permil?: number
}

export type WikiDungeonObjective = {
  step: number
  monster_id: string
  monster_name: string
  pen_name?: string
  level: number
  model_id: string
  count: number
  raid_rankings?: { start: number; end: number; rewards: WikiDungeonLootItem[] }[]
}

export type WikiDungeonDifficulty = {
  difficulty: string
  user_limit?: number
  weekly_limit?: number
  objectives: WikiDungeonObjective[]
  rewards: WikiDungeonLootItem[]
  time_limit_sec?: number
  death_limit?: number
}

export type WikiDungeonDetail = WikiDungeonListItem & {
  difficulties: WikiDungeonDifficulty[]
}

export type WikiDungeonListResponse = {
  data: WikiDungeonListItem[]
  page: number
  per_page: number
  total: number
  total_pages: number
}

export type WikiItemDropSource = {
  monster_id: string
  monster_name: string
  monster_level: number
  quantity: number
  drop_type: string
  locations: { map_id: string; map_name: string; count: number }[]
}

export type WikiItemRaidSource = {
  boss_id: string
  boss_name: string
  boss_level: number
  dungeons: { id: string; name: string }[]
  rank_start: number
  rank_end: number
  rate: number
  min: number
  max: number
}

export type WikiItemDetail = {
  id: string
  name: string
  description: string
  type: number
  type_name: string
  sub_type: number
  icon_id: string
  drop_sources?: WikiItemDropSource[]
  raid_sources?: WikiItemRaidSource[]
}

export type WikiMonsterDrop = {
  item_id: string
  item_name: string
  item_icon_id: string
  quantity: number
  drop_type: string
}

export type WikiMonsterLocation = {
  map_id: string
  map_name: string
  count: number
}

export type WikiMonsterDetail = {
  id: string
  name: string
  pen_name?: string
  model_id: string
  level: number
  hp: number
  attack?: number
  defense?: number
  exp?: number
  bits?: number
  drops?: WikiMonsterDrop[]
  locations?: WikiMonsterLocation[]
}

export type WikiQuestObjective = {
  type: string
  target: string
  target_id?: string
  quantity?: number
}

export type WikiQuestReward = {
  type: string
  value: number | string
}

export type WikiQuestRequirement = {
  type: string
  value: number | string
  quantity?: number
  name?: string
  quest_id?: string
}

export type WikiQuestDetail = {
  id: string
  title_tab: string
  title_text: string
  type: string
  body_text: string
  simple_text: string
  process_text?: string
  complete_text?: string
  npc_start?: string
  npc_start_id?: string
  npc_end?: string
  npc_end_id?: string
  objectives: WikiQuestObjective[]
  rewards: WikiQuestReward[]
  requirements: WikiQuestRequirement[]
}

export type WikiNpcQuestRef = {
  id: string
  name: string
  type: string
  role: string
}

export type WikiNpcDetail = {
  id: string
  name: string
  model_id: string
  type: string
  map_name: string
  quests: WikiNpcQuestRef[]
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
  open_item_id?: string
  open_item_name?: string
  open_item_icon_id?: string
  open_item_qty?: number
  tamer_ds?: number
}

export type WikiEvolutionEdge = {
  from: string
  to: string
}

export type WikiEvolutionTree = {
  line_id: string
  nodes: WikiEvolutionNode[] | null
  edges: WikiEvolutionEdge[] | null
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
