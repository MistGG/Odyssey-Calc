import type { WikiDigimonListItem } from '../types/wikiApi'

/** Keeps the full Digimon list in memory across Browse unmount (e.g. detail → back). */
let fullListCache: WikiDigimonListItem[] | null = null

export function peekBrowseFullListCache(): WikiDigimonListItem[] | null {
  return fullListCache
}

export function storeBrowseFullListCache(data: WikiDigimonListItem[] | null): void {
  fullListCache = data
}
