import type { SupabaseClient } from '@supabase/supabase-js'
import type { CommunityGuideSocialLink, CommunityGuideSocialPlatform } from './communityGuideSocials'
import { formatCommunityGuideError, type CommunityGuide } from './communityGuides'

export type CommunityGuideEditorCacheSocial = {
  platform: CommunityGuideSocialPlatform
  url: string
}

export type CommunityGuideEditorCache = {
  version: 1
  guideKey: string
  userId: string
  title: string
  body: string
  thumbnailUrl: string
  socialLinks: CommunityGuideEditorCacheSocial[]
  changelogNote: string
  /** Server `updated_at` this draft was based on (null for brand-new guides). */
  baseUpdatedAt: string | null
  /** True when local content differs from the last applied server snapshot. */
  dirty: boolean
  savedAt: number
}

const CACHE_PREFIX = 'community-guide-editor-v1:'
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 14 // 14 days

function storageKey(userId: string, guideKey: string): string {
  return `${CACHE_PREFIX}${userId}:${guideKey}`
}

export function communityGuideEditorGuideKey(guideId: string | undefined | null): string {
  return guideId?.trim() || 'new'
}

function isPlatform(value: unknown): value is CommunityGuideSocialPlatform {
  return (
    value === 'youtube' ||
    value === 'twitch' ||
    value === 'twitter' ||
    value === 'discord' ||
    value === 'kick' ||
    value === 'other'
  )
}

function normalizeSocialLinks(raw: unknown): CommunityGuideEditorCacheSocial[] {
  if (!Array.isArray(raw)) return []
  const out: CommunityGuideEditorCacheSocial[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    if (!isPlatform(row.platform) || typeof row.url !== 'string') continue
    out.push({ platform: row.platform, url: row.url })
  }
  return out
}

function parseCache(raw: string): CommunityGuideEditorCache | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (parsed.version !== 1) return null
    if (typeof parsed.guideKey !== 'string' || typeof parsed.userId !== 'string') return null
    if (typeof parsed.title !== 'string' || typeof parsed.body !== 'string') return null
    if (typeof parsed.thumbnailUrl !== 'string') return null
    if (typeof parsed.changelogNote !== 'string') return null
    if (typeof parsed.dirty !== 'boolean' || typeof parsed.savedAt !== 'number') return null
    if (parsed.baseUpdatedAt != null && typeof parsed.baseUpdatedAt !== 'string') return null
    if (Date.now() - parsed.savedAt > CACHE_TTL_MS) return null
    return {
      version: 1,
      guideKey: parsed.guideKey,
      userId: parsed.userId,
      title: parsed.title,
      body: parsed.body,
      thumbnailUrl: parsed.thumbnailUrl,
      socialLinks: normalizeSocialLinks(parsed.socialLinks),
      changelogNote: parsed.changelogNote,
      baseUpdatedAt: parsed.baseUpdatedAt ?? null,
      dirty: parsed.dirty,
      savedAt: parsed.savedAt,
    }
  } catch {
    return null
  }
}

export function readCommunityGuideEditorCache(
  userId: string,
  guideKey: string,
): CommunityGuideEditorCache | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(storageKey(userId, guideKey))
    if (!raw) return null
    const cache = parseCache(raw)
    if (!cache || cache.userId !== userId || cache.guideKey !== guideKey) {
      localStorage.removeItem(storageKey(userId, guideKey))
      return null
    }
    return cache
  } catch {
    return null
  }
}

export function writeCommunityGuideEditorCache(
  cache: Omit<CommunityGuideEditorCache, 'version' | 'savedAt'> & { savedAt?: number },
): void {
  if (typeof localStorage === 'undefined') return
  const payload: CommunityGuideEditorCache = {
    version: 1,
    guideKey: cache.guideKey,
    userId: cache.userId,
    title: cache.title,
    body: cache.body,
    thumbnailUrl: cache.thumbnailUrl,
    socialLinks: cache.socialLinks,
    changelogNote: cache.changelogNote,
    baseUpdatedAt: cache.baseUpdatedAt,
    dirty: cache.dirty,
    savedAt: cache.savedAt ?? Date.now(),
  }
  try {
    localStorage.setItem(storageKey(cache.userId, cache.guideKey), JSON.stringify(payload))
  } catch {
    // Quota / private mode — ignore; editor still works without cache.
  }
}

export function clearCommunityGuideEditorCache(userId: string, guideKey: string): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(storageKey(userId, guideKey))
  } catch {
    // ignore
  }
}

export function migrateCommunityGuideEditorCache(
  userId: string,
  fromKey: string,
  toKey: string,
): void {
  if (fromKey === toKey) return
  const existing = readCommunityGuideEditorCache(userId, fromKey)
  if (!existing) return
  writeCommunityGuideEditorCache({ ...existing, guideKey: toKey })
  clearCommunityGuideEditorCache(userId, fromKey)
}

export function socialLinksEqual(
  a: CommunityGuideEditorCacheSocial[],
  b: CommunityGuideSocialLink[],
): boolean {
  if (a.length !== b.length) return false
  return a.every((link, i) => link.platform === b[i]?.platform && link.url === b[i]?.url)
}

export function editorDraftMatchesGuide(
  draft: Pick<
    CommunityGuideEditorCache,
    'title' | 'body' | 'thumbnailUrl' | 'socialLinks'
  >,
  guide: Pick<CommunityGuide, 'title' | 'body' | 'thumbnail_url' | 'social_links'>,
): boolean {
  return (
    draft.title === guide.title &&
    draft.body === guide.body &&
    draft.thumbnailUrl === (guide.thumbnail_url ?? '') &&
    socialLinksEqual(draft.socialLinks, guide.social_links)
  )
}

/** Tiny poll — only `updated_at`, safe to call every ~10s. */
export async function peekCommunityGuideUpdatedAt(
  supabase: SupabaseClient,
  guideId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('community_guides')
    .select('updated_at')
    .eq('id', guideId)
    .maybeSingle()

  if (error) throw new Error(formatCommunityGuideError(error.message))
  const updatedAt = (data as { updated_at?: string } | null)?.updated_at
  return updatedAt ? String(updatedAt) : null
}

export const COMMUNITY_GUIDE_COLLAB_SYNC_MS = 10_000
