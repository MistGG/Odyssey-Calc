/** Distinct palette for collaborator cursors (avoid near-duplicates). */
const COLLAB_CURSOR_PALETTE = [
  '#22d3ee', // cyan
  '#a78bfa', // violet
  '#f472b6', // pink
  '#fbbf24', // amber
  '#34d399', // emerald
  '#60a5fa', // blue
  '#fb7185', // rose
  '#c084fc', // purple
  '#2dd4bf', // teal
  '#f97316', // orange
] as const

function hashUserId(userId: string): number {
  let hash = 2166136261
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** Stable unique-ish color for a user across sessions. */
export function communityGuideCollabColor(userId: string): string {
  const id = userId.trim()
  if (!id) return COLLAB_CURSOR_PALETTE[0]
  return COLLAB_CURSOR_PALETTE[hashUserId(id) % COLLAB_CURSOR_PALETTE.length]!
}
