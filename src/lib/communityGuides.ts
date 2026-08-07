import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DEFAULT_METER_SHARE_PUBLIC_ORIGIN,
  resolveAppSiteOrigin,
} from '../config/site'
import { isAllowedCommunityGuideImageUrl } from './communityGuideImageUrl'
import {
  attachCommunityGuideImagesToGuide,
  deleteCommunityGuideImagesForGuide,
  persistCommunityGuideImageUrls,
} from './communityGuideImages'
import { slugifyCommunityGuideTitle } from './communityGuideEmbed'
import {
  normalizeCommunityGuideSocialLinks,
  parseCommunityGuideSocialInputs,
  stripOptionalCommunityGuideFields,
  type CommunityGuideSocialLink,
} from './communityGuideSocials'
export type CommunityGuide = {
  id: string
  author_id: string
  author_name: string
  title: string
  slug: string
  body: string
  thumbnail_url: string | null
  heart_count: number
  view_count: number
  status: 'draft' | 'published'
  social_links: CommunityGuideSocialLink[]
  /** Published guides only: WIP stored separately so the live page stays unchanged. */
  has_unpublished_draft: boolean
  draft_title: string | null
  draft_body: string | null
  draft_thumbnail_url: string | null
  draft_social_links: CommunityGuideSocialLink[] | null
  created_at: string
  updated_at: string
}

/** Content the editor should show (unpublished WIP when present, otherwise live fields). */
export type CommunityGuideEditorContent = {
  title: string
  body: string
  thumbnail_url: string | null
  social_links: CommunityGuideSocialLink[]
}

export function resolveCommunityGuideEditorContent(
  guide: Pick<
    CommunityGuide,
    | 'status'
    | 'has_unpublished_draft'
    | 'title'
    | 'body'
    | 'thumbnail_url'
    | 'social_links'
    | 'draft_title'
    | 'draft_body'
    | 'draft_thumbnail_url'
    | 'draft_social_links'
  >,
): CommunityGuideEditorContent {
  if (guide.status === 'published' && guide.has_unpublished_draft) {
    return {
      title: guide.draft_title ?? guide.title,
      body: guide.draft_body ?? guide.body,
      thumbnail_url: guide.draft_thumbnail_url ?? guide.thumbnail_url,
      social_links: guide.draft_social_links ?? guide.social_links,
    }
  }
  return {
    title: guide.title,
    body: guide.body,
    thumbnail_url: guide.thumbnail_url,
    social_links: guide.social_links,
  }
}

/** Live published fields only — public page / editor “view live” preview. */
export function resolveCommunityGuideLiveContent(
  guide: Pick<CommunityGuide, 'title' | 'body' | 'thumbnail_url' | 'social_links'>,
): CommunityGuideEditorContent {
  return {
    title: guide.title,
    body: guide.body,
    thumbnail_url: guide.thumbnail_url,
    social_links: guide.social_links,
  }
}

/** Card/list fields only — excludes heavy `body` text. */
export type CommunityGuideListItem = Pick<
  CommunityGuide,
  | 'id'
  | 'author_id'
  | 'author_name'
  | 'title'
  | 'slug'
  | 'thumbnail_url'
  | 'heart_count'
  | 'view_count'
  | 'updated_at'
  | 'status'
>

const COMMUNITY_GUIDE_LIST_SELECT_CORE =
  'id, author_id, author_name, title, slug, heart_count, updated_at'

const COMMUNITY_GUIDE_LIST_SELECT =
  `${COMMUNITY_GUIDE_LIST_SELECT_CORE}, thumbnail_url, view_count, status`

function isMissingCommunityGuideColumnError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('42703') ||
    lower.includes('thumbnail_url') ||
    lower.includes('view_count') ||
    lower.includes('social_links') ||
    lower.includes('has_unpublished_draft') ||
    lower.includes('draft_title') ||
    lower.includes('draft_body') ||
    lower.includes('draft_thumbnail_url') ||
    lower.includes('draft_social_links') ||
    (lower.includes('column') && lower.includes('community_guides'))
  )
}

function isMissingCommunityGuideDraftColumnError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('has_unpublished_draft') ||
    lower.includes('draft_title') ||
    lower.includes('draft_body') ||
    lower.includes('draft_thumbnail_url') ||
    lower.includes('draft_social_links')
  )
}

function isMissingCommunityGuideViewRpcError(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('increment_community_guide_view') || lower.includes('42883')
}

