export type DungeonDrpEntry = {
  dungeonName: string
  difficulty: 'Normal' | 'Hard'
  drp: number
}

/** Dungeon Reward Points (DRP) score per dungeon instance. */
const DUNGEON_DRP_RAW: DungeonDrpEntry[] = [
  { dungeonName: "Agumon's Madness", difficulty: 'Normal', drp: 5 },
  { dungeonName: "Shellmon's Place", difficulty: 'Normal', drp: 7 },
  { dungeonName: "Kuwagamon's Terror", difficulty: 'Normal', drp: 10 },
  { dungeonName: 'Meramon Attacks', difficulty: 'Normal', drp: 15 },
  { dungeonName: "Seadramon's Confusion", difficulty: 'Normal', drp: 15 },
  { dungeonName: "Ogremon's Rampage", difficulty: 'Normal', drp: 15 },
  { dungeonName: 'Bound Champion', difficulty: 'Normal', drp: 15 },
  { dungeonName: 'Guardian of the Ruins', difficulty: 'Normal', drp: 15 },
  { dungeonName: 'The Rise of the Fallen Angel', difficulty: 'Normal', drp: 18 },
  { dungeonName: 'Gazimon Panic', difficulty: 'Normal', drp: 18 },
  { dungeonName: 'Love Serenade', difficulty: 'Normal', drp: 20 },
  { dungeonName: 'The First Trial', difficulty: 'Normal', drp: 20 },
  { dungeonName: 'Infernal Bone Demon', difficulty: 'Normal', drp: 20 },
  { dungeonName: "Nanomon's Hideout", difficulty: 'Normal', drp: 20 },
  { dungeonName: "Dokugumon's Barricade", difficulty: 'Normal', drp: 20 },
  { dungeonName: "Mammothmon's Stampede", difficulty: 'Normal', drp: 20 },
  { dungeonName: 'Hell in Tokyo Tower', difficulty: 'Normal', drp: 20 },
  { dungeonName: 'Gesomon in Real World', difficulty: 'Normal', drp: 20 },
  { dungeonName: "Raremon's Assault", difficulty: 'Normal', drp: 20 },
  { dungeonName: 'Night Raid', difficulty: 'Normal', drp: 20 },
  { dungeonName: 'Night Raid in Minato', difficulty: 'Normal', drp: 20 },
  { dungeonName: 'Stage of Phantom', difficulty: 'Normal', drp: 20 },
  { dungeonName: 'The Dark Roar', difficulty: 'Normal', drp: 20 },
  { dungeonName: 'The Undead King', difficulty: 'Normal', drp: 30 },
  { dungeonName: 'The Undying', difficulty: 'Normal', drp: 30 },
  { dungeonName: "Tailmon's Choice", difficulty: 'Normal', drp: 30 },
  { dungeonName: 'Server Continent Canyon', difficulty: 'Normal', drp: 100 },
  { dungeonName: 'Lord of the Deep Forest', difficulty: 'Normal', drp: 500 },
  { dungeonName: 'The Golden Seadragon', difficulty: 'Normal', drp: 600 },
  { dungeonName: 'Disunity', difficulty: 'Normal', drp: 900 },
  { dungeonName: 'Metallic Avenger', difficulty: 'Normal', drp: 900 },
  { dungeonName: 'The Puppet Master', difficulty: 'Normal', drp: 1200 },
  { dungeonName: 'Twins of Destruction', difficulty: 'Normal', drp: 3300 },
  { dungeonName: 'Fullmetal Tyrant', difficulty: 'Normal', drp: 3300 },
  { dungeonName: 'Evil Plushie', difficulty: 'Normal', drp: 3500 },
  { dungeonName: 'Army of Steel', difficulty: 'Normal', drp: 5000 },
  { dungeonName: 'Dragon Dimension', difficulty: 'Normal', drp: 6000 },
  { dungeonName: 'Disunity', difficulty: 'Hard', drp: 2000 },
  { dungeonName: 'Metallic Avenger', difficulty: 'Hard', drp: 2000 },
  { dungeonName: 'The Puppet Master', difficulty: 'Hard', drp: 2500 },
  { dungeonName: 'Lord of the Deep Forest', difficulty: 'Hard', drp: 6500 },
]

/** Story difficulty always awards 1 DRP. */
export const STORY_MODE_DRP = 1

function normalizeDungeonKey(name: string): string {
  return name.trim().toLowerCase()
}

function normalizeDifficultyKey(difficulty: string): string {
  return difficulty.trim().toLowerCase()
}

const DUNGEON_DRP_LOOKUP = (() => {
  const map = new Map<string, Map<string, number>>()
  for (const row of DUNGEON_DRP_RAW) {
    const dungeonKey = normalizeDungeonKey(row.dungeonName)
    const diffKey = normalizeDifficultyKey(row.difficulty)
    let byDiff = map.get(dungeonKey)
    if (!byDiff) {
      byDiff = new Map()
      map.set(dungeonKey, byDiff)
    }
    byDiff.set(diffKey, row.drp)
  }
  return map
})()

export function lookupDungeonDrpScore(dungeonName: string, difficulty: string): number | null {
  const byDiff = DUNGEON_DRP_LOOKUP.get(normalizeDungeonKey(dungeonName))
  if (!byDiff) return null
  const score = byDiff.get(normalizeDifficultyKey(difficulty))
  return score ?? null
}

export function dungeonDrpScoresForDifficulties(
  dungeonName: string,
  difficulties: string[],
): { difficulty: string; drp: number }[] {
  const out: { difficulty: string; drp: number }[] = []
  for (const difficulty of difficulties) {
    const drp = lookupDungeonDrpScore(dungeonName, difficulty)
    if (drp != null) out.push({ difficulty, drp })
  }
  return out.sort((a, b) => a.drp - b.drp)
}

export function formatDungeonDrpCell(dungeonName: string, difficulties: string[]): string {
  const scores = dungeonDrpScoresForDifficulties(dungeonName, difficulties)
  if (!scores.length) return '—'
  if (scores.length === 1) return scores[0]!.drp.toLocaleString('en-US')
  return scores
    .map(({ difficulty, drp }) => `${difficulty}: ${drp.toLocaleString('en-US')}`)
    .join(' · ')
}

/** Highest DRP tier for list sorting (Story = 1). Unknown tiers sort last. */
export function maxDungeonDrpSortScore(
  dungeonName: string,
  difficulties: string[],
): number {
  let max = -1
  for (const difficulty of difficulties) {
    const key = normalizeDifficultyKey(difficulty)
    if (key === 'story') {
      max = Math.max(max, STORY_MODE_DRP)
      continue
    }
    const drp = lookupDungeonDrpScore(dungeonName, difficulty)
    if (drp != null) max = Math.max(max, drp)
  }
  return max
}

export function compareDungeonsByDrpDesc(
  a: { name: string; difficulties?: string[] | unknown[] },
  b: { name: string; difficulties?: string[] | unknown[] },
): number {
  const diffsA = (a.difficulties ?? []).filter((d): d is string => typeof d === 'string')
  const diffsB = (b.difficulties ?? []).filter((d): d is string => typeof d === 'string')
  const scoreA = maxDungeonDrpSortScore(a.name, diffsA)
  const scoreB = maxDungeonDrpSortScore(b.name, diffsB)
  if (scoreB !== scoreA) return scoreB - scoreA
  return a.name.localeCompare(b.name)
}
