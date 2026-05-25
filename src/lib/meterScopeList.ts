import { difficultySelectOptions } from './wikiDungeons'
import type { WikiDungeonListItem } from '../types/wikiApi'

export type MeterUploadScope = {
  dungeonId: string
  dungeonName: string
  difficultyId: number
  difficultyLabel: string
}

export function allMeterUploadScopes(dungeons: WikiDungeonListItem[]): MeterUploadScope[] {
  const out: MeterUploadScope[] = []
  for (const dungeon of dungeons) {
    for (const diff of difficultySelectOptions(dungeons, dungeon.id)) {
      out.push({
        dungeonId: dungeon.id,
        dungeonName: dungeon.name,
        difficultyId: diff.difficultyId,
        difficultyLabel: diff.label,
      })
    }
  }
  return out
}