function normalizeCommunityGuideListItem(row: Record<string, unknown>): CommunityGuideListItem {
  return {
    id: String(row.id),
    author_id: String(row.author_id),
    author_name: String(row.author_name),
    title: String(row.title),
    slug: String(row.slug),
    thumbnail_url: (row.thumbnail_url as string | null | undefined) ?? null,
    heart_count: Number(row.heart_count) || 0,
    view_count: Number(row.view_count) || 0,
    updated_at: String(row.updated_at),
    status: row.status === 'draft' ? 'draft' : 'published',
  }
}

function normalizeCommunityGuide(row: Record<string, unknown>): CommunityGuide {
  const hasDraftColumn = Object.prototype.hasOwnProperty.call(row, 'has_unpublished_draft')
  const hasUnpublishedDraft = hasDraftColumn
    ? Boolean(row.has_unpublished_draft)
    : false
  const draftSocialRaw = row.draft_social_links
  return {
    id: String(row.id),
    author_id: String(row.author_id),
    author_name: String(row.author_name),
    title: String(row.title),
    slug: String(row.slug),
    body: String(row.body ?? ''),
    thumbnail_url: (row.thumbnail_url as string | null | undefined) ?? null,
    heart_count: Number(row.heart_count) || 0,
    view_count: Number(row.view_count) || 0,
    status: row.status === 'draft' ? 'draft' : 'published',
    social_links: normalizeCommunityGuideSocialLinks(row.social_links),
    has_unpublished_draft: hasUnpublishedDraft,
    draft_title:
      row.draft_title === null || row.draft_title === undefined
        ? null
        : String(row.draft_title),
    draft_body:
      row.draft_body === null || row.draft_body === undefined ? null : String(row.draft_body),
    draft_thumbnail_url:
      row.draft_thumbnail_url === null || row.draft_thumbnail_url === undefined
        ? null
        : String(row.draft_thumbnail_url),
    draft_social_links:
      draftSocialRaw === null || draftSocialRaw === undefined
        ? null
        : normalizeCommunityGuideSocialLinks(draftSocialRaw),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

export type CommunityGuideSort = 'favorites' | 'views' | 'alphabetical' | 'latest'

export const COMMUNITY_GUIDE_SORT_OPTIONS: { id: CommunityGuideSort; label: string }[] = [
  { id: 'favorites', label: 'Favorites' },
  { id: 'views', label: 'Views' },
  { id: 'alphabetical', label: 'A–Z' },
  { id: 'latest', label: 'Latest' },
]

export function sortCommunityGuides(
  guides: CommunityGuideListItem[],
  sort: CommunityGuideSort,
): CommunityGuideListItem[] {
  const copy = [...guides]
  switch (sort) {
    case 'favorites':
      return copy.sort(
        (a, b) =>
          b.heart_count - a.heart_count ||
          b.updated_at.localeCompare(a.updated_at) ||
          a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
      )
    case 'views':
      return copy.sort(
        (a, b) =>
          b.view_count - a.view_count ||
          b.updated_at.localeCompare(a.updated_at) ||
          a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
      )
    case 'alphabetical':
      return copy.sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
      )
    case 'latest':
      return copy.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    default:
      return copy
  }
}

export function formatCommunityGuideViewCount(count: number): string {
  return count.toLocaleString()
}

export function formatCommunityGuideError(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('forbidden') || lower.includes('"code":"403"')) {
    return 'Could not reach the guides service. Refresh the page and try again.'
  }
  if (
    lower.includes('42p01') ||
    (lower.includes('community_guides') &&
      lower.includes('relation') &&
      lower.includes('does not exist'))
  ) {
    return 'Community guides are not available yet — the database migration may still be pending.'
  }
  return message
}

/** Crawlable share origin (Discord OG). Falls back to the production Worker domain. */
export function resolveCommunityGuideShareOrigin(): string {
  const fromEnv = (import.meta.env.VITE_METER_SHARE_PUBLIC_ORIGIN as string | undefined)?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  return DEFAULT_METER_SHARE_PUBLIC_ORIGIN
}

/** In-app HashRouter URL for a published guide. */
export function communityGuideAppUrl(slug: string, sectionId?: string): string {
  const path = `/guides/${encodeURIComponent(slug)}`
  const section = sectionId?.trim()
  if (section) {
    return `${resolveAppSiteOrigin()}#${path}?section=${encodeURIComponent(section)}`
  }
  return `${resolveAppSiteOrigin()}#${path}`
}

