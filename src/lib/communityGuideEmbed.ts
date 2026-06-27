/** Embed tokens stored in community guide markdown bodies. */

export type CommunityGuideEmbedKind = 'item' | 'quest' | 'dungeon'

export type CommunityGuideEmbed = {
  kind: CommunityGuideEmbedKind
  id: string
  label?: string
  /** Dungeon embeds only — defaults to Normal when omitted. */
  difficulty?: string
}

const INLINE_EMBED_RE = /\[\[(item|quest):([^|\]]+)(?:\|([^\]]+))?\]\]/g
const DUNGEON_BLOCK_RE = /^\[\[dungeon:([^|\]]+)(?:\|([^|\]]+))?(?:\|([^\]]+))?\]\]$/

export function communityGuideEmbedToken(embed: CommunityGuideEmbed): string {
  if (embed.kind === 'dungeon') {
    const label = embed.label?.trim() || embed.id
    const difficulty = embed.difficulty?.trim() || 'Normal'
    return `[[dungeon:${embed.id}|${label}|${difficulty}]]`
  }
  const label = embed.label?.trim()
  return label ? `[[${embed.kind}:${embed.id}|${label}]]` : `[[${embed.kind}:${embed.id}]]`
}

export function parseDungeonBlockEmbed(paragraph: string): CommunityGuideEmbed | null {
  const match = paragraph.trim().match(DUNGEON_BLOCK_RE)
  if (!match) return null
  return {
    kind: 'dungeon',
    id: match[1]!.trim(),
    label: match[2]?.trim() || undefined,
    difficulty: match[3]?.trim() || 'Normal',
  }
}

export function parseCommunityGuideEmbeds(body: string): CommunityGuideEmbed[] {
  const found: CommunityGuideEmbed[] = []
  let match: RegExpExecArray | null
  const re = new RegExp(INLINE_EMBED_RE.source, 'g')
  while ((match = re.exec(body)) !== null) {
    found.push({
      kind: match[1] as 'item' | 'quest',
      id: match[2]!.trim(),
      label: match[3]?.trim() || undefined,
    })
  }
  for (const para of body.split(/\n{2,}/)) {
    const dungeon = parseDungeonBlockEmbed(para)
    if (dungeon) found.push(dungeon)
  }
  return found
}

export function slugifyCommunityGuideTitle(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return base || 'guide'
}

export { INLINE_EMBED_RE }
