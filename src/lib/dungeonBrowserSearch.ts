import type { WikiDungeonDetail, WikiDungeonLootItem } from '../types/wikiApi'

export type DungeonLootSearchMatch = {
  key: string
  itemId: string
  itemName: string
  iconId: string
  difficulty: string
  meta?: string
  context: string
}

function itemNameMatches(itemName: string | undefined, needle: string): boolean {
  const n = itemName?.trim().toLowerCase()
  return Boolean(n && n.includes(needle))
}

function formatLootQuantity(item: WikiDungeonLootItem): string | undefined {
  if (item.item_count != null) return `×${item.item_count}`
  const min = item.min ?? null
  const max = item.max ?? null
  if (min != null && max != null && min !== max) return `×${min}–${max}`
  if (min != null) return `×${min}`
  if (max != null) return `×${max}`
  return undefined
}

function formatRatePermil(permil: number): string {
  const pct = permil / 10
  return pct % 1 === 0 ? `${pct}%` : `${pct.toFixed(1)}%`
}

function formatLootMeta(item: WikiDungeonLootItem): string | undefined {
  const parts = [formatLootQuantity(item)].filter(Boolean) as string[]
  if (item.rate_permil != null) parts.push(formatRatePermil(item.rate_permil))
  return parts.length ? parts.join(' · ') : undefined
}

/** Match dungeon list search: name, objective monsters, and clear / raid loot. */
export function wikiDungeonDetailMatchesSearch(detail: WikiDungeonDetail, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  if (detail.name.trim().toLowerCase().includes(needle)) return true
  if (wikiDungeonMatchingLootItems(detail, q).length > 0) return true

  for (const row of detail.difficulties ?? []) {
    if (!row || typeof row === 'string') continue
    for (const objective of row.objectives ?? []) {
      const monster = objective.monster_name?.trim().toLowerCase()
      if (monster && monster.includes(needle)) return true
      const pen = objective.pen_name?.trim().toLowerCase()
      if (pen && pen.includes(needle)) return true
    }
  }

  return false
}

/** Loot rows whose item name matches the query — for inline display under a dungeon. */
export function wikiDungeonMatchingLootItems(
  detail: WikiDungeonDetail,
  q: string,
): DungeonLootSearchMatch[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return []

  const out: DungeonLootSearchMatch[] = []
  const seen = new Set<string>()

  const add = (match: DungeonLootSearchMatch) => {
    if (seen.has(match.key)) return
    seen.add(match.key)
    out.push(match)
  }

  for (const row of detail.difficulties ?? []) {
    if (!row || typeof row === 'string') continue
    const difficulty = row.difficulty?.trim() || 'Unknown'

    for (const reward of row.rewards ?? []) {
      if (!itemNameMatches(reward.item_name, needle)) continue
      add({
        key: `clear:${difficulty}:${reward.item_id}`,
        itemId: reward.item_id,
        itemName: reward.item_name,
        iconId: reward.item_icon_id,
        difficulty,
        meta: formatLootMeta(reward),
        context: 'Clear reward',
      })
    }

    for (const objective of row.objectives ?? []) {
      const boss = objective.monster_name?.trim()
      for (const band of objective.raid_rankings ?? []) {
        const rankLabel =
          band.start === band.end ? `Rank ${band.start}` : `Rank ${band.start}–${band.end}`
        for (const reward of band.rewards ?? []) {
          if (!itemNameMatches(reward.item_name, needle)) continue
          const contextParts = ['Raid', rankLabel]
          if (boss) contextParts.push(boss)
          add({
            key: `raid:${difficulty}:${objective.monster_id}:${band.start}:${band.end}:${reward.item_id}`,
            itemId: reward.item_id,
            itemName: reward.item_name,
            iconId: reward.item_icon_id,
            difficulty,
            meta: formatLootMeta(reward),
            context: contextParts.join(' · '),
          })
        }
      }
    }
  }

  return out
}
