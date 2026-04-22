import { WIKI_API_BASE } from '../config/env'
import type { WikiDigimonDetail, WikiDigimonListResponse } from '../types/wikiApi'
import { fetchJson } from './http'

const base = WIKI_API_BASE.replace(/\/$/, '')

export type DigimonFilters = {
  role?: string
  stage?: string
  element?: string
  attribute?: string
  /** Wiki may filter by family type name when supported. */
  family?: string
  /** Numeric rank index (wiki sprite row/col); passed as `rank` query param when set. */
  rank?: string
}

/**
 * `new URL('/api/wiki/digimon')` throws in the browser (invalid URL). Relative
 * bases must be resolved against the page origin (e.g. Vite dev + proxy).
 */
function wikiDigimonEndpoint(): URL {
  const href = `${base}/digimon`
  if (/^https?:\/\//i.test(href)) return new URL(href)
  return new URL(href, window.location.origin)
}

/** API uses 1-based `page` (e.g. `?page=1&per_page=500`). */
export function wikiDigimonListUrl(
  pageOneBased: number,
  perPage: number,
  searchQuery?: string,
  filters?: DigimonFilters,
) {
  const u = wikiDigimonEndpoint()
  u.searchParams.set('page', String(pageOneBased))
  u.searchParams.set('per_page', String(perPage))
  const q = searchQuery?.trim()
  if (q) u.searchParams.set('q', q)
  if (filters?.role) u.searchParams.set('role', filters.role)
  if (filters?.stage) u.searchParams.set('stage', filters.stage)
  if (filters?.element) u.searchParams.set('element', filters.element)
  if (filters?.attribute) u.searchParams.set('attribute', filters.attribute)
  if (filters?.family) u.searchParams.set('family', filters.family)
  const rk = filters?.rank?.trim()
  if (rk !== undefined && rk !== '') u.searchParams.set('rank', rk)
  return u.toString()
}

export function wikiDigimonDetailUrl(id: string) {
  const u = wikiDigimonEndpoint()
  u.searchParams.set('id', id)
  return u.toString()
}

export async function fetchDigimonPage(
  pageZeroBased: number,
  perPage: number,
  searchQuery?: string,
  filters?: DigimonFilters,
) {
  const page = pageZeroBased + 1
  return fetchJson<WikiDigimonListResponse>(
    wikiDigimonListUrl(page, perPage, searchQuery, filters),
  )
}

export async function fetchDigimonDetail(id: string) {
  return fetchJson<WikiDigimonDetail>(wikiDigimonDetailUrl(id))
}
