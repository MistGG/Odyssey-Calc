import { fetchAllWikiDungeons } from '../api/dungeonService'
import type { WikiDungeonListItem } from '../types/wikiApi'

const STORY = 'story'

/** EventStream / upload tier ids: 2 Normal, 3 Hard. Story = 1 (not uploadable). */
export function wikiDifficultyToTierId(name: string): number | null {
  const n = name.trim().toLowerCase()
  if (n === 'story') return 1
  if (n === 'normal') return 2
  if (n === 'hard') return 3
  return null
}

export function isUploadableWikiDifficulty(name: string): boolean {
  const id = wikiDifficultyToTierId(name)
  return id != null && id >= 2
}

export function nonStoryDifficulties(dungeon: WikiDungeonListItem): string[] {
  const list = dungeon.difficulties ?? []
  return list
    .filter((d): d is string => typeof d === 'string')
    .filter((d) => d.trim().toLowerCase() !== STORY)
}

export function dungeonSelectOptions(dungeons: WikiDungeonListItem[]) {
  return [...dungeons]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((d) => ({ dungeonId: d.id, dungeonName: d.name }))
}

export function difficultySelectOptions(
  dungeons: WikiDungeonListItem[],
  dungeonId: string,
): { difficultyId: number; label: string }[] {
  const dungeon = dungeons.find((d) => d.id === dungeonId)
  if (!dungeon) return []
  const seen = new Map<number, string>()
  for (const raw of nonStoryDifficulties(dungeon)) {
    const id = wikiDifficultyToTierId(raw)
    if (id == null || id < 2) continue
    seen.set(id, raw.trim())
  }
  return [...seen.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([difficultyId, label]) => ({ difficultyId, label }))
}

let cachedDungeons: WikiDungeonListItem[] | null = null
let loadPromise: Promise<WikiDungeonListItem[]> | null = null

export function loadWikiDungeonsForMeter(): Promise<WikiDungeonListItem[]> {
  if (cachedDungeons) return Promise.resolve(cachedDungeons)
  if (loadPromise) return loadPromise
  loadPromise = fetchAllWikiDungeons()
    .then((data) => {
      cachedDungeons = data
      return data
    })
    .catch((e) => {
      loadPromise = null
      throw e
    })
  return loadPromise
}

export function getCachedWikiDungeons(): WikiDungeonListItem[] {
  return cachedDungeons ?? []
}
