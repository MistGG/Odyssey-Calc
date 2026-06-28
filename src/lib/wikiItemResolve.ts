import { fetchWikiItemDetail, fetchWikiItemsPage } from '../api/itemService'
import type { WikiItemListItem } from '../types/wikiApi'

export function isWikiItemId(value: string): boolean {
  return /^i[a-z0-9]+$/i.test(value.trim())
}

export async function resolveWikiItemByNameOrId(
  nameOrId: string,
  labelFallback?: string,
): Promise<WikiItemListItem | null> {
  const trimmed = nameOrId.trim()
  if (!trimmed) return null

  if (isWikiItemId(trimmed)) {
    try {
      const detail = await fetchWikiItemDetail(trimmed)
      return {
        id: detail.id,
        name: detail.name,
        description: detail.description,
        type: detail.type,
        type_name: detail.type_name,
        sub_type: detail.sub_type,
        icon_id: detail.icon_id,
      }
    } catch {
      return null
    }
  }

  const query = labelFallback?.trim() || trimmed
  try {
    const response = await fetchWikiItemsPage(0, 20, query)
    const lower = query.toLowerCase()
    return (
      response.data.find((item) => item.name.trim().toLowerCase() === lower) ??
      response.data.find((item) => item.name.trim().toLowerCase().includes(lower)) ??
      response.data[0] ??
      null
    )
  } catch {
    return null
  }
}
