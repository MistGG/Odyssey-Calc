import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveAppSiteOrigin } from '../config/site'
import { isAllowedCommunityGuideImageUrl } from './communityGuideImageUrl'
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
  created_at: string
  updated_at: string
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
    (lower.includes('column') && lower.includes('community_guides'))
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

/** Hash-router deep link for a published guide. */
export function communityGuideShareUrl(slug: string): string {
  const path = `/guides/${encodeURIComponent(slug)}`
  return `${resolveAppSiteOrigin()}#${path}`
}

export async function copyCommunityGuideShareLink(slug: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(communityGuideShareUrl(slug))
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
  return (data ?? []).map((row) =>
    normalizeCommunityGuideListItem(row as Record<string, unknown>),
  )
}

export async function fetchCommunityGuideBySlug(
  supabase: SupabaseClient,
  slug: string,
): Promise<CommunityGuide | null> {
  const { data, error } = await supabase
    .from('community_guides')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()

  if (error) throw new Error(formatCommunityGuideError(error.message))
  return data ? normalizeCommunityGuide(data as Record<string, unknown>) : null
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
  const { title, body, authorName } = normalizeSaveCommunityGuideInput(input, status)
  const baseSlug = (input.slug?.trim() || slugifyCommunityGuideTitle(title)).slice(
    0,
    COMMUNITY_GUIDE_SLUG_MAX_LEN,
  )
  let slug = await allocateCommunityGuideSlug(supabase, baseSlug)
  const thumbnailUrl = normalizeCommunityGuideThumbnailUrl(input.thumbnailUrl)
  const socialLinks = parseCommunityGuideSocialInputs(input.socialLinks ?? [])

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

    if (!error) return normalizeCommunityGuide(data as Record<string, unknown>)

    if (error && isMissingCommunityGuideColumnError(error.message)) {
      const insertRowRetry = { ...insertRow }
      if (stripOptionalCommunityGuideFields(insertRowRetry, error.message)) {
        const retry = await supabase.from('community_guides').insert(insertRowRetry).select('*').single()
        if (!retry.error) return normalizeCommunityGuide(retry.data as Record<string, unknown>)
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

export async function updateCommunityGuide(
  supabase: SupabaseClient,
  guideId: string,
  userId: string,
  input: SaveCommunityGuideInput,
): Promise<CommunityGuide> {
  const status = input.status ?? 'published'
  const { title, body, authorName } = normalizeSaveCommunityGuideInput(input, status)
  const thumbnailUrl = normalizeCommunityGuideThumbnailUrl(input.thumbnailUrl)
  const socialLinks = parseCommunityGuideSocialInputs(input.socialLinks ?? [])

  const updateRow: Record<string, unknown> = {
    title,
    body,
    author_name: authorName,
    status,
    social_links: socialLinks,
    updated_at: new Date().toISOString(),
  }
  if (thumbnailUrl !== null || input.thumbnailUrl === '') {
    updateRow.thumbnail_url = thumbnailUrl
  }

  let { data, error } = await supabase
    .from('community_guides')
    .update(updateRow)
    .eq('id', guideId)
    .eq('author_id', userId)
    .select('*')
    .single()

  if (error && isMissingCommunityGuideColumnError(error.message)) {
    const updateRowRetry = { ...updateRow }
    if (stripOptionalCommunityGuideFields(updateRowRetry, error.message)) {
      const retry = await supabase
        .from('community_guides')
        .update(updateRowRetry)
        .eq('id', guideId)
        .eq('author_id', userId)
        .select('*')
        .single()
      data = retry.data
      error = retry.error
    }
  }

  if (error) throw new Error(formatCommunityGuideError(error.message))
  return normalizeCommunityGuide(data as Record<string, unknown>)
}

export async function fetchCommunityGuideForAuthor(
  supabase: SupabaseClient,
  guideId: string,
  userId: string,
): Promise<CommunityGuide | null> {
  const { data, error } = await supabase
    .from('community_guides')
    .select('*')
    .eq('id', guideId)
    .eq('author_id', userId)
    .maybeSingle()

  if (error) throw new Error(formatCommunityGuideError(error.message))
  return data ? normalizeCommunityGuide(data as Record<string, unknown>) : null
}

export async function deleteCommunityGuide(
  supabase: SupabaseClient,
  guideId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('community_guides')
    .delete()
    .eq('id', guideId)
    .eq('author_id', userId)

  if (error) throw new Error(formatCommunityGuideError(error.message))
}
