import { WIKI_API_BASE, WIKI_SITE_ORIGIN } from '../config/env'
import type { WikiQuestDetail } from '../types/wikiApi'
import { fetchJson } from './http'

const base = WIKI_API_BASE.replace(/\/$/, '')

function wikiQuestEndpoint(): URL {
  const href = `${base}/quests`
  if (/^https?:\/\//i.test(href)) return new URL(href)
  return new URL(href, window.location.origin)
}

export function wikiQuestDetailUrl(id: string) {
  const u = wikiQuestEndpoint()
  u.searchParams.set('id', id)
  return u.toString()
}

export async function fetchWikiQuestDetail(id: string) {
  return fetchJson<WikiQuestDetail>(wikiQuestDetailUrl(id))
}

/** Public wiki page for a quest (`/wiki#quest/{id}`). */
export function wikiQuestPageUrl(id: string) {
  return `${WIKI_SITE_ORIGIN}/wiki#quest/${encodeURIComponent(id)}`
}
