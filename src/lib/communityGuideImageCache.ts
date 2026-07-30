const CACHE_NAME = 'community-guide-images-v1'

function canUseCacheApi(): boolean {
  return typeof caches !== 'undefined' && typeof fetch === 'function'
}

/**
 * Resolve a durable guide image URL to a browser-local blob URL when possible.
 * Falls back to the network URL if Cache API is unavailable or fetch fails.
 */
export async function resolveCachedCommunityGuideImageSrc(url: string): Promise<string> {
  const trimmed = url.trim()
  if (!trimmed) return trimmed
  if (!canUseCacheApi()) return trimmed

  try {
    const cache = await caches.open(CACHE_NAME)
    const request = new Request(trimmed, { mode: 'cors', credentials: 'omit' })
    const cached = await cache.match(request)
    if (cached) {
      const blob = await cached.blob()
      return URL.createObjectURL(blob)
    }

    const res = await fetch(request)
    if (!res.ok) return trimmed
    // Cache a clone; use another clone for the object URL.
    await cache.put(request, res.clone())
    const blob = await res.blob()
    return URL.createObjectURL(blob)
  } catch {
    return trimmed
  }
}

export function revokeCachedCommunityGuideObjectUrl(url: string | null | undefined) {
  if (!url || !url.startsWith('blob:')) return
  try {
    URL.revokeObjectURL(url)
  } catch {
    // ignore
  }
}