/**
 * Crawlable share URL for Discord / social previews.
 * Served by share.odyssey-calc.com with og:image = guide thumbnail when set.
 */
export function communityGuideShareUrl(slug: string): string {
  return `${resolveCommunityGuideShareOrigin()}/guides/${encodeURIComponent(slug)}`
}

/** Deep link to a chapter/heading (crawlable share page → SPA section). */
export function communityGuideSectionShareUrl(slug: string, sectionId: string): string {
  const id = sectionId.trim()
  if (!id) return communityGuideShareUrl(slug)
  return `${communityGuideShareUrl(slug)}?section=${encodeURIComponent(id)}`
}

const GUIDE_HEADING_SCROLL_OFFSET = 96

/** Smooth-scroll to a guide heading id (TOC / in-body section links). */
export function scrollToCommunityGuideHeading(id: string) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return
  const el = document.getElementById(id)
  if (!el) return
  const top = Math.max(
    0,
    el.getBoundingClientRect().top + window.scrollY - GUIDE_HEADING_SCROLL_OFFSET,
  )
  window.scrollTo({ top, behavior: 'smooth' })
}

function decodeGuidePathSlug(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/**
 * If `href` points at the same guide with `?section=`, return that section id.
 * Supports HashRouter app links and crawlable share.odyssey-calc.com/guides/... URLs.
 */
export function parseCommunityGuideSameSectionHref(
  href: string,
  guideSlug: string,
): string | null {
  const slug = guideSlug.trim()
  const trimmed = href.trim()
  if (!slug || !trimmed) return null

  // Crawlable share Worker: https://share.odyssey-calc.com/guides/{slug}?section=
  try {
    const absolute = trimmed.startsWith('#') ? null : new URL(trimmed)
    if (absolute && (absolute.protocol === 'http:' || absolute.protocol === 'https:')) {
      const path = absolute.pathname.replace(/\/+$/, '') || '/'
      const shareMatch = path.match(/^\/guides\/([^/]+?)(?:\.html)?$/i)
      if (shareMatch) {
        const pathSlug = decodeGuidePathSlug(shareMatch[1] ?? '')
        if (pathSlug === slug) {
          return absolute.searchParams.get('section')?.trim() || null
        }
        return null
      }
    }
  } catch {
    /* fall through to hash parsing */
  }

  let hashPath = ''
  if (trimmed.startsWith('#')) {
    hashPath = trimmed.slice(1)
  } else {
    try {
      const parsed = new URL(trimmed)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
      hashPath = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash
    } catch {
      return null
    }
  }

  hashPath = hashPath.trim()
  if (!hashPath) return null
  if (!hashPath.startsWith('/')) hashPath = `/${hashPath}`

  const qIndex = hashPath.indexOf('?')
  const path = (qIndex >= 0 ? hashPath.slice(0, qIndex) : hashPath).replace(/\/+$/, '') || '/'
  const query = qIndex >= 0 ? hashPath.slice(qIndex + 1) : ''
  const match = path.match(/^\/guides\/([^/]+)$/)
  if (!match) return null

  const pathSlug = decodeGuidePathSlug(match[1] ?? '')
  if (pathSlug !== slug) return null

  const section = new URLSearchParams(query).get('section')?.trim() ?? ''
  return section || null
}

export async function copyCommunityGuideShareLink(slug: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(communityGuideShareUrl(slug))
    return true
  } catch {
    return false
  }
}

export async function copyCommunityGuideSectionShareLink(
  slug: string,
  sectionId: string,
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(communityGuideSectionShareUrl(slug, sectionId))
    return true
  } catch {
    return false
  }
}

export async function fetchPublishedCommunityGuides(
  supabase: SupabaseClient,
): Promise<CommunityGuideListItem[]> {
  let { data, error } = await supabase
    .from('community_guides')
    .select(COMMUNITY_GUIDE_LIST_SELECT)
    .eq('status', 'published')

  if (error && isMissingCommunityGuideColumnError(error.message)) {
    const fallback = await supabase
      .from('community_guides')
      .select(COMMUNITY_GUIDE_LIST_SELECT_CORE)
      .eq('status', 'published')
    data = fallback.data as typeof data
    error = fallback.error
  }

  if (error) throw new Error(formatCommunityGuideError(error.message))
  return (data ?? []).map((row) =>
    normalizeCommunityGuideListItem(row as Record<string, unknown>),
  )
}

