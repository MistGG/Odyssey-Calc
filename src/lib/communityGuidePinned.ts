/** Built-in community guides pinned above user-authored content. */

export type PinnedCommunityGuide = {
  slug: string
  title: string
  description: string
  authorName: string
}

export const PINNED_COMMUNITY_GUIDES: readonly PinnedCommunityGuide[] = [
  {
    slug: 'gear-stats',
    title: 'Gear Stats',
    description:
      'Roll ranges and slot limits for ring, necklace, earring, and bracelet data by gear tier.',
    authorName: 'Odyssey Calc',
  },
]

export function pinnedCommunityGuide(slug: string): PinnedCommunityGuide | undefined {
  return PINNED_COMMUNITY_GUIDES.find((guide) => guide.slug === slug)
}

export function isPinnedCommunityGuideSlug(slug: string): boolean {
  return PINNED_COMMUNITY_GUIDES.some((guide) => guide.slug === slug)
}
