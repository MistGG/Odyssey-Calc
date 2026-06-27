/** Allowed image URL schemes for community guide embeds. */
export function isAllowedCommunityGuideImageUrl(url: string): boolean {
  const trimmed = url.trim()
  if (!trimmed) return false
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

export const COMMUNITY_GUIDE_IMAGE_MD_RE = /^!\[([^\]]*)\]\(([^)]+)\)$/

export function parseCommunityGuideImageMarkdown(line: string): { alt: string; url: string } | null {
  const match = line.trim().match(COMMUNITY_GUIDE_IMAGE_MD_RE)
  if (!match) return null
  return { alt: match[1] ?? '', url: match[2]!.trim() }
}
