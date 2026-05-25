import type {
  WikiDungeonDetail,
  WikiDungeonDifficulty,
  WikiDungeonLootItem,
  WikiDungeonObjective,
} from '../types/wikiApi'
import {
  GUIDEBOOK_DARK_ROAR_DUNGEON_ID,
  GUIDEBOOK_GEAR_CHARACTER_BOUND_ITEM_IDS,
  GUIDEBOOK_GEAR_TRADEABLE_ITEM_IDS,
  GUIDEBOOK_UNCAP_50_DUNGEON_ID,
  GUIDEBOOK_UNCAP_70_DUNGEON_ID,
} from './guidebookContent'

export type GuidebookDungeonMedia = {
  locationImageSrc: string
  locationImageAlt: string
  locationFilename: string
}

/** File under `public/` — prefixed with Vite `base` (e.g. `/Odyssey-Calc/` on GitHub Pages). */
export function guidebookPublicUrl(relativeFromPublic: string): string {
  const base = import.meta.env.BASE_URL || '/'
  const path = relativeFromPublic.replace(/^\//, '')
  return `${base.endsWith('/') ? base : `${base}/`}${path}`
}

function dungeonLocationMedia(
  filename: string,
  alt: string,
): GuidebookDungeonMedia {
  const rel = `guidebook/uncap-dungeons/${filename}`
  return {
    locationImageSrc: guidebookPublicUrl(rel),
    locationImageAlt: alt,
    locationFilename: filename,
  }
}

export const GUIDEBOOK_DUNGEON_MEDIA: Record<string, GuidebookDungeonMedia> = {
  [GUIDEBOOK_UNCAP_50_DUNGEON_ID]: dungeonLocationMedia(
    'agumons-madness-location.png',
    "Agumon's Madness — entrance / map location",
  ),
  [GUIDEBOOK_UNCAP_70_DUNGEON_ID]: dungeonLocationMedia(
    'fallen-angel-location.png',
    'The Rise of the Fallen Angel — entrance / map location',
  ),
  [GUIDEBOOK_DARK_ROAR_DUNGEON_ID]: dungeonLocationMedia(
    'dark-roar-location.png',
    'The Dark Roar — entrance / map location (Big Sight)',
  ),
}

export type GuidebookDungeonLootRow = {
  itemId: string
  name: string
  iconId: string
  hint?: string
}

const GUIDEBOOK_DIFFICULTY_ORDER = ['story', 'normal', 'hard'] as const

export function guidebookDungeonDifficultySortIndex(difficulty: string): number {
  const n = difficulty.trim().toLowerCase()
  const idx = GUIDEBOOK_DIFFICULTY_ORDER.indexOf(n as (typeof GUIDEBOOK_DIFFICULTY_ORDER)[number])
  return idx >= 0 ? idx : GUIDEBOOK_DIFFICULTY_ORDER.length
}

export function guidebookDungeonDifficultySlug(difficulty: string): 'story' | 'normal' | 'hard' | 'default' {
  const n = difficulty.trim().toLowerCase()
  if (n === 'story' || n === 'normal' || n === 'hard') return n
  return 'default'
}

const GEAR_CHARACTER_BOUND_IDS = new Set<string>(GUIDEBOOK_GEAR_CHARACTER_BOUND_ITEM_IDS)
const GEAR_TRADEABLE_IDS = new Set<string>(GUIDEBOOK_GEAR_TRADEABLE_ITEM_IDS)

/** Bind/trade label for a gear item shown on a dungeon loot row. */
export function guidebookGearDropBindTag(
  itemId: string,
): { label: string; tone: 'bound' | 'tradeable' } | null {
  if (GEAR_CHARACTER_BOUND_IDS.has(itemId)) {
    return { label: 'Character Bound', tone: 'bound' }
  }
  if (GEAR_TRADEABLE_IDS.has(itemId)) {
    return { label: 'Tradeable', tone: 'tradeable' }
  }
  return null
}

/** Story → Normal → Hard within each dungeon; preserve first-seen dungeon order across groups. */
export function sortGuidebookDungeonCards<T extends { dungeonId: string; difficulty: string }>(
  cards: readonly T[],
): T[] {
  const dungeonOrder: string[] = []
  const seenDungeons = new Set<string>()
  for (const card of cards) {
    if (!seenDungeons.has(card.dungeonId)) {
      seenDungeons.add(card.dungeonId)
      dungeonOrder.push(card.dungeonId)
    }
  }

  return [...cards].sort((a, b) => {
    const byDungeon = dungeonOrder.indexOf(a.dungeonId) - dungeonOrder.indexOf(b.dungeonId)
    if (byDungeon !== 0) return byDungeon
    return (
      guidebookDungeonDifficultySortIndex(a.difficulty) -
      guidebookDungeonDifficultySortIndex(b.difficulty)
    )
  })
}

function lootHint(item: WikiDungeonLootItem): string | undefined {
  if (item.item_count != null) return `×${item.item_count}`
  if (item.min != null && item.max != null && item.min !== item.max) {
    return `×${item.min}–${item.max}`
  }
  if (item.min != null) return `×${item.min}`
  return undefined
}

export type GuidebookDungeonBoss = {
  name: string
  subtitle?: string
  level: number
  hp?: number
  modelId: string
  monsterId: string
}

/** Difficulty tier that lists `itemId` in raid rankings (optionally for a specific boss). */
export function findDungeonDifficultyForRaidItem(
  detail: WikiDungeonDetail | null,
  itemId: string,
  bossId?: string,
): string | null {
  if (!detail?.difficulties?.length) return null
  const diffs = detail.difficulties.filter(
    (d): d is WikiDungeonDifficulty => typeof d !== 'string',
  )

  const difficultyHasItem = (diff: WikiDungeonDifficulty, requireBoss: boolean) => {
    for (const objective of diff.objectives ?? []) {
      if (requireBoss && bossId && objective.monster_id !== bossId) continue
      for (const ranking of objective.raid_rankings ?? []) {
        if (ranking.rewards?.some((r) => r.item_id === itemId)) return true
      }
    }
    return diff.rewards?.some((r) => r.item_id === itemId) ?? false
  }

  for (const diff of diffs) {
    if (difficultyHasItem(diff, true)) return diff.difficulty
  }
  for (const diff of diffs) {
    if (difficultyHasItem(diff, false)) return diff.difficulty
  }
  return diffs[0]?.difficulty ?? null
}

export function wikiDungeonDifficulty(
  detail: WikiDungeonDetail | null,
  difficulty: string,
): WikiDungeonDifficulty | null {
  if (!detail?.difficulties?.length) return null
  const first = detail.difficulties[0]
  if (typeof first === 'string') return null
  return detail.difficulties.find((d) => d.difficulty === difficulty) ?? null
}

/** @deprecated Use wikiDungeonDifficulty(detail, 'Normal') */
export function wikiDungeonNormalDifficulty(detail: WikiDungeonDetail | null) {
  return wikiDungeonDifficulty(detail, 'Normal')
}

export function collectGuidebookDungeonLoot(
  diff: WikiDungeonDifficulty | null,
): GuidebookDungeonLootRow[] {
  if (!diff) return []
  const seen = new Map<string, GuidebookDungeonLootRow>()

  const add = (item: WikiDungeonLootItem) => {
    if (!item.item_id?.trim() || seen.has(item.item_id)) return
    seen.set(item.item_id, {
      itemId: item.item_id,
      name: item.item_name,
      iconId: item.item_icon_id,
      hint: lootHint(item),
    })
  }

  for (const reward of diff.rewards ?? []) add(reward)
  for (const objective of diff.objectives ?? []) {
    for (const ranking of objective.raid_rankings ?? []) {
      for (const reward of ranking.rewards ?? []) add(reward)
    }
  }

  return [...seen.values()]
}

export function guidebookBossFromObjective(
  objective: WikiDungeonObjective | undefined,
  hp?: number,
): GuidebookDungeonBoss | null {
  if (!objective?.model_id) return null
  const subtitle = objective.pen_name?.replace(/^<|>$/g, '').trim()
  return {
    name: objective.monster_name,
    subtitle: subtitle || undefined,
    level: objective.level,
    hp,
    modelId: objective.model_id,
    monsterId: objective.monster_id,
  }
}

export function formatGuidebookBossHp(hp: number | undefined): string | null {
  if (hp == null || hp <= 0) return null
  return `${hp.toLocaleString()} HP`
}

export function stripWikiColorTags(text: string): string {
  return text.replace(/@<tc:\d+>/gi, '').replace(/@<\/tc>/gi, '').trim()
}
