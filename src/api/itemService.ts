import { WIKI_API_BASE, WIKI_SITE_ORIGIN } from '../config/env'
import type { WikiItemDetail, WikiItemListResponse } from '../types/wikiApi'
import { fetchJson } from './http'
import { normalizeWikiPagedList } from './wikiPagedList'

const base = WIKI_API_BASE.replace(/\/$/, '')

function wikiItemsEndpoint(): URL {
  const href = `${base}/items`
  if (/^https?:\/\//i.test(href)) return new URL(href)
  return new URL(href, window.location.origin)
}

export function wikiItemsListUrl(pageOneBased: number, perPage: number, searchQuery?: string) {
  const u = wikiItemsEndpoint()
  u.searchParams.set('page', String(pageOneBased))
  u.searchParams.set('per_page', String(perPage))
  const q = searchQuery?.trim()
  if (q) u.searchParams.set('q', q)
  return u.toString()
}

export function wikiItemDetailUrl(id: string) {
  const u = wikiItemsEndpoint()
  u.searchParams.set('id', id)
  return u.toString()
}

/** Public wiki page for an item (`/wiki#item/{id}`). */
export function wikiItemPageUrl(id: string) {
  return `${WIKI_SITE_ORIGIN}/wiki#item/${encodeURIComponent(id)}`
}

export async function fetchWikiItemsPage(pageZeroBased = 0, perPage = 50, searchQuery?: string) {
  const raw = await fetchJson<WikiItemListResponse>(
    wikiItemsListUrl(pageZeroBased + 1, perPage, searchQuery),
  )
  return normalizeWikiPagedList(raw)
}

export async function fetchWikiItemDetail(id: string) {
  return fetchJson<WikiItemDetail>(wikiItemDetailUrl(id))
}
