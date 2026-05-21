import { imgurIdFromUrl, imgurTeaserRemoteUrl } from './teaserImageStorage'

/**
 * Official forum “News” teaser image (Digital Odyssey Proboards announcement box).
 * If the team changes the hotlink URL, follow `teaserEffectsPolicy.ts` (archive the old
 * image, leave {@link GRAY_FOG_TEASER_IMGUR_ID} empty so live has no effects, run `sync:teasers`).
 *
 * @see https://digitalodyssey.proboards.com/
 */
export const FORUM_TEASER_IMAGE_URL = 'https://i.imgur.com/6JQlbLZ.png'

/** Teasers collection thread (announcement “Read more” target). */
export const FORUM_TEASER_THREAD_URL =
  'https://digitalodyssey.proboards.com/thread/27/teasers-collection'

const CACHE_NAME = 'odyssey-calc-forum-teaser-v1'
const META_KEY = 'odysseyCalc.forumTeaserImageMeta.v1'
/** localStorage: identity of the teaser TV intro already shown site-wide (once per new image). */
const POPUP_SEEN_IDENTITY_KEY = 'odysseyCalc.forumTeaserPopupSeenIdentity.v1'

export type ForumTeaserImageMeta = {
  /** HTTP Last-Modified when the PNG was last stored (Imgur exposes this cross-origin). */
  lastModified: string | null
  /** Optional ETag when present (may be hidden by CORS on some browsers). */
  etag: string | null
}

function hasCachesApi(): boolean {
  return typeof caches !== 'undefined'
}

/** Stable key for “this exact teaser file”; changes when Last-Modified / ETag from Imgur changes. */
export function getForumTeaserIdentityKey(): string {
  const m = readMeta()
  if (!m) return ''
  const lm = (m.lastModified ?? '').trim()
  const et = (m.etag ?? '').trim()
  if (!lm && !et) return ''
  return `${lm}\u0000${et}`
}

export function readForumTeaserPopupSeenIdentity(): string | null {
  try {
    const v = localStorage.getItem(POPUP_SEEN_IDENTITY_KEY)
    return v == null || v === '' ? null : v
  } catch {
    return null
  }
}

export function writeForumTeaserPopupSeenIdentity(key: string): void {
  try {
    localStorage.setItem(POPUP_SEEN_IDENTITY_KEY, key)
  } catch {
    /* ignore */
  }
}

function readMeta(): ForumTeaserImageMeta | null {
  try {
    const raw = localStorage.getItem(META_KEY)
    if (raw == null || raw.trim() === '') return null
    const parsed = JSON.parse(raw) as ForumTeaserImageMeta
    if (parsed && typeof parsed === 'object') return parsed
    return null
  } catch {
    return null
  }
}

function writeMeta(meta: ForumTeaserImageMeta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta))
  } catch {
    /* ignore quota / private mode */
  }
}

export async function readCachedTeaserBlob(): Promise<Blob | null> {
  if (!hasCachesApi()) return null
  try {
    const cache = await caches.open(CACHE_NAME)
    const hit = await cache.match(FORUM_TEASER_IMAGE_URL)
    if (!hit || !hit.ok) return null
    return await hit.blob()
  } catch {
    return null
  }
}

async function putTeaserResponse(res: Response, body: ArrayBuffer): Promise<void> {
  if (!hasCachesApi()) return
  const cache = await caches.open(CACHE_NAME)
  const etag = res.headers.get('etag')
  const ct = res.headers.get('content-type') || 'image/png'
  const headers = new Headers()
  headers.set('Content-Type', ct)
  if (etag) headers.set('ETag', etag)
  const cached = new Response(body, { status: 200, headers })
  await cache.put(FORUM_TEASER_IMAGE_URL, cached)
  const imgurId = imgurIdFromUrl(FORUM_TEASER_IMAGE_URL)
  if (imgurId) {
    await cache.put(imgurTeaserRemoteUrl(imgurId), cached.clone())
  }
}

/**
 * HEAD probe + conditional GET. Returns true when a new PNG was written to the Cache API
 * (or meta was primed on first successful fetch).
 */
export async function syncForumTeaserImage(): Promise<boolean> {
  const meta = readMeta()
  let remoteLastModified: string | null = null
  let remoteEtag: string | null = null

  try {
    const head = await fetch(FORUM_TEASER_IMAGE_URL, {
      method: 'HEAD',
      mode: 'cors',
      cache: 'no-store',
    })
    if (head.ok) {
      remoteLastModified = head.headers.get('last-modified')
      remoteEtag = head.headers.get('etag')
    }
  } catch {
    /* HEAD unsupported or blocked — fall through to GET */
  }

  const etagMatches =
    remoteEtag == null || meta == null || meta.etag == null || remoteEtag === meta.etag
  const unchangedByHeaders =
    meta != null &&
    Boolean(meta.lastModified) &&
    remoteLastModified != null &&
    remoteLastModified === meta.lastModified &&
    etagMatches

  if (unchangedByHeaders) {
    const existing = await readCachedTeaserBlob()
    if (existing && existing.size > 0) return false
  }

  try {
    const res = await fetch(FORUM_TEASER_IMAGE_URL, {
      mode: 'cors',
      cache: 'no-store',
    })
    if (!res.ok) return false
    const buf = await res.arrayBuffer()
    if (buf.byteLength === 0) return false

    const lm = res.headers.get('last-modified') ?? remoteLastModified
    const etag = res.headers.get('etag') ?? remoteEtag
    const nextMeta: ForumTeaserImageMeta = { lastModified: lm, etag }

    const etagMatchesLocal = etag == null || meta == null || meta.etag == null || etag === meta.etag
    const sameAsStored =
      meta != null &&
      Boolean(meta.lastModified) &&
      lm != null &&
      meta.lastModified === lm &&
      etagMatchesLocal
    if (sameAsStored) {
      const existing = await readCachedTeaserBlob()
      if (existing && existing.size > 0) return false
    }

    await putTeaserResponse(res, buf)
    writeMeta(nextMeta)
    return true
  } catch {
    return false
  }
}

