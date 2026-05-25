import { WIKI_API_BASE } from '../config/env'
import type { WikiNpcDetail } from '../types/wikiApi'
import { fetchJson } from './http'

const base = WIKI_API_BASE.replace(/\/$/, '')

function wikiNpcEndpoint(): URL {
  const href = `${base}/npcs`
  if (/^https?:\/\//i.test(href)) return new URL(href)
  return new URL(href, window.location.origin)
}

export function wikiNpcDetailUrl(id: string) {
  const u = wikiNpcEndpoint()
  u.searchParams.set('id', id)
  return u.toString()
}

export async function fetchWikiNpcDetail(id: string) {
  return fetchJson<WikiNpcDetail>(wikiNpcDetailUrl(id))
}
