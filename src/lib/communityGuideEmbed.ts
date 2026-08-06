/** Embed tokens stored in community guide markdown bodies. */

import { isAllowedCommunityGuideImageUrl } from './communityGuideImageUrl'

export type CommunityGuideEmbedKind = 'item' | 'quest' | 'digimon' | 'dungeon'

export type CommunityGuideEmbed = {
  kind: CommunityGuideEmbedKind
  id: string
  label?: string
  /** Dungeon embeds only — defaults to Normal when omitted. */
  difficulty?: string
  /** Dungeon embeds only — optional location / map image URL. */
  imageUrl?: string
}

const INLINE_EMBED_RE = /\[\[(item|quest|digimon):([^|\]]+)(?:\|([^\]]+))?\]\]/g
/** `[[dungeon:id|label|difficulty]]` or `[[dungeon:id|label|difficulty|https://...]]` */
const DUNGEON_BLOCK_RE =
  /^\[\[dungeon:([^|\]]+)(?:\|([^|\]]+))?(?:\|([^|\]]+))?(?:\|(https?:\/\/[^\]]+))?\]\]$/i

export function communityGuideEmbedToken(embed: CommunityGuideEmbed): string {
  if (embed.kind === 'dungeon') {
    const label = embed.label?.trim() || embed.id
    const difficulty = embed.difficulty?.trim() || 'Normal'
    const imageUrl = embed.imageUrl?.trim()
    if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
      return `[[dungeon:${embed.id}|${label}|${difficulty}|${imageUrl}]]`
    }
    return `[[dungeon:${embed.id}|${label}|${difficulty}]]`
  }
  const label = embed.label?.trim()
  return label ? `[[${embed.kind}:${embed.id}|${label}]]` : `[[${embed.kind}:${embed.id}]]`
}

export function parseDungeonBlockEmbed(paragraph: string): CommunityGuideEmbed | null {
  const match = paragraph.trim().match(DUNGEON_BLOCK_RE)
  if (!match) return null
  const imageUrl = match[4]?.trim()
  return {
    kind: 'dungeon',
    id: match[1]!.trim(),
    label: match[2]?.trim() || undefined,
    difficulty: match[3]?.trim() || 'Normal',
    imageUrl: imageUrl && /^https?:\/\//i.test(imageUrl) ? imageUrl : undefined,
  }
}

export function parseCommunityGuideEmbeds(body: string): CommunityGuideEmbed[] {
  const found: CommunityGuideEmbed[] = []
  let match: RegExpExecArray | null
  const re = new RegExp(INLINE_EMBED_RE.source, 'g')
  while ((match = re.exec(body)) !== null) {
    found.push({
      kind: match[1] as 'item' | 'quest' | 'digimon',
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

/** Collect http(s) image URLs stored on dungeon block embeds. */
export function collectCommunityGuideDungeonEmbedImageUrls(body: string): string[] {
  const urls: string[] = []
  const seen = new Set<string>()
  for (const para of body.split(/\n{2,}/)) {
    const dungeon = parseDungeonBlockEmbed(para)
    const url = dungeon?.imageUrl?.trim()
    if (!url || seen.has(url)) continue
    if (!isAllowedCommunityGuideImageUrl(url)) continue
    seen.add(url)
    urls.push(url)
  }
  return urls
}

/** Rewrite dungeon-embed image URLs after ingest (durable CDN paths). */
export function rewriteCommunityGuideDungeonEmbedImageUrls(
  body: string,
  replacements: Map<string, string>,
): string {
  if (!replacements.size) return body
  return body.replace(
    /\[\[dungeon:([^|\]]+)(?:\|([^|\]]+))?(?:\|([^|\]]+))?(?:\|(https?:\/\/[^\]]+))?\]\]/gi,
    (full, id, label, difficulty, imageUrl) => {
      const url = typeof imageUrl === 'string' ? imageUrl.trim() : ''
      if (!url) return full
      const next = replacements.get(url)
      if (!next) return full
      return communityGuideEmbedToken({
        kind: 'dungeon',
        id: String(id).trim(),
        label: typeof label === 'string' ? label.trim() || undefined : undefined,
        difficulty: typeof difficulty === 'string' ? difficulty.trim() || 'Normal' : 'Normal',
        imageUrl: next,
      })
    },
  )
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
