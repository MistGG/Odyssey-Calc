export const PATCH_NOTES_SHARE_ID = '2bb157c9-224d-48ab-a6f2-697589ebe97a'

export const PATCH_NOTES_OFFICIAL_URL =
  `https://docs.thedigitalodyssey.com/s/${PATCH_NOTES_SHARE_ID}/?theme=dark`

export type PatchNoteEntry = {
  id: string
  slug: string
  title: string
  text: string
  updatedAt: string | null
  publishedAt: string | null
}

export type PatchNotesCatalog = {
  syncedAt: string
  shareId: string
  officialUrl: string
  entries: PatchNoteEntry[]
}

const CATALOG_PATH = `${import.meta.env.BASE_URL}data/patch-notes/catalog.json`

type OutlineShareTreeNode = {
  id: string
  url: string
  title: string
}

type OutlineDocument = {
  id: string
  url: string
  title: string
  text: string
  updatedAt?: string | null
  publishedAt?: string | null
}

function slugFromDocUrl(url: string): string {
  const match = url.match(/\/doc\/([^/?#]+)/)
  return match?.[1]?.trim() ?? ''
}

async function outlinePost<T>(endpoint: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/outline/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Patch notes API failed (${res.status})${text ? `: ${text.slice(0, 160)}` : ''}`)
  }
  const json = (await res.json()) as { ok?: boolean; data?: T; message?: string }
  if (json.ok === false) throw new Error(json.message || 'Patch notes API error')
  return json.data as T
}

async function fetchLiveCatalog(): Promise<PatchNotesCatalog> {
  const share = await outlinePost<{
    sharedTree?: { children?: OutlineShareTreeNode[] }
  }>('shares.info', { id: PATCH_NOTES_SHARE_ID })

  const children = share.sharedTree?.children ?? []
  const entries: PatchNoteEntry[] = []

  for (const node of children) {
    const doc = await outlinePost<OutlineDocument>('documents.info', {
      id: node.id,
      shareId: PATCH_NOTES_SHARE_ID,
    })
    const slug = slugFromDocUrl(doc.url)
    if (!slug) continue
    entries.push({
      id: doc.id,
      slug,
      title: doc.title?.trim() || node.title?.trim() || slug,
      text: doc.text ?? '',
      updatedAt: doc.updatedAt ?? doc.publishedAt ?? null,
      publishedAt: doc.publishedAt ?? null,
    })
  }

  return {
    syncedAt: new Date().toISOString(),
    shareId: PATCH_NOTES_SHARE_ID,
    officialUrl: PATCH_NOTES_OFFICIAL_URL,
    entries,
  }
}

async function fetchStaticCatalog(): Promise<PatchNotesCatalog> {
  const res = await fetch(CATALOG_PATH)
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? 'Patch notes catalog is missing. Run npm run sync:patch-notes.'
        : `Could not load patch notes (${res.status}).`,
    )
  }
  return res.json() as Promise<PatchNotesCatalog>
}

export async function loadPatchNotesCatalog(): Promise<PatchNotesCatalog> {
  if (import.meta.env.DEV) {
    try {
      return await fetchLiveCatalog()
    } catch {
      return fetchStaticCatalog()
    }
  }
  return fetchStaticCatalog()
}

export function patchNoteDateLabel(entry: PatchNoteEntry): string {
  const fromTitle = entry.title.match(/\[?(\d{4}-\d{2}-\d{2})\]?/)
  if (fromTitle?.[1]) return fromTitle[1]
  const fromSlug = entry.slug.match(/^(\d{4}-\d{2}-\d{2})/)
  if (fromSlug?.[1]) return fromSlug[1]
  const iso = entry.publishedAt || entry.updatedAt
  if (iso) return iso.slice(0, 10)
  return ''
}

export function patchNoteDisplayTitle(entry: PatchNoteEntry): string {
  const title = entry.title.trim()
  const stripped = title.replace(/^\[?\d{4}-\d{2}-\d{2}\]?\s*/i, '').trim()
  return stripped || title || entry.slug
}

export function patchNoteKind(entry: PatchNoteEntry): 'hotfix' | 'update' {
  const hay = `${entry.title} ${entry.slug}`.toLowerCase()
  if (hay.includes('hotfix') || hay.includes('hot fix')) return 'hotfix'
  return 'update'
}
