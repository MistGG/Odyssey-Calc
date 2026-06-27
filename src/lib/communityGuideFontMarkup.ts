export const COMMUNITY_GUIDE_FONT_GROUPS = ['Standard', 'Digital', 'Regal', 'Mono'] as const

export type CommunityGuideFontGroup = (typeof COMMUNITY_GUIDE_FONT_GROUPS)[number]

export const COMMUNITY_GUIDE_FONT_FAMILIES = [
  { id: '', label: 'Default', group: 'Standard' as const },
  { id: 'display', label: 'Display', group: 'Standard' as const },
  { id: 'orbitron', label: 'Orbitron', group: 'Digital' as const },
  { id: 'rajdhani', label: 'Rajdhani', group: 'Digital' as const },
  { id: 'oxanium', label: 'Oxanium', group: 'Digital' as const },
  { id: 'cinzel', label: 'Cinzel', group: 'Regal' as const },
  { id: 'cormorant', label: 'Cormorant', group: 'Regal' as const },
  { id: 'mono', label: 'Mono', group: 'Mono' as const },
  { id: 'tech-mono', label: 'Tech Mono', group: 'Mono' as const },
] as const

export const COMMUNITY_GUIDE_FONT_SIZES = [
  { id: '', label: 'Default' },
  { id: 'sm', label: 'Small' },
  { id: 'lg', label: 'Large' },
  { id: 'xl', label: 'Extra large' },
] as const

export type CommunityGuideFontFamily = (typeof COMMUNITY_GUIDE_FONT_FAMILIES)[number]['id']
export type CommunityGuideFontSize = (typeof COMMUNITY_GUIDE_FONT_SIZES)[number]['id']

const VALID_FONT_FAMILY_IDS = new Set(
  COMMUNITY_GUIDE_FONT_FAMILIES.map((f) => f.id).filter(Boolean),
)

const VALID_FONT_SIZE_IDS = new Set(
  COMMUNITY_GUIDE_FONT_SIZES.map((s) => s.id).filter(Boolean),
)

const ALLOWED_FONT_FAMILY_CLASSES = new Set(
  [...VALID_FONT_FAMILY_IDS].map((id) => `cg-font--${id}`),
)

export function communityGuideFontSpanOpen(family: CommunityGuideFontFamily, size: CommunityGuideFontSize): string {
  const safeFamily = family && VALID_FONT_FAMILY_IDS.has(family) ? family : ''
  const safeSize = size && VALID_FONT_SIZE_IDS.has(size) ? size : ''
  const classes = ['cg-font']
  if (safeFamily) classes.push(`cg-font--${safeFamily}`)
  if (safeSize) classes.push(`cg-font--size-${safeSize}`)
  if (classes.length === 1) return ''
  return `<span class="${classes.join(' ')}">`
}

export function communityGuideFontSpanClose(family: CommunityGuideFontFamily, size: CommunityGuideFontSize): string {
  return communityGuideFontSpanOpen(family, size) ? '</span>' : ''
}

export function parseCommunityGuideFontSpanClasses(classAttr: string): string {
  const parts = classAttr.trim().split(/\s+/).filter(Boolean)
  return parts
    .filter(
      (c) =>
        c === 'cg-font' ||
        ALLOWED_FONT_FAMILY_CLASSES.has(c) ||
        /^cg-font--size-(?:sm|lg|xl)$/.test(c),
    )
    .join(' ')
}
