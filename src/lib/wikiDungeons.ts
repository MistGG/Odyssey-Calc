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

const DIFFICULTY_SORT = ['story', 'normal', 'hard'] as const

/** Story → Normal → Hard labels from a dungeon list row. */
export function dungeonWikiDifficultyLabels(dungeon: WikiDungeonListItem): string[] {
  const list = dungeon.difficulties ?? []
  const seen = new Set<string>()
  const labels: string[] = []
  for (const raw of list) {
    if (typeof raw !== 'string') continue
    const label = raw.trim()
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

export function defaultDungeonWikiDifficulty(dungeon: WikiDungeonListItem): string {
  const opts = dungeonWikiDifficultyLabels(dungeon)
  return opts.find((d) => d.toLowerCase() === 'normal') ?? opts[0] ?? 'Normal'
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

/** Display name for meter parse rows when DB/payload omitted `dungeon_name`. */
export function resolveMeterDungeonDisplayName(
  dungeonId: string | null | undefined,
  dungeons: WikiDungeonListItem[],
  ...storedNames: (string | null | undefined)[]
): string {
  for (const name of storedNames) {
    const trimmed = name?.trim()
    if (trimmed) return trimmed
  }
  const id = dungeonId?.trim()
  if (!id) return 'Dungeon'
  const wiki = dungeons.find((d) => d.id === id)
  return wiki?.name?.trim() || id
}
