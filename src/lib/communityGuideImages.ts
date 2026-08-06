import type { SupabaseClient } from '@supabase/supabase-js'
import {
  collectCommunityGuideDungeonEmbedImageUrls,
  rewriteCommunityGuideDungeonEmbedImageUrls,
} from './communityGuideEmbed'
import {
  collectCommunityGuideMarkdownImageUrls,
  extensionForGuideImageMime,
  guideImageCdnUrl,
  GUIDE_IMAGES_BUCKET,
  isDurableCommunityGuideImageUrl,
  rewriteCommunityGuideMarkdownImageUrls,
  validateGuideImageBlob,
} from './communityGuideImageStorage'

export type CommunityGuideImageRow = {
  id: string
  owner_id: string
  guide_id: string | null
  storage_path: string
  public_url: string
  source_url: string | null
  content_type: string
  byte_size: number
  created_at: string
}

function normalizeImageRow(row: Record<string, unknown>): CommunityGuideImageRow {
  return {
    id: String(row.id),
    owner_id: String(row.owner_id),
    guide_id: row.guide_id == null ? null : String(row.guide_id),
    storage_path: String(row.storage_path),
    public_url: String(row.public_url),
    source_url: row.source_url == null ? null : String(row.source_url),
    content_type: String(row.content_type),
    byte_size: Number(row.byte_size) || 0,
    created_at: String(row.created_at),
  }
}

export async function uploadCommunityGuideImageFile(
  supabase: SupabaseClient,
  userId: string,
  file: File | Blob,
  options?: { fileName?: string; guideId?: string | null; sourceUrl?: string | null },
): Promise<CommunityGuideImageRow> {
  if (!userId) throw new Error('Not authenticated.')
  const fileName = options?.fileName || (file instanceof File ? file.name : 'image')
  const contentType = validateGuideImageBlob(file, fileName)
  const imageId = crypto.randomUUID()
  const ext = extensionForGuideImageMime(contentType)
  const storagePath = `${userId}/${imageId}.${ext}`
  const publicUrl = guideImageCdnUrl(storagePath)

  const { error: uploadError } = await supabase.storage.from(GUIDE_IMAGES_BUCKET).upload(storagePath, file, {
    contentType,
    cacheControl: '31536000',
    upsert: false,
  })
  if (uploadError) throw new Error(uploadError.message)

  const insertRow = {
    id: imageId,
    owner_id: userId,
    guide_id: options?.guideId ?? null,
    storage_path: storagePath,
    public_url: publicUrl,
    source_url: options?.sourceUrl?.trim() || null,
    content_type: contentType,
    byte_size: file.size,
  }

  const { data, error } = await supabase
    .from('community_guide_images')
    .insert(insertRow)
    .select('*')
    .single()

  if (error) {
    await supabase.storage.from(GUIDE_IMAGES_BUCKET).remove([storagePath])
    throw new Error(error.message)
  }
  return normalizeImageRow(data as Record<string, unknown>)
}

export async function ingestCommunityGuideImageUrl(
  supabase: SupabaseClient,
  remoteUrl: string,
  options?: { guideId?: string | null },
): Promise<CommunityGuideImageRow> {
  const trimmed = remoteUrl.trim()
  if (!trimmed) throw new Error('Image URL is required.')
  if (isDurableCommunityGuideImageUrl(trimmed)) {
    const existing = await findCommunityGuideImageByPublicUrl(supabase, trimmed)
    if (existing) return existing
  }

  const { data, error } = await supabase.functions.invoke('ingest-guide-image', {
    body: {
      url: trimmed,
      guideId: options?.guideId ?? null,
    },
  })
  if (error) throw new Error(error.message || 'Failed to store image.')
  if (!data || typeof data !== 'object') throw new Error('Failed to store image.')
  const payload = data as Record<string, unknown>
  if (payload.ok === false) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'Failed to store image.')
  }
  const image = payload.image
  if (!image || typeof image !== 'object') throw new Error('Failed to store image.')
  return normalizeImageRow(image as Record<string, unknown>)
}

