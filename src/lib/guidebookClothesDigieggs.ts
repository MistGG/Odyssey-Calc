import digieggSourcesJson from '../data/guidebookClothesDigieggSources.json'

export type GuidebookClothesDigieggEntry = {
  id: string
  name: string
  iconId: string
  rank: 1 | 2
  gearClass: 'Low Class' | 'High Class' | 'Super Class' | null
  typeName: string
}

type GuidebookClothesDigieggSourcesFile = {
  syncedAt: string
  explorerGear: GuidebookClothesDigieggEntry[]
  digitalGear: GuidebookClothesDigieggEntry[]
  skippedNoClass: GuidebookClothesDigieggEntry[]
}

const file = digieggSourcesJson as GuidebookClothesDigieggSourcesFile

export function guidebookClothesExplorerDigieggs(): readonly GuidebookClothesDigieggEntry[] {
  return file.explorerGear
}

export function guidebookClothesDigitalDigieggs(): readonly GuidebookClothesDigieggEntry[] {
  return file.digitalGear
}

export function guidebookClothesDigieggClassLabel(entry: GuidebookClothesDigieggEntry): string {
  return `Rank ${entry.rank} · ${entry.gearClass ?? 'Unknown class'}`
}

/** Short label for grid chips (strip trailing " DigiEgg"). */
export function guidebookClothesDigieggShortName(name: string): string {
  return name.replace(/\s+DigiEgg$/i, '').trim() || name
}
