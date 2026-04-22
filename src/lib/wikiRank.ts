/**
 * Wiki rank tier labels (same `value` strings as main wiki rank filter / LF.rank).
 * Order matches weak → strong for index mapping from API `rank` (1-based).
 */
export const WIKI_RANK_LABELS = [
  'A',
  'A+',
  'S',
  'S+',
  'SS',
  'SS+',
  'SSS',
  'SSS+',
  'U',
  'U+',
] as const

export type WikiRankLabel = (typeof WIKI_RANK_LABELS)[number]

/** Map API numeric rank (1-based tier index) to wiki label; unknown → undefined. */
export function wikiRankLabelFromNumber(rank: number): WikiRankLabel | undefined {
  if (!Number.isFinite(rank) || rank <= 0) return undefined
  const i = Math.floor(rank) - 1
  if (i < 0 || i >= WIKI_RANK_LABELS.length) return undefined
  return WIKI_RANK_LABELS[i]
}

/** Map wiki filter value back to numeric rank for comparisons if needed. */
export function wikiRankNumberFromLabel(label: string): number | undefined {
  const i = (WIKI_RANK_LABELS as readonly string[]).indexOf(label.trim())
  if (i < 0) return undefined
  return i + 1
}
