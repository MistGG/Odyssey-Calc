import type { TierListCache } from './tierList'

export type PublishedTierListSnapshot = {
  updated_at: string
  cache: TierListCache
}

export type PublishedTierChangeHistory = {
  updated_at: string
  runs: unknown[]
}

function publishedTierListUrl(): string {
  const base = import.meta.env.BASE_URL || '/'
  return `${base}data/tier-list-live.json`
}

function publishedTierHistoryUrl(): string {
  const base = import.meta.env.BASE_URL || '/'
  return `${base}data/tier-change-history.json`
}

export async function fetchPublishedTierListSnapshot(): Promise<{
  snapshot: PublishedTierListSnapshot | null
  error: string | null
}> {
  try {
    const res = await fetch(publishedTierListUrl(), { cache: 'no-store' })
    if (!res.ok) {
      if (res.status === 404) return { snapshot: null, error: null }
      return { snapshot: null, error: `Published tier list HTTP ${res.status}` }
    }
    const raw = (await res.json()) as PublishedTierListSnapshot
    if (!raw?.cache || typeof raw.updated_at !== 'string') {
      return { snapshot: null, error: 'Invalid published tier list payload.' }
    }
    return { snapshot: raw, error: null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { snapshot: null, error: msg }
  }
}

export async function fetchPublishedTierChangeHistory(): Promise<{
  history: PublishedTierChangeHistory | null
  error: string | null
}> {
  try {
    const res = await fetch(publishedTierHistoryUrl(), { cache: 'no-store' })
    if (!res.ok) {
      if (res.status === 404) return { history: null, error: null }
      return { history: null, error: `Published tier history HTTP ${res.status}` }
    }
    const raw = (await res.json()) as PublishedTierChangeHistory
    if (!Array.isArray(raw?.runs) || typeof raw.updated_at !== 'string') {
      return { history: null, error: 'Invalid published tier history payload.' }
    }
    return { history: raw, error: null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { history: null, error: msg }
  }
}
