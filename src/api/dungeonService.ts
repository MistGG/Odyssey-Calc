import { WIKI_API_BASE, WIKI_SITE_ORIGIN } from '../config/env'
import type { WikiDungeonDetail, WikiDungeonListResponse } from '../types/wikiApi'
import { fetchJson } from './http'

const base = WIKI_API_BASE.replace(/\/$/, '')

function wikiDungeonsEndpoint(): URL {
  const href = `${base}/dungeons`
  if (/^https?:\/\//i.test(href)) return new URL(href)
  return new URL(href, window.location.origin)
}

export function wikiDungeonsListUrl(pageOneBased: number, perPage: number) {
  const u = wikiDungeonsEndpoint()
  u.searchParams.set('page', String(pageOneBased))
  u.searchParams.set('per_page', String(perPage))
  return u.toString()
}

export async function fetchWikiDungeonsPage(pageZeroBased = 0, perPage = 500) {
  return fetchJson<WikiDungeonListResponse>(wikiDungeonsListUrl(pageZeroBased + 1, perPage))
}

export async function fetchAllWikiDungeons(perPage = 500) {
  const first = await fetchWikiDungeonsPage(0, perPage)
  const all = [...first.data]
  for (let p = 2; p <= Math.max(1, first.total_pages || 1); p += 1) {
    const next = await fetchWikiDungeonsPage(p - 1, perPage)
    all.push(...next.data)
  }
  return all
}

export function wikiDungeonDetailUrl(id: string) {
  const u = wikiDungeonsEndpoint()
  u.searchParams.set('id', id)
  return u.toString()
}

export async function fetchWikiDungeonDetail(id: string) {
  return fetchJson<WikiDungeonDetail>(wikiDungeonDetailUrl(id))
}

export function wikiDungeonPageUrl(id: string) {
  return `${WIKI_SITE_ORIGIN}/wiki#dungeon/${encodeURIComponent(id)}`
}