async function fetchCommunityGuideListByIds(
  supabase: SupabaseClient,
  guideIds: string[],
): Promise<CommunityGuideListItem[]> {
  if (guideIds.length === 0) return []

  let { data, error } = await supabase
    .from('community_guides')
    .select(COMMUNITY_GUIDE_LIST_SELECT)
    .in('id', guideIds)

  if (error && isMissingCommunityGuideColumnError(error.message)) {
    const fallback = await supabase
      .from('community_guides')
      .select(`${COMMUNITY_GUIDE_LIST_SELECT_CORE}, status`)
      .in('id', guideIds)
    data = fallback.data as typeof data
    error = fallback.error
  }

  if (error) throw new Error(formatCommunityGuideError(error.message))
  return (data ?? []).map((row) =>
    normalizeCommunityGuideListItem(row as Record<string, unknown>),
  )
}

async function fetchAcceptedCollaboratingGuideIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('community_guide_collaborators')
    .select('guide_id')
    .eq('user_id', userId)
    .eq('status', 'accepted')

  if (error) {
    const lower = error.message.toLowerCase()
    if (
      lower.includes('community_guide_collaborators') ||
      lower.includes('42p01') ||
      (lower.includes('relation') && lower.includes('does not exist'))
    ) {
      return []
    }
    throw new Error(formatCommunityGuideError(error.message))
  }
  return (data ?? []).map((row) => String((row as { guide_id: string }).guide_id))
}

export async function fetchAuthorCommunityGuides(
  supabase: SupabaseClient,
  userId: string,
): Promise<CommunityGuideListItem[]> {
  let { data, error } = await supabase
    .from('community_guides')
    .select(COMMUNITY_GUIDE_LIST_SELECT)
    .eq('author_id', userId)
    .order('updated_at', { ascending: false })

  if (error && isMissingCommunityGuideColumnError(error.message)) {
    const fallback = await supabase
      .from('community_guides')
      .select(`${COMMUNITY_GUIDE_LIST_SELECT_CORE}, status`)
      .eq('author_id', userId)
      .order('updated_at', { ascending: false })
    data = fallback.data as typeof data
    error = fallback.error
  }

  if (error) throw new Error(formatCommunityGuideError(error.message))

  const owned = (data ?? []).map((row) =>
    normalizeCommunityGuideListItem(row as Record<string, unknown>),
  )
  const collabIds = await fetchAcceptedCollaboratingGuideIds(supabase, userId)
  const ownedIds = new Set(owned.map((guide) => guide.id))
  const missingCollabIds = collabIds.filter((id) => !ownedIds.has(id))
  const collaborating = await fetchCommunityGuideListByIds(supabase, missingCollabIds)

  return [...owned, ...collaborating].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}

export async function fetchCommunityGuideBySlug(
  supabase: SupabaseClient,
  slug: string,
): Promise<CommunityGuide | null> {
  // Public page: only live columns. Draft_* WIP must never drive the published view.
  const { data, error } = await supabase
    .from('community_guides')
    .select(
      'id, author_id, author_name, title, slug, body, thumbnail_url, heart_count, view_count, status, social_links, created_at, updated_at, has_unpublished_draft',
    )
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()

  if (error) throw new Error(formatCommunityGuideError(error.message))
  if (!data) return null
  const guide = normalizeCommunityGuide(data as Record<string, unknown>)
  // Defense: never expose draft payload on the public page object.
  guide.draft_title = null
  guide.draft_body = null
  guide.draft_thumbnail_url = null
  guide.draft_social_links = null
  return guide
}

export async function incrementCommunityGuideView(
  supabase: SupabaseClient,
  guideId: string,
): Promise<number | null> {
  const { data, error } = await supabase.rpc('increment_community_guide_view', {
    p_guide_id: guideId,
  })

  if (error) {
    if (isMissingCommunityGuideViewRpcError(error.message)) return null
    throw new Error(formatCommunityGuideError(error.message))
  }
  return typeof data === 'number' ? data : null
}

export async function fetchUserHeartedGuide(
  supabase: SupabaseClient,
  userId: string,
  guideId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('community_guide_hearts')
    .select('guide_id')
    .eq('user_id', userId)
    .eq('guide_id', guideId)
    .maybeSingle()

  if (error) throw new Error(formatCommunityGuideError(error.message))
  return Boolean(data)
}

