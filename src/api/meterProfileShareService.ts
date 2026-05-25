import { getMeterAnonSupabase } from '../lib/meterDataSource'
import {
  buildMeterProfileShareHtml,
  canRefreshMeterProfileShare,
  METER_PROFILE_SHARE_BUCKET,
  meterProfileAppUrl,
  meterProfileShareOgImageUrl,
  meterProfileSharePageUrl,
  meterProfileShareStorageFolder,
  renderMeterProfileShareOgPng,
  resolveMeterShareSiteOrigin,
  type MeterProfileShareSnapshot,
} from '../lib/meterPlayerShare'

export type MeterProfileShareRecord = {
  playerKey: string
  displayName: string
  snapshot: MeterProfileShareSnapshot
  generatedAt: string
  sharePageUrl: string
  ogImageUrl: string
}

function supabaseUrl(): string | null {
  return (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || null
}

function parseSnapshot(raw: unknown): MeterProfileShareSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const favorite = o.favoriteDigimon
  return {
    displayName: typeof o.displayName === 'string' ? o.displayName : '',
    peakDps: typeof o.peakDps === 'number' ? o.peakDps : 0,
    bestEntryCount: typeof o.bestEntryCount === 'number' ? o.bestEntryCount : 0,
    dungeonCount: typeof o.dungeonCount === 'number' ? o.dungeonCount : 0,
    favoriteDigimon:
      favorite && typeof favorite === 'object' && typeof (favorite as { digimonName?: string }).digimonName === 'string'
        ? (favorite as MeterProfileShareSnapshot['favoriteDigimon'])
        : null,
  }
}

export function isMeterProfileShareConfigured(): boolean {
  return getMeterAnonSupabase() != null && Boolean(supabaseUrl())
}

export async function fetchMeterProfileShare(
  playerKey: string,
): Promise<{ record: MeterProfileShareRecord | null; error: string | null }> {
  const supabase = getMeterAnonSupabase()
  const url = supabaseUrl()
  if (!supabase || !url) {
    return { record: null, error: 'Supabase is not configured.' }
  }

  const key = meterProfileShareStorageFolder(playerKey)
  const { data, error } = await supabase
    .from('meter_profile_shares')
    .select('player_key, display_name, snapshot, generated_at')
    .eq('player_key', key)
    .maybeSingle()

  if (error) return { record: null, error: error.message }
  if (!data) return { record: null, error: null }

  const snapshot = parseSnapshot(data.snapshot)
  if (!snapshot) return { record: null, error: null }

  const siteOrigin = resolveMeterShareSiteOrigin()

  return {
    record: {
      playerKey: data.player_key,
      displayName: data.display_name,
      snapshot,
      generatedAt: data.generated_at,
      sharePageUrl: meterProfileSharePageUrl(siteOrigin, key),
      ogImageUrl: meterProfileShareOgImageUrl(siteOrigin, key),
    },
    error: null,
  }
}

export type GenerateMeterProfileShareResult =
  | { ok: true; record: MeterProfileShareRecord }
  | { ok: false; error: string; rateLimited?: boolean; nextAllowedAt?: string }

export async function generateMeterProfileShare(options: {
  playerKey: string
  snapshot: MeterProfileShareSnapshot
  portraitUrl?: string
  siteOrigin: string
}): Promise<GenerateMeterProfileShareResult> {
  const supabase = getMeterAnonSupabase()
  const url = supabaseUrl()
  if (!supabase || !url) {
    return { ok: false, error: 'Supabase is not configured.' }
  }

  const key = meterProfileShareStorageFolder(options.playerKey)
  const folder = key
  const htmlPath = `${folder}/index.html`
  const ogPath = `${folder}/og.png`
  const siteOrigin = options.siteOrigin.replace(/\/$/, '')
  const sharePageUrl = meterProfileSharePageUrl(siteOrigin, key)
  const ogImageUrl = meterProfileShareOgImageUrl(siteOrigin, key)
  const appUrl = meterProfileAppUrl(siteOrigin, key)

  const prior = await fetchMeterProfileShare(key)
  if (prior.record && !canRefreshMeterProfileShare(prior.record.generatedAt)) {
    const next = new Date(Date.parse(prior.record.generatedAt) + 60 * 60 * 1000).toISOString()
    return {
      ok: false,
      error: 'This profile preview was updated recently. Try again in about an hour.',
      rateLimited: true,
      nextAllowedAt: next,
    }
  }

  let ogBlob: Blob
  try {
    ogBlob = await renderMeterProfileShareOgPng(options.snapshot, options.portraitUrl)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to render preview image' }
  }

  const html = buildMeterProfileShareHtml({
    snapshot: options.snapshot,
    sharePageUrl,
    ogImageUrl,
    appUrl,
  })

  const { error: ogUploadError } = await supabase.storage
    .from(METER_PROFILE_SHARE_BUCKET)
    .upload(ogPath, ogBlob, { contentType: 'image/png', upsert: true, cacheControl: '3600' })

  if (ogUploadError) {
    return { ok: false, error: ogUploadError.message }
  }

  const { error: htmlUploadError } = await supabase.storage
    .from(METER_PROFILE_SHARE_BUCKET)
    .upload(htmlPath, new Blob([html], { type: 'text/html;charset=utf-8' }), {
      contentType: 'text/html',
      upsert: true,
      cacheControl: '3600',
    })

  if (htmlUploadError) {
    return { ok: false, error: htmlUploadError.message }
  }

  const { data: commitData, error: commitError } = await supabase.rpc('commit_meter_profile_share', {
    p_player_key: key,
    p_display_name: options.snapshot.displayName,
    p_snapshot: options.snapshot,
  })

  if (commitError) {
    return { ok: false, error: commitError.message }
  }

  const commit = commitData as {
    ok?: boolean
    rate_limited?: boolean
    next_allowed_at?: string
    generated_at?: string
    error?: string
  }

  if (!commit?.ok) {
    return {
      ok: false,
      error: commit?.rate_limited
        ? 'This profile preview was updated recently. Try again in about an hour.'
        : commit?.error || 'Could not register share preview',
      rateLimited: Boolean(commit?.rate_limited),
      nextAllowedAt: commit?.next_allowed_at,
    }
  }

  const generatedAt = commit.generated_at ?? new Date().toISOString()

  return {
    ok: true,
    record: {
      playerKey: key,
      displayName: options.snapshot.displayName,
      snapshot: options.snapshot,
      generatedAt,
      sharePageUrl,
      ogImageUrl,
    },
  }
}
