import type { WikiMonsterDrop, WikiMonsterLocation } from '../types/wikiApi'

export function formatMonsterPenName(penName?: string): string | undefined {
  if (!penName?.trim()) return undefined
  return penName.trim()
}

export function dedupeMonsterLocations(locations: WikiMonsterLocation[]): WikiMonsterLocation[] {
  const seen = new Set<string>()
  const out: WikiMonsterLocation[] = []
  for (const loc of locations) {
    const key = loc.map_id || loc.map_name
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(loc)
  }
  return out
}

export function groupMonsterDropsByType(
  drops: WikiMonsterDrop[],
): { type: string; label: string; items: WikiMonsterDrop[] }[] {
  const groups = new Map<string, WikiMonsterDrop[]>()
  for (const drop of drops) {
    const type = drop.drop_type?.trim() || 'other'
    const bucket = groups.get(type) ?? []
    bucket.push(drop)
    groups.set(type, bucket)
  }
  return [...groups.entries()].map(([type, items]) => ({
    type,
    label: `${type.replace(/_/g, ' ')} drops`.toUpperCase(),
    items,
  }))
}
