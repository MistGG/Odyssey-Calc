import tokenSourcesJson from '../data/guidebookDarkMastersTokenSources.json'
import { guidebookDungeonDifficultySlug } from './guidebookDungeonPanel'
import type { WikiDungeonDetail } from '../types/wikiApi'

export type GuidebookDarkMastersTokenSourceRow = {
  dungeonId: string
  dungeonName: string
  difficulty: string
  tokenCount: number
  iconId: string
  itemName: string
}

export type GuidebookDarkMastersTokenDungeonEntry = {
  dungeonId: string
  dungeonName: string
  difficulty: string
  difficultySlug: ReturnType<typeof guidebookDungeonDifficultySlug>
  bossLevel: number | null
  tokenCount: number
  iconId: string
  itemName: string
}

const tokenSources = tokenSourcesJson as GuidebookDarkMastersTokenSourceRow[]

export function guidebookDarkMastersTokenSources(): GuidebookDarkMastersTokenSourceRow[] {
  return tokenSources
}

export function bossLevelForDarkMastersTokenDungeon(
  detail: WikiDungeonDetail | null,
  difficulty: string,
): number | null {
  const diff = detail?.difficulties?.find(
    (entry) => typeof entry !== 'string' && entry.difficulty === difficulty,
  )
  const level =
    diff && typeof diff !== 'string' ? diff.objectives?.[0]?.level : undefined
  return level != null && Number.isFinite(level) ? level : null
}

export function sortDarkMastersTokenDungeonsByLevel(
  entries: GuidebookDarkMastersTokenDungeonEntry[],
): GuidebookDarkMastersTokenDungeonEntry[] {
  return [...entries].sort((a, b) => {
    const lvlA = a.bossLevel ?? Number.MAX_SAFE_INTEGER
    const lvlB = b.bossLevel ?? Number.MAX_SAFE_INTEGER
    if (lvlA !== lvlB) return lvlA - lvlB
    const byName = a.dungeonName.localeCompare(b.dungeonName)
    if (byName !== 0) return byName
    return a.difficulty.localeCompare(b.difficulty)
  })
}

export function guidebookDarkMastersTokenDungeonEntryFromRow(
  row: GuidebookDarkMastersTokenSourceRow,
  detail: WikiDungeonDetail | null,
): GuidebookDarkMastersTokenDungeonEntry {
  return {
    dungeonId: row.dungeonId,
    dungeonName: detail?.name?.trim() || row.dungeonName,
    difficulty: row.difficulty,
    difficultySlug: guidebookDungeonDifficultySlug(row.difficulty),
    bossLevel: bossLevelForDarkMastersTokenDungeon(detail, row.difficulty),
    tokenCount: row.tokenCount,
    iconId: row.iconId,
    itemName: row.itemName,
  }
}
