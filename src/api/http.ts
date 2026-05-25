import { wikiHttpCacheGet, wikiHttpCacheSet } from '../lib/wikiHttpCache'
import { runWikiRequest } from '../lib/wikiRequestQueue'

export type FetchJsonError = Error & {
  status?: number
  url?: string
}

function shouldUseStaleWikiCache(e: unknown): boolean {
  if (e instanceof TypeError) return true
  if (!e || typeof e !== 'object') return false
  const status = (e as FetchJsonError).status
  if (status === 429 || status === 503 || status === 502) return true
  const msg = e instanceof Error ? e.message : String(e)
  if (/429|503|502|too many requests|rate limit|temporarily unavailable/i.test(msg)) return true
  return false
}

function isWikiGet(url: string, method: string): boolean {
  if (method !== 'GET') return false
  try {
    const path = new URL(url, window.location.origin).pathname
    return path.includes('/api/wiki') || path.includes('/proxy/api/wiki')
  } catch {
    return /\/api\/wiki|\/proxy\/api\/wiki/.test(url)
  }
}

async function fetchJsonOnce<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const err = new Error(
      `Request failed (${res.status} ${res.statusText})${text ? `: ${text.slice(0, 200)}` : ''}`,
    ) as FetchJsonError
    err.status = res.status
    err.url = url
    throw err
  }
  return res.json() as Promise<T>
}

/**
 * GET JSON with optional localStorage cache: successful responses are stored; on rate limits
 * or transient failures we return the last successful body when available.
 */
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase()
  if (method !== 'GET') {
    return fetchJsonOnce<T>(url, init)
  }

  const run = () => fetchJsonOnce<T>(url, init)

  try {
    const data = isWikiGet(url, method)
      ? await runWikiRequest(run)
      : await run()
    wikiHttpCacheSet(url, data)
    return data
  } catch (e) {
    if (shouldUseStaleWikiCache(e)) {
      const stale = wikiHttpCacheGet<T>(url)
      if (stale != null) {
        if (import.meta.env.DEV) {
          console.warn('[Odyssey Calc] Using cached wiki response (API unavailable):', url.slice(0, 160))
        }
        return stale
      }
    }
    throw e
  }
}
