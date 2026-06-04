import type { WikiItemDetail, WikiItemDropSource, WikiItemRaidSource } from '../types/wikiApi'
import { findDungeonDifficultyForRaidItem } from './guidebookDungeonPanel'
import { loadGuidebookDungeonDetail } from './guidebookWikiCache'

/** Split wiki item description into plain text and `@<tc:…>highlight@</tc:…>` segments. */
export function splitWikiItemDescription(description: string): { text: string; highlight?: boolean }[] {
  const re = /@<tc:\d+>(.*?)@<\/tc:\d+>/gi
  const parts: { text: string; highlight?: boolean }[] = []
  let last = 0
  let match: RegExpExecArray | null
  const copy = description

  while ((match = re.exec(copy))) {
    if (match.index > last) {
      parts.push({ text: copy.slice(last, match.index) })
    }
    parts.push({ text: match[1] ?? '', highlight: true })
    last = match.index + match[0].length
  }

  if (last < copy.length) {
    parts.push({ text: copy.slice(last) })
  }

  if (!parts.length && description) {
    parts.push({
      text: description.replace(/@<tc:\d+>/gi, '').replace(/@<\/tc:\d+>/gi, '').trim(),
    })
  }

  return parts
}

export function dedupeItemDropSources(sources: WikiItemDropSource[]): WikiItemDropSource[] {
  const seen = new Set<string>()
  return sources.filter((s) => {
    if (!s.monster_id || seen.has(s.monster_id)) return false
    seen.add(s.monster_id)
    return true
  })
}

export function formatRaidRatePermil(rate: number): string {
  return `${Math.round(rate / 100)}%`
}

export function formatRaidQuantity(min: number, max: number): string {
  if (min === max) return `×${min}`
  return `×${min}–${max}`
}

export function raidSourceKey(source: WikiItemRaidSource, index: number): string {
  return `${source.boss_id}-${source.rank_start}-${source.rank_end}-${index}`
}

export type GuidebookRaidSourceDungeonEntry = {
  dungeonId: string
  nameFallback: string
  bossId: string
  rate: number
  min: number
  max: number
}

/** One row per dungeon from item `raid_sources` (deduped by dungeon id). */
export function collectRaidSourceDungeonEntries(
  sources: WikiItemRaidSource[],
): GuidebookRaidSourceDungeonEntry[] {
  const seen = new Set<string>()
  const out: GuidebookRaidSourceDungeonEntry[] = []
  for (const src of sources) {
    for (const dungeon of src.dungeons ?? []) {
      if (!dungeon.id || seen.has(dungeon.id)) continue
      seen.add(dungeon.id)
      out.push({
        dungeonId: dungeon.id,
        nameFallback: dungeon.name,
        bossId: src.boss_id,
        rate: src.rate,
        min: src.min,
        max: src.max,
      })
    }
  }
  return out
}

export type GuidebookRaidSourceDungeonCard = {
  dungeonId: string
  nameFallback: string
  difficulty: string
  /** Raid reward rate (permil), used to sort obtain locations highest first. */
  dropRatePermil: number
  /** Raid reward metadata shown on the target item&apos;s loot row. */
  highlightLoot: {
    itemId: string
    name: string
    iconId: string
    qtyLabel: string
    rateLabel: string
  }
}

export async function buildRaidSourceDungeonCards(
  item: WikiItemDetail,
): Promise<GuidebookRaidSourceDungeonCard[]> {
  const entries = collectRaidSourceDungeonEntries(item.raid_sources ?? [])
  const cards: GuidebookRaidSourceDungeonCard[] = []
  for (const entry of entries) {
    const detail = await loadGuidebookDungeonDetail(entry.dungeonId)
    const difficulty = findDungeonDifficultyForRaidItem(detail, item.id, entry.bossId)
    if (!difficulty) continue
    cards.push({
      dungeonId: entry.dungeonId,
      nameFallback: entry.nameFallback,
      difficulty,
      dropRatePermil: entry.rate,
      highlightLoot: {
        itemId: item.id,
        name: item.name,
        iconId: item.icon_id,
        qtyLabel: formatRaidQuantity(entry.min, entry.max),
        rateLabel: formatRaidRatePermil(entry.rate),
      },
    })
  }
  return cards
}

export async function buildRaidSourceDungeonCardsForItems(
  items: WikiItemDetail[],
): Promise<GuidebookRaidSourceDungeonCard[]> {
  const cards: GuidebookRaidSourceDungeonCard[] = []
  for (const item of items) {
    cards.push(...(await buildRaidSourceDungeonCards(item)))
  }
  return cards
}
