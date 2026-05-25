import { WIKI_API_BASE, WIKI_SITE_ORIGIN } from '../config/env'
import type { WikiItemDetail } from '../types/wikiApi'
import { fetchJson } from './http'

const base = WIKI_API_BASE.replace(/\/$/, '')

function wikiItemsEndpoint(): URL {
  const href = `${base}/items`
  if (/^https?:\/\//i.test(href)) return new URL(href)
  return new URL(href, window.location.origin)
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

export async function fetchWikiItemDetail(id: string) {
  return fetchJson<WikiItemDetail>(wikiItemDetailUrl(id))
}