export async function toggleCommunityGuideHeart(
  supabase: SupabaseClient,
  guideId: string,
  userId: string,
  currentlyHearted: boolean,
): Promise<{ hearted: boolean; heartCount: number | null }> {
  if (currentlyHearted) {
    const { error } = await supabase
      .from('community_guide_hearts')
      .delete()
      .eq('guide_id', guideId)
      .eq('user_id', userId)
    if (error) throw new Error(formatCommunityGuideError(error.message))
  } else {
    const { error } = await supabase.from('community_guide_hearts').insert({
      guide_id: guideId,
      user_id: userId,
    })
    if (error) throw new Error(formatCommunityGuideError(error.message))
  }

  const { data, error: readErr } = await supabase
    .from('community_guides')
    .select('heart_count')
    .eq('id', guideId)
    .maybeSingle()

  if (readErr) throw new Error(formatCommunityGuideError(readErr.message))
  return {
    hearted: !currentlyHearted,
    heartCount: (data as { heart_count: number } | null)?.heart_count ?? null,
  }
}

export type SaveCommunityGuideInput = {
  title: string
  body: string
  authorName: string
  slug?: string
  thumbnailUrl?: string | null
  socialLinks?: { platform: string; url: string }[]
  status?: 'draft' | 'published'
}

function normalizeSaveCommunityGuideInput(
  input: SaveCommunityGuideInput,
  status: 'draft' | 'published',
): { title: string; body: string; authorName: string } {
  const title = input.title.trim().slice(0, 120) || (status === 'draft' ? 'Untitled guide' : '')
  if (!title) throw new Error('Title is required.')
  const body = input.body.trim()
  if (status === 'published' && !body) {
    throw new Error('Guide body is required to publish.')
  }
  const authorName = input.authorName.trim().slice(0, 64) || 'Player'
  return { title, body, authorName }
}

function normalizeCommunityGuideThumbnailUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim() ?? ''
  if (!trimmed) return null
  if (!isAllowedCommunityGuideImageUrl(trimmed)) {
    throw new Error('Thumbnail must be a valid http or https image URL.')
  }
  return trimmed.slice(0, 2048)
}

const COMMUNITY_GUIDE_SLUG_MAX_LEN = 80

export function buildCommunityGuideSlugCandidate(base: string, suffixNumber: number): string {
  const root = base.trim().slice(0, COMMUNITY_GUIDE_SLUG_MAX_LEN) || 'guide'
  if (suffixNumber <= 1) return root
  const suffix = `-${suffixNumber}`
  return `${root.slice(0, COMMUNITY_GUIDE_SLUG_MAX_LEN - suffix.length)}${suffix}`
}

async function communityGuideSlugTaken(
  supabase: SupabaseClient,
  slug: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('community_guides')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw new Error(formatCommunityGuideError(error.message))
  return Boolean(data)
}

async function allocateCommunityGuideSlug(
  supabase: SupabaseClient,
  baseSlug: string,
): Promise<string> {
  const base = baseSlug.trim().slice(0, COMMUNITY_GUIDE_SLUG_MAX_LEN) || 'guide'
  for (let n = 1; n <= 999; n++) {
    const candidate = buildCommunityGuideSlugCandidate(base, n)
    if (!(await communityGuideSlugTaken(supabase, candidate))) return candidate
  }
  throw new Error('Could not allocate a unique guide URL. Try a different title.')
}

function isDuplicateCommunityGuideSlugError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('23505') ||
    lower.includes('community_guides_slug_unique') ||
    (lower.includes('duplicate') && lower.includes('slug'))
  )
}

function nextCommunityGuideSlugAfterCollision(base: string, attempted: string): string {
  if (attempted === base) return buildCommunityGuideSlugCandidate(base, 2)
  const match = attempted.match(/-(\d+)$/)
  const next = match ? parseInt(match[1]!, 10) + 1 : 2
  return buildCommunityGuideSlugCandidate(base, next)
}

