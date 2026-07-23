import { WIKI_API_BASE, WIKI_SITE_ORIGIN } from '../config/env'
import type { WikiQuestDetail, WikiQuestListItem, WikiQuestListResponse } from '../types/wikiApi'
import { fetchJson } from './http'
import { normalizeWikiPagedList } from './wikiPagedList'

const base = WIKI_API_BASE.replace(/\/$/, '')

function wikiQuestEndpoint(): URL {
  const href = `${base}/quests`
  if (/^https?:\/\//i.test(href)) return new URL(href)
  return new URL(href, window.location.origin)
}

export function wikiQuestsListUrl(pageOneBased: number, perPage: number, searchQuery?: string) {
  const u = wikiQuestEndpoint()
  u.searchParams.set('page', String(pageOneBased))
  u.searchParams.set('per_page', String(perPage))
  const q = searchQuery?.trim()
  if (q) u.searchParams.set('q', q)
  return u.toString()
}

export function wikiQuestDetailUrl(id: string) {
  const u = wikiQuestEndpoint()
  u.searchParams.set('id', id)
  return u.toString()
}

export async function fetchWikiQuestDetail(id: string) {
  return fetchJson<WikiQuestDetail>(wikiQuestDetailUrl(id))
}

export async function fetchWikiQuestsPage(pageZeroBased = 0, perPage = 500, searchQuery?: string) {
  const raw = await fetchJson<WikiQuestListResponse>(
    wikiQuestsListUrl(pageZeroBased + 1, perPage, searchQuery),
  )
  return normalizeWikiPagedList(raw)
}

/** Fetches every quest page (used when browsing without a search query). */
export async function fetchAllWikiQuests(perPage = 500): Promise<WikiQuestListItem[]> {
  const first = await fetchWikiQuestsPage(0, perPage)
  const all = [...first.data]
  for (let p = 2; p <= Math.max(1, first.total_pages || 1); p += 1) {
    const next = await fetchWikiQuestsPage(p - 1, perPage)
    all.push(...next.data)
  }
  return all
}

/** Public wiki page for a quest (`/wiki#quest/{id}`). */
export function wikiQuestPageUrl(id: string) {
  return `${WIKI_SITE_ORIGIN}/wiki#quest/${encodeURIComponent(id)}`
}