export async function findCommunityGuideImageByPublicUrl(
  supabase: SupabaseClient,
  publicUrl: string,
): Promise<CommunityGuideImageRow | null> {
  const { data, error } = await supabase
    .from('community_guide_images')
    .select('*')
    .eq('public_url', publicUrl.trim())
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return normalizeImageRow(data as Record<string, unknown>)
}

export async function deleteCommunityGuideImage(
  supabase: SupabaseClient,
  image: Pick<CommunityGuideImageRow, 'id' | 'storage_path'>,
): Promise<void> {
  const { error: storageError } = await supabase.storage
    .from(GUIDE_IMAGES_BUCKET)
    .remove([image.storage_path])
  if (storageError) throw new Error(storageError.message)

  const { error } = await supabase.from('community_guide_images').delete().eq('id', image.id)
  if (error) throw new Error(error.message)
}

export async function deleteCommunityGuideImagesForGuide(
  supabase: SupabaseClient,
  guideId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('community_guide_images')
    .select('id, storage_path')
    .eq('guide_id', guideId)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<{ id: string; storage_path: string }>
  if (!rows.length) return

  const paths = rows.map((r) => r.storage_path)
  const { error: storageError } = await supabase.storage.from(GUIDE_IMAGES_BUCKET).remove(paths)
  if (storageError) throw new Error(storageError.message)

  const { error: deleteError } = await supabase
    .from('community_guide_images')
    .delete()
    .eq('guide_id', guideId)
  if (deleteError) throw new Error(deleteError.message)
}

export async function attachCommunityGuideImagesToGuide(
  supabase: SupabaseClient,
  guideId: string,
  publicUrls: string[],
): Promise<void> {
  const urls = [...new Set(publicUrls.map((u) => u.trim()).filter(Boolean))]
  if (!urls.length) return
  const { error } = await supabase
    .from('community_guide_images')
    .update({ guide_id: guideId })
    .in('public_url', urls)
    .is('guide_id', null)
  if (error) throw new Error(error.message)
}

/**
 * Mirror any non-durable thumbnail/body image URLs into owned storage and return
 * rewritten fields ready to save.
 */
export async function persistCommunityGuideImageUrls(
  supabase: SupabaseClient,
  input: { thumbnailUrl: string | null | undefined; body: string; guideId?: string | null },
): Promise<{ thumbnailUrl: string | null; body: string; durableUrls: string[] }> {
  const replacements = new Map<string, string>()
  const durableUrls: string[] = []

  const ensure = async (url: string | null | undefined): Promise<string | null> => {
    const trimmed = url?.trim() ?? ''
    if (!trimmed) return null
    if (replacements.has(trimmed)) return replacements.get(trimmed)!
    if (isDurableCommunityGuideImageUrl(trimmed)) {
      durableUrls.push(trimmed)
      return trimmed
    }
    const row = await ingestCommunityGuideImageUrl(supabase, trimmed, {
      guideId: input.guideId ?? null,
    })
    replacements.set(trimmed, row.public_url)
    durableUrls.push(row.public_url)
    return row.public_url
  }

  const thumbnailUrl = await ensure(input.thumbnailUrl)
  for (const url of collectCommunityGuideMarkdownImageUrls(input.body)) {
    await ensure(url)
  }
  for (const url of collectCommunityGuideDungeonEmbedImageUrls(input.body)) {
    await ensure(url)
  }
  const withMarkdown = rewriteCommunityGuideMarkdownImageUrls(input.body, replacements)
  const body = rewriteCommunityGuideDungeonEmbedImageUrls(withMarkdown, replacements)
  return {
    thumbnailUrl,
    body,
    durableUrls: [...new Set(durableUrls)],
  }
}