export async function createCommunityGuide(
  supabase: SupabaseClient,
  userId: string,
  input: SaveCommunityGuideInput,
): Promise<CommunityGuide> {
  const status = input.status ?? 'published'
  const persisted = await persistCommunityGuideImageUrls(supabase, {
    thumbnailUrl: input.thumbnailUrl,
    body: input.body,
  })
  const persistedInput: SaveCommunityGuideInput = {
    ...input,
    thumbnailUrl: persisted.thumbnailUrl,
    body: persisted.body,
  }
  const { title, body, authorName } = normalizeSaveCommunityGuideInput(persistedInput, status)
  const baseSlug = (persistedInput.slug?.trim() || slugifyCommunityGuideTitle(title)).slice(
    0,
    COMMUNITY_GUIDE_SLUG_MAX_LEN,
  )
  let slug = await allocateCommunityGuideSlug(supabase, baseSlug)
  const thumbnailUrl = normalizeCommunityGuideThumbnailUrl(persistedInput.thumbnailUrl)
  const socialLinks = parseCommunityGuideSocialInputs(persistedInput.socialLinks ?? [])

  const buildInsertRow = (nextSlug: string): Record<string, unknown> => {
    const row: Record<string, unknown> = {
      author_id: userId,
      author_name: authorName,
      title,
      slug: nextSlug,
      body,
      status,
      social_links: socialLinks,
    }
    if (thumbnailUrl) row.thumbnail_url = thumbnailUrl
    return row
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    let insertRow = buildInsertRow(slug)
    let { data, error } = await supabase
      .from('community_guides')
      .insert(insertRow)
      .select('*')
      .single()

    if (!error) {
      const guide = normalizeCommunityGuide(data as Record<string, unknown>)
      try {
        await attachCommunityGuideImagesToGuide(supabase, guide.id, persisted.durableUrls)
      } catch {
        // Guide is saved; attachment is best-effort metadata.
      }
      return guide
    }

    if (error && isMissingCommunityGuideColumnError(error.message)) {
      const insertRowRetry = { ...insertRow }
      if (stripOptionalCommunityGuideFields(insertRowRetry, error.message)) {
        const retry = await supabase.from('community_guides').insert(insertRowRetry).select('*').single()
        if (!retry.error) {
          const guide = normalizeCommunityGuide(retry.data as Record<string, unknown>)
          try {
            await attachCommunityGuideImagesToGuide(supabase, guide.id, persisted.durableUrls)
          } catch {
            // best-effort
          }
          return guide
        }
        error = retry.error
      }
    }

    if (error && isDuplicateCommunityGuideSlugError(error.message) && attempt < 7) {
      slug = nextCommunityGuideSlugAfterCollision(baseSlug, slug)
      continue
    }

    if (error) throw new Error(formatCommunityGuideError(error.message))
  }

  throw new Error('Could not allocate a unique guide URL. Try a different title.')
}

export type SaveCommunityGuideOptions = {
  /** When false, leave the original author_name unchanged (collaborator edits). */
  updateAuthorName?: boolean
  /**
   * Optimistic concurrency: only write when remote `updated_at` still matches.
   * Used by live autosave so collaborators do not silently overwrite each other.
   */
  expectedUpdatedAt?: string | null
  /**
   * Current published/draft status before this save. Used so "Save draft" on a
   * published guide writes WIP into draft_* columns instead of unpublishing.
   */
  currentStatus?: 'draft' | 'published'
}

export class CommunityGuideVersionConflictError extends Error {
  constructor() {
    super('Guide was updated by someone else.')
    this.name = 'CommunityGuideVersionConflictError'
  }
}

function clearUnpublishedDraftFields(row: Record<string, unknown>) {
  row.has_unpublished_draft = false
  row.draft_title = null
  row.draft_body = null
  row.draft_thumbnail_url = null
  row.draft_social_links = null
}

