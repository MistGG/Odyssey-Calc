import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const BUCKET = 'guide-images'
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function extensionForMime(contentType: string): string {
  const mime = contentType.toLowerCase().split(';')[0]!.trim()
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/gif') return 'gif'
  return 'bin'
}

function sniffMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png'
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return 'image/gif'
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  return null
}

function resolveCdnOrigin(): string {
  const fromEnv =
    Deno.env.get('GUIDE_IMAGE_CDN_ORIGIN')?.trim() ||
    Deno.env.get('METER_SHARE_PUBLIC_ORIGIN')?.trim() ||
    'https://share.odyssey-calc.com'
  return fromEnv.replace(/\/$/, '')
}

function guideImageCdnUrl(storagePath: string): string {
  return `${resolveCdnOrigin()}/guide-images/${storagePath.replace(/^\/+/, '')}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed.' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!supabaseUrl || !serviceKey) {
    return json(500, { ok: false, error: 'Server is not configured.' })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return json(401, { ok: false, error: 'Not authenticated.' })
  }

  const userClient = createClient(supabaseUrl, anonKey || serviceKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser()
  if (userError || !user) return json(401, { ok: false, error: 'Not authenticated.' })

  let body: { url?: string; guideId?: string | null }
  try {
    body = (await req.json()) as { url?: string; guideId?: string | null }
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON body.' })
  }

  const remoteUrl = typeof body.url === 'string' ? body.url.trim() : ''
  if (!remoteUrl) return json(400, { ok: false, error: 'url is required.' })
  let parsed: URL
  try {
    parsed = new URL(remoteUrl)
  } catch {
    return json(400, { ok: false, error: 'url must be a valid http(s) URL.' })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return json(400, { ok: false, error: 'url must be http or https.' })
  }

  const guideId =
    typeof body.guideId === 'string' && body.guideId.trim() ? body.guideId.trim() : null

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  // Reuse an existing mirror of the same source when present for this user.
  const { data: existingBySource } = await admin
    .from('community_guide_images')
    .select('*')
    .eq('owner_id', user.id)
    .eq('source_url', remoteUrl)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existingBySource) {
    if (guideId && !existingBySource.guide_id) {
      await admin
        .from('community_guide_images')
        .update({ guide_id: guideId })
        .eq('id', existingBySource.id)
      existingBySource.guide_id = guideId
    }
    return json(200, { ok: true, image: existingBySource, reused: true })
  }

  let upstream: Response
  try {
    upstream = await fetch(remoteUrl, {
      redirect: 'follow',
      headers: { Accept: 'image/*,*/*;q=0.8' },
    })
  } catch {
    return json(400, { ok: false, error: 'Could not download image URL.' })
  }
  if (!upstream.ok) {
    return json(400, { ok: false, error: `Image download failed (${upstream.status}).` })
  }

  const buf = new Uint8Array(await upstream.arrayBuffer())
  if (buf.byteLength <= 0) return json(400, { ok: false, error: 'Image file is empty.' })
  if (buf.byteLength > MAX_BYTES) {
    return json(400, { ok: false, error: 'Images must be 5 MB or smaller.' })
  }

  const headerMime = (upstream.headers.get('content-type') || '').toLowerCase().split(';')[0]!.trim()
  const sniffed = sniffMime(buf)
  const contentType =
    sniffed && ALLOWED_MIME.has(sniffed)
      ? sniffed
      : ALLOWED_MIME.has(headerMime)
        ? headerMime
        : null
  if (!contentType) {
    return json(400, { ok: false, error: 'Images must be JPEG, PNG, WebP, or GIF.' })
  }

  if (guideId) {
    const { data: canEdit, error: editError } = await userClient.rpc('can_edit_community_guide', {
      p_guide_id: guideId,
    })
    if (editError) return json(400, { ok: false, error: editError.message })
    if (!canEdit) return json(403, { ok: false, error: 'You cannot edit this guide.' })
  }

  const imageId = crypto.randomUUID()
  const ext = extensionForMime(contentType)
  const storagePath = `${user.id}/${imageId}.${ext}`
  const publicUrl = guideImageCdnUrl(storagePath)

  const { error: uploadError } = await admin.storage.from(BUCKET).upload(storagePath, buf, {
    contentType,
    cacheControl: '31536000',
    upsert: false,
  })
  if (uploadError) return json(500, { ok: false, error: uploadError.message })

  const insertRow = {
    id: imageId,
    owner_id: user.id,
    guide_id: guideId,
    storage_path: storagePath,
    public_url: publicUrl,
    source_url: remoteUrl,
    content_type: contentType,
    byte_size: buf.byteLength,
  }

  const { data: inserted, error: insertError } = await admin
    .from('community_guide_images')
    .insert(insertRow)
    .select('*')
    .single()

  if (insertError) {
    await admin.storage.from(BUCKET).remove([storagePath])
    return json(500, { ok: false, error: insertError.message })
  }

  return json(200, { ok: true, image: inserted })
})
