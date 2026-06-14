import sealSourcesJson from '../data/guidebookSealSources.json'
import type { SealStat } from './gearStats'
import { SEAL_STAT_META } from './gearStats'
import { guidebookDungeonDifficultySlug, wikiDungeonDifficulty } from './guidebookDungeonPanel'
import type { WikiDungeonDetail } from '../types/wikiApi'

export type GuidebookSealSourceRow = {
  itemId: string
  dungeonId: string
  dungeonName: string
  difficulty: string
  ratePermil: number | null
  iconId: string
  itemName: string
}

export type GuidebookSealCategory = {
  itemId: string
  boxTag: string
  sealStatId: SealStat
  label: string
  itemName: string
  iconId: string
}

export type GuidebookSealDungeonEntry = {
  dungeonId: string
  dungeonName: string
  difficulty: string
  difficultySlug: ReturnType<typeof guidebookDungeonDifficultySlug>
  bossLevel: number | null
}

/** Wiki item ids for each seal box variant (synced from wiki via scripts/sync-guidebook-seal-sources.mjs). */
export const GUIDEBOOK_SEAL_BOXES: readonly GuidebookSealCategory[] = [
  {
    itemId: 'im8ez2m',
    boxTag: 'MaxHP',
    sealStatId: 'hp',
    label: 'HP',
    itemName: 'Digimon Seal Box [MaxHP]',
    iconId: 'nipjg96',
  },
  {
    itemId: 'ik5346',
    boxTag: 'MaxDS',
    sealStatId: 'ds',
    label: 'DS',
    itemName: 'Digimon Seal Box [MaxDS]',
    iconId: 'nipjg96',
  },
  {
    itemId: 'i15piowp',
    boxTag: 'AT',
    sealStatId: 'at',
    label: 'Attack',
    itemName: 'Digimon Seal Box [AT]',
    iconId: 'nd821v9',
  },
  {
    itemId: 'i7hcrit',
    boxTag: 'CT',
    sealStatId: 'ct',
    label: 'Crit Rate',
    itemName: 'Digimon Seal Box [CT]',
    iconId: 'nd821v9',
  },
  {
    itemId: 'i1jlukjy',
    boxTag: 'DE',
    sealStatId: 'de',
    label: 'Defense',
    itemName: 'Digimon Seal Box [DE]',
    iconId: 'n1h2x51',
  },
] as const

const sealSourcesByItemId = sealSourcesJson as Record<string, GuidebookSealSourceRow[]>

/** Display order follows Gear → Seals stat layout where a box exists. */
export function guidebookSealCategories(): GuidebookSealCategory[] {
  const order = SEAL_STAT_META.map((m) => m.id)
  return [...GUIDEBOOK_SEAL_BOXES].sort(
    (a, b) => order.indexOf(a.sealStatId) - order.indexOf(b.sealStatId),
  )
}

export function guidebookSealSourcesForItem(itemId: string): GuidebookSealSourceRow[] {
  return sealSourcesByItemId[itemId] ?? []
}

export function bossLevelForSealDungeon(
  detail: WikiDungeonDetail | null,
  difficulty: string,
): number | null {
  const level = wikiDungeonDifficulty(detail, difficulty)?.objectives?.[0]?.level
  return level != null && Number.isFinite(level) ? level : null
}

export function sortSealDungeonsByLevel(entries: GuidebookSealDungeonEntry[]): GuidebookSealDungeonEntry[] {
  return [...entries].sort((a, b) => {
    const lvlA = a.bossLevel ?? Number.MAX_SAFE_INTEGER
    const lvlB = b.bossLevel ?? Number.MAX_SAFE_INTEGER
    if (lvlA !== lvlB) return lvlA - lvlB
    const byName = a.dungeonName.localeCompare(b.dungeonName)
    if (byName !== 0) return byName
    return a.difficulty.localeCompare(b.difficulty)
  })
}

export function guidebookSealDungeonEntryFromRow(
  row: GuidebookSealSourceRow,
  detail: WikiDungeonDetail | null,
): GuidebookSealDungeonEntry {
  return {
    dungeonId: row.dungeonId,
    dungeonName: detail?.name?.trim() || row.dungeonName,
    difficulty: row.difficulty,
    difficultySlug: guidebookDungeonDifficultySlug(row.difficulty),
    bossLevel: bossLevelForSealDungeon(detail, row.difficulty),
  }
}