export async function updateCommunityGuide(
  supabase: SupabaseClient,
  guideId: string,
  userId: string,
  input: SaveCommunityGuideInput,
  options?: SaveCommunityGuideOptions,
): Promise<CommunityGuide> {
  if (!userId) throw new Error('Not authenticated.')

  const persisted = await persistCommunityGuideImageUrls(supabase, {
    thumbnailUrl: input.thumbnailUrl,
    body: input.body,
    guideId,
  })
  const persistedInput: SaveCommunityGuideInput = {
    ...input,
    thumbnailUrl: persisted.thumbnailUrl,
    body: persisted.body,
  }

  const requestedStatus = persistedInput.status ?? 'published'
  const currentStatus = options?.currentStatus ?? requestedStatus
  const preservePublishedLive =
    requestedStatus === 'draft' && currentStatus === 'published'
  const status = preservePublishedLive ? 'published' : requestedStatus
  const { title, body, authorName } = normalizeSaveCommunityGuideInput(
    persistedInput,
    // Draft WIP on a live guide still allows an empty body (same as unpublished drafts).
    preservePublishedLive ? 'draft' : status,
  )
  const thumbnailUrl = normalizeCommunityGuideThumbnailUrl(persistedInput.thumbnailUrl)
  const socialLinks = parseCommunityGuideSocialInputs(persistedInput.socialLinks ?? [])
  const updateAuthorName = options?.updateAuthorName !== false
  const expectedUpdatedAt = options?.expectedUpdatedAt

  let updateRow: Record<string, unknown>

  if (preservePublishedLive) {
    // Keep live title/body/status; store WIP privately until publish.
    updateRow = {
      status: 'published',
      has_unpublished_draft: true,
      draft_title: title,
      draft_body: body,
      draft_thumbnail_url: thumbnailUrl,
      draft_social_links: socialLinks,
      updated_at: new Date().toISOString(),
    }
    if (updateAuthorName) {
      updateRow.author_name = authorName
    }
  } else {
    updateRow = {
      title,
      body,
      status,
      social_links: socialLinks,
      updated_at: new Date().toISOString(),
    }
    if (updateAuthorName) {
      updateRow.author_name = authorName
    }
    if (thumbnailUrl !== null || persistedInput.thumbnailUrl === '') {
      updateRow.thumbnail_url = thumbnailUrl
    }
    if (status === 'published') {
      clearUnpublishedDraftFields(updateRow)
    }
  }

  // RLS allows the owner or an accepted collaborator; do not filter by author_id.
  const runUpdate = (row: Record<string, unknown>) => {
    let query = supabase.from('community_guides').update(row).eq('id', guideId)
    if (expectedUpdatedAt) {
      query = query.eq('updated_at', expectedUpdatedAt)
    }
    return expectedUpdatedAt ? query.select('*').maybeSingle() : query.select('*').single()
  }

  let { data, error } = await runUpdate(updateRow)

  if (error && isMissingCommunityGuideColumnError(error.message)) {
    const updateRowRetry = { ...updateRow }
    if (stripOptionalCommunityGuideFields(updateRowRetry, error.message)) {
      // Never fall back to writing WIP onto live title/body/thumbnail when draft
      // columns are missing — that leaked unpublished edits onto the public page.
      if (preservePublishedLive && isMissingCommunityGuideDraftColumnError(error.message)) {
        throw new Error(
          'Unpublished draft storage is not available on this database yet. Apply the community_guides unpublished-draft migration before editing a live guide.',
        )
      }
      const retry = await runUpdate(updateRowRetry)
      data = retry.data
      error = retry.error
    }
  }

  if (error) throw new Error(formatCommunityGuideError(error.message))
  if (!data) {
    if (expectedUpdatedAt) throw new CommunityGuideVersionConflictError()
    throw new Error('Guide not found or you do not have permission to edit it.')
  }
  try {
    await attachCommunityGuideImagesToGuide(supabase, guideId, persisted.durableUrls)
  } catch {
    // best-effort
  }
  return normalizeCommunityGuide(data as Record<string, unknown>)
}

/** Load a guide for editing when the user is the owner or an accepted collaborator. */
export async function fetchCommunityGuideForAuthor(
  supabase: SupabaseClient,
  guideId: string,
  userId: string,
): Promise<CommunityGuide | null> {
  const { data, error } = await supabase
    .from('community_guides')
    .select('*')
    .eq('id', guideId)
    .maybeSingle()

  if (error) throw new Error(formatCommunityGuideError(error.message))
  if (!data) return null

  const guide = normalizeCommunityGuide(data as Record<string, unknown>)
  if (guide.author_id === userId) return guide

  const collabIds = await fetchAcceptedCollaboratingGuideIds(supabase, userId)
  if (collabIds.includes(guide.id)) return guide
  return null
}

export async function deleteCommunityGuide(
  supabase: SupabaseClient,
  guideId: string,
  userId: string,
): Promise<void> {
  try {
    await deleteCommunityGuideImagesForGuide(supabase, guideId)
  } catch {
    // Continue with guide delete; FK cascade still clears metadata rows.
  }
  const { error } = await supabase
    .from('community_guides')
    .delete()
    .eq('id', guideId)
    .eq('author_id', userId)

  if (error) throw new Error(formatCommunityGuideError(error.message))
}
