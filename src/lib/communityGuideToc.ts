import { slugifyCommunityGuideTitle } from './communityGuideEmbed'
import {
  mergeCommunityGuideTableChunks,
  parseCommunityGuideTableBlock,
} from './communityGuideMarkdownTable'

export type CommunityGuideHeadingLevel = 2 | 3 | 4

export type CommunityGuideTocEntry = {
  id: string
  level: CommunityGuideHeadingLevel
  /** Plain-text label for the sidebar. */
  title: string
  /** Raw markdown heading text (without # prefix). */
  raw: string
}

const HEADING_CHUNK_RE = /^(#{2,4})\s+(.+?)\s*$/

/** Strip common inline markdown / embeds so TOC labels stay readable. */
export function plainCommunityGuideHeadingText(raw: string): string {
  return raw
    .replace(/\[\[(?:item|quest|digimon):([^|\]]+)(?:\|([^\]]+))?\]\]/g, (_, id, label) =>
      String(label || id).trim(),
    )
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<\/?span[^>]*>/gi, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Parse a blank-line-delimited chunk that is exactly one ## / ### / #### heading. */
export function parseCommunityGuideHeadingChunk(
  chunk: string,
): { level: CommunityGuideHeadingLevel; raw: string } | null {
  const lines = chunk
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length !== 1) return null
  const match = lines[0]!.match(HEADING_CHUNK_RE)
  if (!match) return null
  const level = match[1]!.length as CommunityGuideHeadingLevel
  const raw = match[2]!.trim()
  if (!raw || level < 2 || level > 4) return null
  return { level, raw }
}

function allocateHeadingId(title: string, used: Map<string, number>): string {
  const base = slugifyCommunityGuideTitle(title)
  const seen = used.get(base) ?? 0
  used.set(base, seen + 1)
  return seen === 0 ? base : `${base}-${seen + 1}`
}

/**
 * Collect ## / ### / #### headings for the chapters sidebar.
 * Only standalone heading paragraphs count (same rule as the body renderer).
 * Table title preambles are excluded so they don't create orphan TOC links.
 */
export function extractCommunityGuideToc(body: string): CommunityGuideTocEntry[] {
  const normalized = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!normalized.trim()) return []

  const chunks = mergeCommunityGuideTableChunks(
    normalized
      .split(/\n{2,}/)
      .map((chunk) => chunk.replace(/^\n+|\n+$/g, ''))
      .filter((chunk) => chunk.trim()),
  )

  const used = new Map<string, number>()
  const entries: CommunityGuideTocEntry[] = []

  for (const chunk of chunks) {
    if (parseCommunityGuideTableBlock(chunk)) continue
    const heading = parseCommunityGuideHeadingChunk(chunk)
    if (!heading) continue
    const title = plainCommunityGuideHeadingText(heading.raw) || heading.raw
    entries.push({
      id: allocateHeadingId(title, used),
      level: heading.level,
      title,
      raw: heading.raw,
    })
  }

  return entries
}

/** Build heading id → entry map in document order (for renderer id attrs). */
export function communityGuideHeadingIdQueue(body: string): string[] {
  return extractCommunityGuideToc(body).map((entry) => entry.id)
}

export function communityGuideHeadingDepth(
  level: CommunityGuideHeadingLevel,
): 'chapter' | 'sub' | 'sub2' {
  if (level === 2) return 'chapter'
  if (level === 3) return 'sub'
  return 'sub2'
}
