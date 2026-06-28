export type CommunityGuideSocialPlatform =
  | 'youtube'
  | 'twitch'
  | 'twitter'
  | 'discord'
  | 'kick'
  | 'other'

export type CommunityGuideSocialLink = {
  platform: CommunityGuideSocialPlatform
  url: string
}

export const COMMUNITY_GUIDE_SOCIAL_PLATFORMS: {
  id: CommunityGuideSocialPlatform
  label: string
}[] = [
  { id: 'youtube', label: 'YouTube' },
  { id: 'twitch', label: 'Twitch' },
  { id: 'twitter', label: 'X / Twitter' },
  { id: 'discord', label: 'Discord' },
  { id: 'kick', label: 'Kick' },
  { id: 'other', label: 'Other link' },
]

const PLATFORM_HOSTS: Record<CommunityGuideSocialPlatform, RegExp[]> = {
  youtube: [/^(www\.)?youtube\.com$/i, /^(www\.)?youtu\.be$/i],
  twitch: [/^(www\.)?twitch\.tv$/i],
  twitter: [/^(www\.)?twitter\.com$/i, /^(www\.)?x\.com$/i],
  discord: [/^(www\.)?discord\.gg$/i, /^(www\.)?discord\.com$/i],
  kick: [/^(www\.)?kick\.com$/i],
  other: [],
}

export function communityGuideSocialLabel(platform: CommunityGuideSocialPlatform): string {
  return COMMUNITY_GUIDE_SOCIAL_PLATFORMS.find((p) => p.id === platform)?.label ?? 'Link'
}

function parsePlatform(value: unknown): CommunityGuideSocialPlatform | null {
  if (typeof value !== 'string') return null
  const id = value.trim().toLowerCase()
  return COMMUNITY_GUIDE_SOCIAL_PLATFORMS.some((p) => p.id === id) ? (id as CommunityGuideSocialPlatform) : null
}

function hostMatchesPlatform(hostname: string, platform: CommunityGuideSocialPlatform): boolean {
  if (platform === 'other') return true
  const patterns = PLATFORM_HOSTS[platform]
  return patterns.some((re) => re.test(hostname))
}

export function normalizeCommunityGuideSocialUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'https:') return null
    return parsed.toString().slice(0, 2048)
  } catch {
    return null
  }
}

export function normalizeCommunityGuideSocialLinks(raw: unknown): CommunityGuideSocialLink[] {
  if (!Array.isArray(raw)) return []
  const out: CommunityGuideSocialLink[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const platform = parsePlatform((item as { platform?: unknown }).platform)
    const url = normalizeCommunityGuideSocialUrl(String((item as { url?: unknown }).url ?? ''))
    if (!platform || !url) continue
    try {
      const hostname = new URL(url).hostname.replace(/^www\./i, '')
      if (!hostMatchesPlatform(hostname, platform)) continue
    } catch {
      continue
    }
    out.push({ platform, url })
  }
  return out.slice(0, 8)
}

export function parseCommunityGuideSocialInputs(
  entries: { platform: string; url: string }[],
): CommunityGuideSocialLink[] {
  const out: CommunityGuideSocialLink[] = []
  for (const entry of entries) {
    const platform = parsePlatform(entry.platform)
    const url = normalizeCommunityGuideSocialUrl(entry.url)
    if (!platform || !url) continue
    try {
      const hostname = new URL(url).hostname.replace(/^www\./i, '')
      if (!hostMatchesPlatform(hostname, platform)) {
        throw new Error(
          `${communityGuideSocialLabel(platform)} links must use a matching ${communityGuideSocialLabel(platform)} URL.`,
        )
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('links must use')) throw e
      throw new Error('Social links must be valid https URLs.')
    }
    out.push({ platform, url })
  }
  if (out.length > 8) {
    throw new Error('You can add up to 8 social links.')
  }
  return out
}

export function stripOptionalCommunityGuideFields(
  row: Record<string, unknown>,
  message: string,
): boolean {
  const lower = message.toLowerCase()
  let stripped = false
  if (lower.includes('social_links') && 'social_links' in row) {
    delete row.social_links
    stripped = true
  }
  if (lower.includes('thumbnail_url') && 'thumbnail_url' in row) {
    delete row.thumbnail_url
    stripped = true
  }
  return stripped
}
