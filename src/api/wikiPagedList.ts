/** Wiki list endpoints sometimes return `data: null` instead of `[]`. */
export type WikiPagedList<T> = {
  data: T[]
  page: number
  per_page: number
  total: number
  total_pages: number
}

export function normalizeWikiPagedList<T>(raw: {
  data?: T[] | null
  page?: number
  per_page?: number
  total?: number
  total_pages?: number
}): WikiPagedList<T> {
  return {
    data: Array.isArray(raw.data) ? raw.data : [],
    page: Number(raw.page) || 1,
    per_page: Number(raw.per_page) || 0,
    total: Number(raw.total) || 0,
    total_pages: Number(raw.total_pages) || 0,
  }
}
