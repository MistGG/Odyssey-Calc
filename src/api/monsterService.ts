import { WIKI_API_BASE, WIKI_SITE_ORIGIN } from '../config/env'
import type { WikiMonsterDetail } from '../types/wikiApi'
import { fetchJson } from './http'

const base = WIKI_API_BASE.replace(/\/$/, '')

function wikiMonstersEndpoint(): URL {
  const href = `${base}/monsters`
  if (/^https?:\/\//i.test(href)) return new URL(href)
  return new URL(href, window.location.origin)
}

export function wikiMonsterDetailUrl(id: string) {
  const u = wikiMonstersEndpoint()
  u.searchParams.set('id', id)
  return u.toString()
}

/** Public wiki page for a monster (`/wiki#monster/{id}`). */
export function wikiMonsterPageUrl(id: string) {
  return `${WIKI_SITE_ORIGIN}/wiki#monster/${encodeURIComponent(id)}`
}

export async function fetchWikiMonsterDetail(id: string) {
  return fetchJson<WikiMonsterDetail>(wikiMonsterDetailUrl(id))
}
