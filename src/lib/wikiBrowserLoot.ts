import type {
  WikiDungeonDetail,
  WikiDungeonLootItem,
  WikiItemRaidSource,
} from '../types/wikiApi'
import { formatRaidQuantity, formatRaidRatePermil } from './guidebookItemPanel'

export type WikiDungeonLootDisplayRow = {
  key: string
  context: 'clear' | 'raid'
  difficulty: string
  bossId?: string
  bossName?: string
  rankStart?: number
  rankEnd?: number
  itemId: string
  itemName: string
  iconId: string
  qty?: string
  rate?: string
}

export function formatWikiLootQuantity(item: WikiDungeonLootItem): string | undefined {
  if (item.item_count != null) return `×${item.item_count}`
  if (item.min != null && item.max != null) return formatRaidQuantity(item.min, item.max)
  if (item.min != null) return `×${item.min}`
  if (item.max != null) return `×${item.max}`
  return undefined
}

export function formatWikiLootRate(ratePermil: number | undefined): string | undefined {
  if (ratePermil == null) return undefined
  return formatRaidRatePermil(ratePermil)
}

export function formatWikiRankLabel(start: number, end: number): string {
  return start === end ? `Place ${start}` : `Places ${start}–${end}`
}

const DIFFICULTY_SORT = ['story', 'normal', 'hard'] as const

export function dungeonDetailDifficultyLabels(detail: WikiDungeonDetail): string[] {
  const seen = new Set<string>()
  const labels: string[] = []
  for (const raw of detail.difficulties ?? []) {
    const label = typeof raw === 'string' ? raw.trim() : raw.difficulty?.trim()
    if (!label) continue
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    labels.push(label)
  }
  return labels.sort((a, b) => {
    const ai = DIFFICULTY_SORT.indexOf(a.toLowerCase() as (typeof DIFFICULTY_SORT)[number])
    const bi = DIFFICULTY_SORT.indexOf(b.toLowerCase() as (typeof DIFFICULTY_SORT)[number])
    return (ai >= 0 ? ai : DIFFICULTY_SORT.length) - (bi >= 0 ? bi : DIFFICULTY_SORT.length)
  })
}

export function collectWikiDungeonLootRows(detail: WikiDungeonDetail): WikiDungeonLootDisplayRow[] {
  const rows: WikiDungeonLootDisplayRow[] = []

  for (const diff of detail.difficulties ?? []) {
    if (!diff || typeof diff === 'string') continue
    const difficulty = diff.difficulty?.trim() || 'Unknown'

    for (const [index, reward] of (diff.rewards ?? []).entries()) {
      if (!reward.item_id) continue
      rows.push({
        key: `clear:${difficulty}:${reward.item_id}:${index}`,
        context: 'clear',
        difficulty,
        itemId: reward.item_id,
        itemName: reward.item_name,
        iconId: reward.item_icon_id,
        qty: formatWikiLootQuantity(reward),
        rate: formatWikiLootRate(reward.rate_permil),
      })
    }

    for (const objective of diff.objectives ?? []) {
      for (const band of objective.raid_rankings ?? []) {
        for (const [index, reward] of (band.rewards ?? []).entries()) {
          if (!reward.item_id) continue
          rows.push({
            key: `raid:${difficulty}:${objective.monster_id}:${band.start}:${band.end}:${reward.item_id}:${index}`,
            context: 'raid',
            difficulty,
            bossId: objective.monster_id,
            bossName: objective.monster_name,
            rankStart: band.start,
            rankEnd: band.end,
            itemId: reward.item_id,
            itemName: reward.item_name,
            iconId: reward.item_icon_id,
            qty: formatWikiLootQuantity(reward),
            rate: formatWikiLootRate(reward.rate_permil),
          })
        }
      }
    }
  }

  return rows
}

export type WikiItemDungeonRow = {
  key: string
  dungeonId: string
  dungeonName: string
  bossId: string
  bossName: string
  bossLevel: number
  rankStart: number
  rankEnd: number
  qty: string
  rate: string
  rateValue: number
}

export function collectItemDungeonRows(sources: WikiItemRaidSource[]): WikiItemDungeonRow[] {
  const seen = new Set<string>()
  const rows: WikiItemDungeonRow[] = []

  for (const [index, source] of sources.entries()) {
    for (const dungeon of source.dungeons ?? []) {
      if (!dungeon.id) continue
      const key = `${dungeon.id}-${source.boss_id}-${source.rank_start}-${source.rank_end}-${index}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({
        key,
        dungeonId: dungeon.id,
        dungeonName: dungeon.name,
        bossId: source.boss_id,
        bossName: source.boss_name,
        bossLevel: source.boss_level,
        rankStart: source.rank_start,
        rankEnd: source.rank_end,
        qty: formatRaidQuantity(source.min, source.max),
        rate: formatRaidRatePermil(source.rate),
        rateValue: source.rate,
      })
    }
  }

  return rows.sort((a, b) => b.rateValue - a.rateValue)
}

export function collectItemRaidRowsWithoutDungeon(sources: WikiItemRaidSource[]): WikiItemRaidSource[] {
  return sources.filter((source) => !source.dungeons?.some((dungeon) => dungeon.id))
}
